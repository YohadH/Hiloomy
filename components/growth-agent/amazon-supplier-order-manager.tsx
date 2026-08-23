"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AmazonSupplierOrderDraft,
  AmazonSupplierOrdersWorkspace,
  AmazonSupplierProductMapping,
  GrowthProductRecommendation
} from "@/lib/domain/growth-agent-types";

interface AmazonSupplierOrderManagerProps {
  workspace: AmazonSupplierOrdersWorkspace;
  locale?: "he" | "en";
}

function getInitialMappingState(recommendations: GrowthProductRecommendation[], mappings: AmazonSupplierProductMapping[]) {
  return recommendations.reduce<Record<string, { amazonAsin: string; supplierUrl: string; shopifyProductTitle: string; notes: string }>>((acc, recommendation) => {
    const mapping = mappings.find((item) => item.recommendationId === recommendation.id);
    acc[recommendation.id] = {
      amazonAsin: mapping?.amazonAsin ?? "",
      supplierUrl: mapping?.supplierUrl ?? recommendation.sourceUrl,
      shopifyProductTitle: mapping?.shopifyProductTitle ?? recommendation.title,
      notes: mapping?.notes ?? ""
    };
    return acc;
  }, {});
}

export function AmazonSupplierOrderManager({ workspace, locale = "he" }: AmazonSupplierOrderManagerProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [mappingState, setMappingState] = useState(() => getInitialMappingState(workspace.recommendations, workspace.mappings));
  const [selectedRecommendation, setSelectedRecommendation] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      workspace.recentOrders.flatMap((order) =>
        order.lineItems.map((lineItem) => {
          const suggested = workspace.mappings.find((mapping) => {
            const orderTitle = lineItem.title.toLowerCase();
            const mappedTitle = mapping.recommendationTitle.toLowerCase();
            const shopifyTitle = mapping.shopifyProductTitle?.toLowerCase() ?? "";
            return orderTitle.includes(mappedTitle) || mappedTitle.includes(orderTitle) || (shopifyTitle && (orderTitle.includes(shopifyTitle) || shopifyTitle.includes(orderTitle)));
          });
          return [lineItem.id, suggested?.recommendationId ?? ""];
        })
      )
    )
  );
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const recommendationLookup = useMemo(
    () => Object.fromEntries(workspace.recommendations.map((item) => [item.id, item])),
    [workspace.recommendations]
  );

  function saveMapping(recommendation: GrowthProductRecommendation) {
    const state = mappingState[recommendation.id];
    setPendingKey(`mapping-${recommendation.id}`);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/growth-agent/amazon-supplier-orders/mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recommendationId: recommendation.id,
            recommendationTitle: recommendation.title,
            amazonAsin: state?.amazonAsin ?? "",
            supplierUrl: state?.supplierUrl ?? recommendation.sourceUrl,
            shopifyProductTitle: state?.shopifyProductTitle ?? recommendation.title,
            notes: state?.notes ?? "",
            sourceDomain: recommendation.sourceDomain
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? lang("לא הצלחנו לשמור את מיפוי הספק.", "Could not save the supplier mapping."));
        setMessage(isHe ? `מיפוי הספק נשמר עבור ${recommendation.title}.` : `Saved supplier mapping for ${recommendation.title}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : lang("לא הצלחנו לשמור את מיפוי הספק.", "Could not save the supplier mapping."));
      } finally {
        setPendingKey(null);
      }
    });
  }

  function createDraft(orderId: string, lineItemId: string) {
    const recommendationId = selectedRecommendation[lineItemId];
    if (!recommendationId) {
      setMessage(lang("בחרו מוצר ספק ממופה לפני יצירת הטיוטה.", "Choose a mapped supplier product before creating the draft."));
      return;
    }

    setPendingKey(`draft-${lineItemId}`);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/growth-agent/amazon-supplier-orders/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            lineItemId,
            recommendationId,
            notes: draftNotes[lineItemId] ?? ""
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? lang("לא הצלחנו ליצור את טיוטת הזמנת הספק.", "Could not create the supplier draft."));
        setMessage(isHe ? `נוצרה טיוטת הזמנת ספק עבור ${payload.draft.lineItemTitle}.` : `Created supplier draft for ${payload.draft.lineItemTitle}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : lang("לא הצלחנו ליצור את טיוטת הזמנת הספק.", "Could not create the supplier draft."));
      } finally {
        setPendingKey(null);
      }
    });
  }

  function approveDraft(draft: AmazonSupplierOrderDraft) {
    setPendingKey(`approve-${draft.id}`);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/growth-agent/amazon-supplier-orders/drafts/${draft.id}/approve`, {
          method: "POST"
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? lang("לא הצלחנו לאשר את טיוטת הזמנת הספק.", "Could not approve the supplier draft."));
        setMessage(isHe ? `טיוטת הזמנת הספק אושרה עבור ${draft.lineItemTitle}.` : `Approved supplier draft for ${draft.lineItemTitle}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : lang("לא הצלחנו לאשר את טיוטת הזמנת הספק.", "Could not approve the supplier draft."));
      } finally {
        setPendingKey(null);
      }
    });
  }

  const mappedRecommendationIds = new Set(workspace.mappings.map((mapping) => mapping.recommendationId));

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3 text-sm text-muted-foreground">{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang("מיפויי מוצרי ספק", "Supplier product mappings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {workspace.recommendations.length ? workspace.recommendations.map((recommendation) => {
            const state = mappingState[recommendation.id] ?? { amazonAsin: "", supplierUrl: recommendation.sourceUrl, shopifyProductTitle: recommendation.title, notes: "" };
            return (
              <div key={recommendation.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="space-y-2">
                  <p className="font-semibold">{recommendation.title}</p>
                  <p className="text-sm text-muted-foreground">{recommendation.summary}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <span dir="ltr">{recommendation.sourceDomain}</span> · {mappedRecommendationIds.has(recommendation.id) ? lang("ממופה", "mapped") : lang("לא ממופה", "not mapped")}
                  </p>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">{lang("שם המוצר בShopify", "Shopify product title")}</span>
                    <input className="rounded-xl border border-border bg-background px-3 py-2" value={state.shopifyProductTitle} onChange={(event) => setMappingState((current) => ({ ...current, [recommendation.id]: { ...state, shopifyProductTitle: event.target.value } }))} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">{lang("מזהה ASIN של Amazon", "Amazon ASIN")}</span>
                    <input dir="ltr" className="rounded-xl border border-border bg-background px-3 py-2" value={state.amazonAsin} onChange={(event) => setMappingState((current) => ({ ...current, [recommendation.id]: { ...state, amazonAsin: event.target.value } }))} placeholder="B0..." />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">{lang("כתובת הספק", "Supplier URL")}</span>
                    <input dir="ltr" className="rounded-xl border border-border bg-background px-3 py-2" value={state.supplierUrl} onChange={(event) => setMappingState((current) => ({ ...current, [recommendation.id]: { ...state, supplierUrl: event.target.value } }))} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">{lang("הערות", "Notes")}</span>
                    <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2" value={state.notes} onChange={(event) => setMappingState((current) => ({ ...current, [recommendation.id]: { ...state, notes: event.target.value } }))} placeholder={lang("הערות משלוח, פרטי חשבון אצל הספק, תזכורת אריזה…", "Shipping notes, supplier account info, packaging reminder...")} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <a href={recommendation.sourceUrl} target="_blank" rel="noreferrer">
                      <Button type="button" variant="secondary">{lang("פתיחת המקור", "Open source")}</Button>
                    </a>
                    <Button type="button" onClick={() => saveMapping(recommendation)} disabled={isPending}>
                      {pendingKey === `mapping-${recommendation.id}` ? lang("שומר…", "Saving...") : lang("שמירת מיפוי", "Save mapping")}
                    </Button>
                  </div>
                </div>
              </div>
            );
          }) : <p className="text-sm text-muted-foreground">{lang("הריצו קודם את קראולר המוצרים כדי שיהיו רעיונות מוצרים למיפוי לAmazon או לקישור ספק אחר.", "Run the product crawler first so there are product ideas to map to Amazon or another supplier link.")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang("יצירת טיוטות ספק מהזמנות Shopify", "Create supplier drafts from Shopify orders")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspace.recentOrders.length ? workspace.recentOrders.map((order) => (
            <div key={order.orderId} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold" dir="ltr">{order.orderNumber}</p>
                  <p className="text-sm text-muted-foreground">{order.customerName ?? lang("לקוח לא ידוע", "Unknown customer")}{order.customerEmail ? <> · <span dir="ltr">{order.customerEmail}</span></> : null}</p>
                </div>
                <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleString(isHe ? "he-IL" : "en-US")}</p>
              </div>
              <div className="mt-4 space-y-3">
                {order.lineItems.map((lineItem) => {
                  const selectedId = selectedRecommendation[lineItem.id] ?? "";
                  return (
                    <div key={lineItem.id} className="rounded-xl border border-border/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{lineItem.title}</p>
                          <p className="text-sm text-muted-foreground">{lang("כמות", "Quantity")} {lineItem.quantity}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1fr_auto]">
                        <label className="grid gap-1 text-sm">
                          <span className="text-muted-foreground">{lang("מוצר ספק ממופה", "Mapped supplier product")}</span>
                          <select className="rounded-xl border border-border bg-background px-3 py-2" value={selectedId} onChange={(event) => setSelectedRecommendation((current) => ({ ...current, [lineItem.id]: event.target.value }))}>
                            <option value="">{lang("בחרו מיפוי", "Select a mapping")}</option>
                            {workspace.mappings.map((mapping) => (
                              <option key={mapping.recommendationId} value={mapping.recommendationId}>{mapping.recommendationTitle}{mapping.amazonAsin ? ` · ${mapping.amazonAsin}` : ""}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-muted-foreground">{lang("הערות לטיוטה", "Draft notes")}</span>
                          <input className="rounded-xl border border-border bg-background px-3 py-2" value={draftNotes[lineItem.id] ?? ""} onChange={(event) => setDraftNotes((current) => ({ ...current, [lineItem.id]: event.target.value }))} placeholder={lang("השאירו הוראות להזמנת הספק", "Leave instructions for the supplier order")} />
                        </label>
                        <div className="flex items-end">
                          <Button type="button" onClick={() => createDraft(order.orderId, lineItem.id)} disabled={isPending || !workspace.mappings.length}>
                            {pendingKey === `draft-${lineItem.id}` ? lang("יוצר…", "Creating...") : lang("יצירת טיוטה", "Create draft")}
                          </Button>
                        </div>
                      </div>
                      {selectedId && recommendationLookup[selectedId] ? <p className="mt-2 text-sm text-muted-foreground">{isHe ? `הטיוטה תשתמש ב${recommendationLookup[selectedId].title}.` : `Draft will use ${recommendationLookup[selectedId].title}.`}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">{lang("אין עדיין הזמנות Shopify זמינות. הריצו סנכרון אחרי שהחנות תקבל הזמנות.", "No Shopify orders are available yet. Run sync after your store receives test orders.")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang("טיוטות הזמנות ספק", "Supplier order drafts")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspace.drafts.length ? workspace.drafts.map((draft) => (
            <div key={draft.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold"><span dir="ltr">{draft.orderNumber}</span> · {draft.lineItemTitle}</p>
                  <p className="text-sm text-muted-foreground">{lang("מוצר הספק:", "Supplier product:")} {draft.recommendationTitle} · {lang("כמות", "Quantity")} {draft.quantity}</p>
                  <p className="text-sm text-muted-foreground">{lang("כתובת הספק:", "Supplier URL:")} <a href={draft.supplierUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{lang("פתיחת קישור", "Open link")}</a>{draft.amazonAsin ? <> · ASIN <span dir="ltr">{draft.amazonAsin}</span></> : null}</p>
                  {draft.notes ? <p className="text-sm text-muted-foreground">{lang("הערות:", "Notes:")} {draft.notes}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-sm text-muted-foreground">{lang("סטטוס:", "Status:")} {draft.status}</p>
                  {draft.status === "draft" ? (
                    <Button type="button" size="sm" onClick={() => approveDraft(draft)} disabled={isPending}>
                      {pendingKey === `approve-${draft.id}` ? lang("מאשר…", "Approving...") : lang("אישור הטיוטה", "Approve draft")}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">{lang("אושר", "Approved")} {draft.approvedAt ? new Date(draft.approvedAt).toLocaleString(isHe ? "he-IL" : "en-US") : ""}</p>
                  )}
                </div>
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">{lang("אין עדיין טיוטות ספק. שמרו לפחות מיפוי אחד ואז צרו טיוטה מהזמנת Shopify.", "No supplier drafts yet. Save at least one mapping, then create a draft from a Shopify order.")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
