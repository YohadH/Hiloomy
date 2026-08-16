// ROAS-collapse detection engine.
//
// Fires when a Meta campaign has burned real money (>= MIN_SPEND_THRESHOLD)
// over the window and its ROAS sits below the "good" band from the
// recommendation engine. The point isn't to flag every weak campaign —
// it's to flag the ones bleeding budget that the founder is most likely to
// be unaware of because the daily spend looks fine in isolation.
//
// Detection bar:
//   spend         ≥ MIN_SPEND_THRESHOLD (₪500 default)
//   roas          < roasGoodMin (3x default, from DEFAULT_TARGETS)
//   purchaseRoas  not null (need real data)
//
// Severity tiers:
//   critical  → ROAS < 1.5x  (losing money, the spend is destroying margin)
//   critical  → ROAS < 2x  AND spend ≥ ₪2000  (large blast radius)
//   high      → ROAS < 2x
//   medium    → 2x ≤ ROAS < 3x
//
// What this gives the founder: a Command Center card pointing at one
// specific campaign with a prescribed action ("cut tomorrow if no
// recovery" or "halve budget + test new creative"), one alert per
// campaign, fingerprint stable so it doesn't duplicate across re-runs.

import {
  buildMetaAdsWeeklyReport,
  type MetaAdsWeeklyReport
} from "@/lib/services/meta-ads-report-service";
import {
  upsertAlert,
  resolveStaleAlerts,
  type AlertSeverity
} from "@/lib/services/alert-writer-service";
import {
  DEFAULT_TARGETS,
  type RoasTargets
} from "@/lib/services/recommendation-engine-service";

export interface RoasCollapseFlag {
  campaignId: string;
  campaignName: string;
  brandName: string;
  spend: number;
  purchases: number;
  roas: number;
  severity: AlertSeverity;
  suggestedAction: { he: string; en: string };
}

export interface RoasCollapseReport {
  flags: RoasCollapseFlag[];
  campaignsConsidered: number;
  campaignsBelowMinSpend: number;
}

export interface BuildRoasCollapseInput {
  storeId: string;
  start: Date;
  end: Date;
  targets?: RoasTargets;
}

const MIN_SPEND_THRESHOLD = 500; // ₪ — under this we treat as noise

export async function buildRoasCollapseReport(
  input: BuildRoasCollapseInput
): Promise<RoasCollapseReport> {
  const targets = input.targets ?? DEFAULT_TARGETS;
  const report = await buildMetaAdsWeeklyReport({
    storeId: input.storeId,
    start: input.start,
    end: input.end
  });
  if (!report) {
    return { flags: [], campaignsConsidered: 0, campaignsBelowMinSpend: 0 };
  }

  const flags: RoasCollapseFlag[] = [];
  let considered = 0;
  let belowMinSpend = 0;
  for (const brand of report.brands) {
    for (const campaign of brand.campaigns) {
      considered += 1;
      if (campaign.spend < MIN_SPEND_THRESHOLD) {
        belowMinSpend += 1;
        continue;
      }
      const roas = campaign.purchaseRoas;
      if (roas == null) continue;
      if (roas >= targets.roasGoodMin) continue;

      // Severity classification.
      let severity: AlertSeverity;
      if (roas < 1.5) {
        severity = "critical";
      } else if (roas < 2 && campaign.spend >= 2000) {
        severity = "critical";
      } else if (roas < 2) {
        severity = "high";
      } else {
        severity = "medium";
      }

      const fmtIls = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
      const suggestedAction = {
        he:
          severity === "critical"
            ? `ROAS ${roas.toFixed(2)}x מתחת לסף ${targets.roasGoodMin}x עם הוצאה של ${fmtIls(campaign.spend)}. לעצור או לחצות את התקציב עד לבדיקת קריאייטיב חדש (24-48 שעות).`
            : severity === "high"
              ? `ROAS ${roas.toFixed(2)}x מתחת לסף ${targets.roasGoodMin}x. לחצות את התקציב ולהריץ קריאייטיב חלופי השבוע.`
              : `ROAS ${roas.toFixed(2)}x מתחת לסף ${targets.roasGoodMin}x. לבדוק תוך 48 שעות אם נחוצה החלפת קריאייטיב.`,
        en:
          severity === "critical"
            ? `ROAS ${roas.toFixed(2)}x is below the ${targets.roasGoodMin}x target with ${fmtIls(campaign.spend)} spent. Pause or halve budget pending a new creative test within 24-48h.`
            : severity === "high"
              ? `ROAS ${roas.toFixed(2)}x is below the ${targets.roasGoodMin}x target. Halve budget and run an alternative creative this week.`
              : `ROAS ${roas.toFixed(2)}x is below the ${targets.roasGoodMin}x target. Decide within 48h whether a creative swap is needed.`
      };

      flags.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        brandName: brand.name,
        spend: campaign.spend,
        purchases: campaign.purchases,
        roas,
        severity,
        suggestedAction
      });
    }
  }

  flags.sort((a, b) => a.roas - b.roas); // worst first

  const writtenFingerprints: string[] = [];
  for (const f of flags) {
    const fp = `roas_collapse:${f.campaignId}`;
    writtenFingerprints.push(fp);
    const fmtIls = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
    await upsertAlert({
      storeId: input.storeId,
      type: "roas_collapse",
      fingerprint: fp,
      severity: f.severity,
      source: "Meta",
      detectedBy: "roas-collapse-service",
      title: `${f.campaignName} — ROAS נמוך`,
      description: `הוצאה ${fmtIls(f.spend)} · ${f.purchases} רכישות · ROAS ${f.roas.toFixed(2)}x (יעד ${targets.roasGoodMin}x).`,
      recommendedAction: f.suggestedAction.he,
      metricName: "purchase_roas",
      currentValue: f.roas,
      previousValue: targets.roasGoodMin,
      relatedEntityType: "campaign",
      relatedEntityId: f.campaignId,
      payloadJson: {
        brandName: f.brandName,
        campaignName: f.campaignName,
        spend: f.spend,
        purchases: f.purchases,
        roas: f.roas,
        suggestedAction: f.suggestedAction,
        target: targets.roasGoodMin
      },
      periodLabel: `${input.start.toISOString().slice(0, 10)} → ${input.end.toISOString().slice(0, 10)}`
    }).catch((err) => {
      console.error("[roas-collapse] alert-writer upsert failed:", err);
    });
  }
  await resolveStaleAlerts({
    storeId: input.storeId,
    detectedBy: "roas-collapse-service",
    type: "roas_collapse",
    keepFingerprints: writtenFingerprints
  }).catch((err) => {
    console.error("[roas-collapse] alert-writer sweep failed:", err);
  });

  return { flags, campaignsConsidered: considered, campaignsBelowMinSpend: belowMinSpend };
}

