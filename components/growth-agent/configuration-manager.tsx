"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GrowthAgentSettings } from "@/lib/domain/growth-agent-types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="space-y-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input type="number" value={value} step={step} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-border bg-background px-4 py-3" />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="space-y-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-4 py-3" />
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
    </label>
  );
}

export function GrowthAgentConfigurationManager({
  initialSettings,
  storeId
}: {
  initialSettings: GrowthAgentSettings;
  storeId: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/growth-agent/configuration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings, storeId })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Save failed");
        setMessage("Growth Agent configuration saved.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Core agent behavior</CardTitle>
          <CardDescription>Enable the agent, choose its operating mode, and define scan frequency.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <ToggleField label="Agent enabled" checked={settings.agentEnabled} onChange={(agentEnabled) => setSettings((current) => ({ ...current, agentEnabled }))} />
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Mode</span>
            <select value={settings.agentMode} onChange={(event) => setSettings((current) => ({ ...current, agentMode: event.target.value as GrowthAgentSettings["agentMode"] }))} className="w-full rounded-xl border border-border bg-background px-4 py-3">
              <option value="recommendation_only">Recommendation Only</option>
              <option value="approval_required">Approval Required</option>
              <option value="auto_execute">Auto Execute With Guardrails</option>
            </select>
          </label>
          <NumberField label="Check frequency (minutes)" value={settings.checkFrequencyMinutes} onChange={(checkFrequencyMinutes) => setSettings((current) => ({ ...current, checkFrequencyMinutes }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <NumberField label="Sessions drop %" value={settings.thresholds.sessionsDropPercent} onChange={(value) => setSettings((current) => ({ ...current, thresholds: { ...current.thresholds, sessionsDropPercent: value } }))} />
          <NumberField label="Orders drop %" value={settings.thresholds.ordersDropPercent} onChange={(value) => setSettings((current) => ({ ...current, thresholds: { ...current.thresholds, ordersDropPercent: value } }))} />
          <NumberField label="Conversion rate drop %" value={settings.thresholds.conversionRateDropPercent} onChange={(value) => setSettings((current) => ({ ...current, thresholds: { ...current.thresholds, conversionRateDropPercent: value } }))} />
          <NumberField label="AOV drop %" value={settings.thresholds.aovDropPercent} onChange={(value) => setSettings((current) => ({ ...current, thresholds: { ...current.thresholds, aovDropPercent: value } }))} />
          <NumberField label="Returning customer drop %" value={settings.thresholds.returningCustomerDropPercent} onChange={(value) => setSettings((current) => ({ ...current, thresholds: { ...current.thresholds, returningCustomerDropPercent: value } }))} />
          <NumberField label="Traffic source drop %" value={settings.thresholds.trafficSourceDropPercent} onChange={(value) => setSettings((current) => ({ ...current, thresholds: { ...current.thresholds, trafficSourceDropPercent: value } }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparison windows</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <ToggleField label="Compare to yesterday" checked={settings.comparisonWindows.compareToYesterday} onChange={(value) => setSettings((current) => ({ ...current, comparisonWindows: { ...current.comparisonWindows, compareToYesterday: value } }))} />
          <ToggleField label="Compare to last 7 days" checked={settings.comparisonWindows.compareToLast7Days} onChange={(value) => setSettings((current) => ({ ...current, comparisonWindows: { ...current.comparisonWindows, compareToLast7Days: value } }))} />
          <ToggleField label="Compare to same weekday last week" checked={settings.comparisonWindows.compareToSameWeekdayLastWeek} onChange={(value) => setSettings((current) => ({ ...current, comparisonWindows: { ...current.comparisonWindows, compareToSameWeekdayLastWeek: value } }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels and notifications</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium">Channels</p>
            <ToggleField label="Shopify" checked={settings.channels.shopify} onChange={(value) => setSettings((current) => ({ ...current, channels: { ...current.channels, shopify: value } }))} />
            <ToggleField label="Meta Ads" checked={settings.channels.metaAds} onChange={(value) => setSettings((current) => ({ ...current, channels: { ...current.channels, metaAds: value } }))} />
            <ToggleField label="Instagram" checked={settings.channels.instagram} onChange={(value) => setSettings((current) => ({ ...current, channels: { ...current.channels, instagram: value } }))} />
            <ToggleField label="Facebook" checked={settings.channels.facebook} onChange={(value) => setSettings((current) => ({ ...current, channels: { ...current.channels, facebook: value } }))} />
            <ToggleField label="TikTok" checked={settings.channels.tiktok} onChange={(value) => setSettings((current) => ({ ...current, channels: { ...current.channels, tiktok: value } }))} />
            <ToggleField label="Google Analytics" checked={settings.channels.googleAnalytics} onChange={(value) => setSettings((current) => ({ ...current, channels: { ...current.channels, googleAnalytics: value } }))} />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Notifications</p>
            <ToggleField label="Email" checked={settings.notifications.email} onChange={(value) => setSettings((current) => ({ ...current, notifications: { ...current.notifications, email: value } }))} />
            <ToggleField label="In app" checked={settings.notifications.inApp} onChange={(value) => setSettings((current) => ({ ...current, notifications: { ...current.notifications, inApp: value } }))} />
            <ToggleField label="Slack" checked={settings.notifications.slack} onChange={(value) => setSettings((current) => ({ ...current, notifications: { ...current.notifications, slack: value } }))} />
            <ToggleField label="Webhook" checked={settings.notifications.webhook} onChange={(value) => setSettings((current) => ({ ...current, notifications: { ...current.notifications, webhook: value } }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product discovery crawler</CardTitle>
          <CardDescription>Add Zendrop-style supplier, catalog, or product-listing URLs so the agent can crawl them and suggest products that fit your store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleField label="Enable product crawler" checked={settings.productResearch.enabled} onChange={(value) => setSettings((current) => ({ ...current, productResearch: { ...current.productResearch, enabled: value } }))} />
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <TextAreaField label="Source URLs" value={settings.productResearch.sourceUrls} onChange={(value) => setSettings((current) => ({ ...current, productResearch: { ...current.productResearch, sourceUrls: value } }))} placeholder={"https://supplier-site.com/collections/winners\nhttps://supplier-site.com/products/trending-item"} rows={5} />
            <div className="space-y-4">
              <TextAreaField label="Niche keywords" value={settings.productResearch.nicheKeywords} onChange={(value) => setSettings((current) => ({ ...current, productResearch: { ...current.productResearch, nicheKeywords: value } }))} placeholder="fitness, posture, home office, recovery" rows={5} />
              <NumberField label="Max recommendations" value={settings.productResearch.maxRecommendations} onChange={(value) => setSettings((current) => ({ ...current, productResearch: { ...current.productResearch, maxRecommendations: value } }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guardrails</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <NumberField label="Max daily ad budget" value={settings.guardrails.maxDailyAdBudget} onChange={(value) => setSettings((current) => ({ ...current, guardrails: { ...current.guardrails, maxDailyAdBudget: value } }))} />
          <NumberField label="Max single action budget" value={settings.guardrails.maxSingleActionBudget} onChange={(value) => setSettings((current) => ({ ...current, guardrails: { ...current.guardrails, maxSingleActionBudget: value } }))} />
          <NumberField label="Min confidence score" value={settings.guardrails.minConfidenceScore} step={0.01} onChange={(value) => setSettings((current) => ({ ...current, guardrails: { ...current.guardrails, minConfidenceScore: value } }))} />
          <NumberField label="Minimum inventory threshold" value={settings.guardrails.minimumInventoryThreshold} onChange={(value) => setSettings((current) => ({ ...current, guardrails: { ...current.guardrails, minimumInventoryThreshold: value } }))} />
          <NumberField label="Cooldown minutes" value={settings.guardrails.cooldownMinutesBetweenActions} onChange={(value) => setSettings((current) => ({ ...current, guardrails: { ...current.guardrails, cooldownMinutesBetweenActions: value } }))} />
          <div className="space-y-3 md:col-span-2 xl:col-span-1">
            <ToggleField label="Require inventory available" checked={settings.guardrails.requireInventoryAvailable} onChange={(value) => setSettings((current) => ({ ...current, guardrails: { ...current.guardrails, requireInventoryAvailable: value } }))} />
            <ToggleField label="Block if tracking confidence is low" checked={settings.guardrails.blockIfTrackingConfidenceLow} onChange={(value) => setSettings((current) => ({ ...current, guardrails: { ...current.guardrails, blockIfTrackingConfidenceLow: value } }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allowed actions and approvals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium">Allowed actions</p>
            <ToggleField label="Send alert" checked={settings.allowedActions.sendAlert} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, sendAlert: value } }))} />
            <ToggleField label="Create recommendation" checked={settings.allowedActions.createRecommendation} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, createRecommendation: value } }))} />
            <ToggleField label="Create creative brief" checked={settings.allowedActions.createCreativeBrief} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, createCreativeBrief: value } }))} />
            <ToggleField label="Draft organic post" checked={settings.allowedActions.draftOrganicPost} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, draftOrganicPost: value } }))} />
            <ToggleField label="Publish organic post" checked={settings.allowedActions.publishOrganicPost} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, publishOrganicPost: value } }))} />
            <ToggleField label="Create ad campaign draft" checked={settings.allowedActions.createAdCampaignDraft} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, createAdCampaignDraft: value } }))} />
            <ToggleField label="Launch ad campaign" checked={settings.allowedActions.launchAdCampaign} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, launchAdCampaign: value } }))} />
            <ToggleField label="Scale existing campaign" checked={settings.allowedActions.scaleExistingCampaign} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, scaleExistingCampaign: value } }))} />
            <ToggleField label="Pause campaign" checked={settings.allowedActions.pauseCampaign} onChange={(value) => setSettings((current) => ({ ...current, allowedActions: { ...current.allowedActions, pauseCampaign: value } }))} />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Approval rules</p>
            <NumberField label="Require approval above budget" value={settings.approvalRules.requireApprovalAboveBudget} onChange={(value) => setSettings((current) => ({ ...current, approvalRules: { ...current.approvalRules, requireApprovalAboveBudget: value } }))} />
            <ToggleField label="Require approval for campaign launch" checked={settings.approvalRules.requireApprovalForCampaignLaunch} onChange={(value) => setSettings((current) => ({ ...current, approvalRules: { ...current.approvalRules, requireApprovalForCampaignLaunch: value } }))} />
            <ToggleField label="Require approval for scaling" checked={settings.approvalRules.requireApprovalForScaling} onChange={(value) => setSettings((current) => ({ ...current, approvalRules: { ...current.approvalRules, requireApprovalForScaling: value } }))} />
            <ToggleField label="Require approval for publishing post" checked={settings.approvalRules.requireApprovalForPublishingPost} onChange={(value) => setSettings((current) => ({ ...current, approvalRules: { ...current.approvalRules, requireApprovalForPublishingPost: value } }))} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={isPending}>{isPending ? "Saving..." : "Save settings"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.refresh()} disabled={isPending}>Reset view</Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}