// Helper for re-using a single MetaAdsWeeklyReport across the bundle so we
// don't re-fetch from the Meta Insights API for the collapse detector.
// Callers that already built the report (e.g. weekly-report-service) can
// pass it via `prebuiltReport`.
export async function buildRoasCollapseFromReport(input: {
  storeId: string;
  report: MetaAdsWeeklyReport;
  window: { start: Date; end: Date };
  targets?: RoasTargets;
}): Promise<RoasCollapseReport> {
  const targets = input.targets ?? DEFAULT_TARGETS;
  const flags: RoasCollapseFlag[] = [];
  let considered = 0;
  let belowMinSpend = 0;
  for (const brand of input.report.brands) {
    for (const campaign of brand.campaigns) {
      considered += 1;
      if (campaign.spend < MIN_SPEND_THRESHOLD) {
        belowMinSpend += 1;
        continue;
      }
      const roas = campaign.purchaseRoas;
      if (roas == null) continue;
      if (roas >= targets.roasGoodMin) continue;
      let severity: AlertSeverity;
      if (roas < 1.5) severity = "critical";
      else if (roas < 2 && campaign.spend >= 2000) severity = "critical";
      else if (roas < 2) severity = "high";
      else severity = "medium";
      const fmtIls = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
      flags.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        brandName: brand.name,
        spend: campaign.spend,
        purchases: campaign.purchases,
        roas,
        severity,
        suggestedAction: {
          he:
            severity === "critical"
              ? `ROAS ${roas.toFixed(2)}x עם הוצאה של ${fmtIls(campaign.spend)}. לעצור או לחצות תקציב.`
              : `ROAS ${roas.toFixed(2)}x מתחת ל-${targets.roasGoodMin}x. לחצות תקציב או להחליף קריאייטיב.`,
          en:
            severity === "critical"
              ? `ROAS ${roas.toFixed(2)}x with ${fmtIls(campaign.spend)} spent — pause or halve.`
              : `ROAS ${roas.toFixed(2)}x below ${targets.roasGoodMin}x target — halve budget or swap creative.`
        }
      });
    }
  }
  flags.sort((a, b) => a.roas - b.roas);

  const writtenFingerprints: string[] = [];
  for (const f of flags) {
    const fp = `roas_collapse:${f.campaignId}`;
    writtenFingerprints.push(fp);
    const fmtIls = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
    await upsertAlert({
      storeId: input.storeId,
      type: "roas_collapse",
      fingerprint: fp,
      severity: f.severity,
      source: "Meta",
      detectedBy: "roas-collapse-service",
      title: `${f.campaignName} — ROAS נמוך`,
      description: `הוצאה ${fmtIls(f.spend)} · ${f.purchases} רכישות · ROAS ${f.roas.toFixed(2)}x (יעד ${targets.roasGoodMin}x).`,
      recommendedAction: f.suggestedAction.he,
      metricName: "purchase_roas",
      currentValue: f.roas,
      previousValue: targets.roasGoodMin,
      relatedEntityType: "campaign",
      relatedEntityId: f.campaignId,
      payloadJson: {
        brandName: f.brandName,
        campaignName: f.campaignName,
        spend: f.spend,
        purchases: f.purchases,
        roas: f.roas,
        suggestedAction: f.suggestedAction,
        target: targets.roasGoodMin
      },
      periodLabel: `${input.window.start.toISOString().slice(0, 10)} → ${input.window.end.toISOString().slice(0, 10)}`
    }).catch((err) => {
      console.error("[roas-collapse] alert-writer upsert failed:", err);
    });
  }
  await resolveStaleAlerts({
    storeId: input.storeId,
    detectedBy: "roas-collapse-service",
    type: "roas_collapse",
    keepFingerprints: writtenFingerprints
  }).catch((err) => {
    console.error("[roas-collapse] alert-writer sweep failed:", err);
  });

  return { flags, campaignsConsidered: considered, campaignsBelowMinSpend: belowMinSpend };
}
