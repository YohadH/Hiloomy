"use client";

import { useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface AffiliateOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  affiliateCode: string;
  couponCode?: string | null;
}

interface ProductOption {
  id: string;
  title: string;
}

interface CollectionOption {
  id: string;
  title: string;
}

interface CustomerSegmentOption {
  id: string;
  name: string;
}

type ManagerMode = "single" | "bulk";
type SingleMethod = "create" | "existing";
type DiscountType = "percent" | "fixed";
type PurchaseType = "one_time" | "subscription" | "both";
type AppliesToType = "all" | "products" | "collections";
type MinimumRequirementType = "none" | "subtotal" | "quantity";
type CustomerEligibilityType = "all" | "segments";

type Translator = (he: string, en: string) => string;

function sanitizeCouponCodeSegment(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

function normalizeRedirectTarget(redirectPath: string) {
  const trimmed = redirectPath.trim();
  if (!trimmed) return "/";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildPreviewLink(baseStoreUrl: string, code: string, affiliateCode: string, redirectPath: string) {
  const redirect = normalizeRedirectTarget(redirectPath);
  return `${baseStoreUrl.replace(/\/$/, "")}/discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(
    redirect
  )}&ref=${encodeURIComponent(affiliateCode)}`;
}

function buildBulkPreviewCode(
  affiliate: AffiliateOption,
  prefix: string,
  suffix: string,
  fallbackValue: number
) {
  const core = sanitizeCouponCodeSegment(affiliate.affiliateCode || `${affiliate.firstName}${affiliate.lastName}`);
  const normalizedPrefix = sanitizeCouponCodeSegment(prefix);
  const normalizedSuffix = sanitizeCouponCodeSegment(suffix);
  return (
    [normalizedPrefix, core, normalizedSuffix].filter(Boolean).join("-") ||
    `${core}-${Math.round(fallbackValue)}`
  ).slice(0, 200);
}

function getAffiliateLabel(affiliate: AffiliateOption) {
  const fullName = `${affiliate.firstName} ${affiliate.lastName}`.trim();
  if (fullName) return fullName;
  return affiliate.email || affiliate.affiliateCode;
}

function RuleCard({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SelectableList({
  items,
  selectedIds,
  onToggle,
  emptyLabel
}: {
  items: Array<{ id: string; label: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-border bg-background p-3 md:grid-cols-2">
      {items.map((item) => {
        const checked = selectedIds.includes(item.id);
        return (
          <label key={item.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(item.id)}
              className="h-4 w-4 rounded border-border"
            />
            <span>{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function renderApplyToSelection({
  appliesToType,
  selectedProductIds,
  selectedCollectionIds,
  products,
  collections,
  toggleProduct,
  toggleCollection,
  lang
}: {
  appliesToType: AppliesToType;
  selectedProductIds: string[];
  selectedCollectionIds: string[];
  products: ProductOption[];
  collections: CollectionOption[];
  toggleProduct: (id: string) => void;
  toggleCollection: (id: string) => void;
  lang: Translator;
}) {
  if (appliesToType === "products") {
    return (
      <SelectableList
        items={products.map((product) => ({ id: product.id, label: product.title }))}
        selectedIds={selectedProductIds}
        onToggle={toggleProduct}
        emptyLabel={lang("אין עדיין מוצרים מסונכרנים מ-Shopify.", "No synced Shopify products are available yet.")}
      />
    );
  }

  if (appliesToType === "collections") {
    return (
      <SelectableList
        items={collections.map((collection) => ({ id: collection.id, label: collection.title }))}
        selectedIds={selectedCollectionIds}
        onToggle={toggleCollection}
        emptyLabel={lang("אין עדיין קולקציות מ-Shopify.", "No Shopify collections are available yet.")}
      />
    );
  }

  return null;
}

function renderSegmentSelection({
  customerEligibilityType,
  selectedSegmentIds,
  customerSegments,
  toggleSegment,
  lang
}: {
  customerEligibilityType: CustomerEligibilityType;
  selectedSegmentIds: string[];
  customerSegments: CustomerSegmentOption[];
  toggleSegment: (id: string) => void;
  lang: Translator;
}) {
  if (customerEligibilityType !== "segments") return null;

  return (
    <SelectableList
      items={customerSegments.map((segment) => ({ id: segment.id, label: segment.name }))}
      selectedIds={selectedSegmentIds}
      onToggle={toggleSegment}
      emptyLabel={lang(
        "אין פלחי לקוחות מ-Shopify זמינים לחנות הזו.",
        "No Shopify customer segments are available for this store."
      )}
    />
  );
}

export function AffiliateCouponManager({
  baseStoreUrl,
  affiliates,
  products,
  collections,
  customerSegments,
  lockedAffiliateId,
  defaultMode = "single",
  locale = "he"
}: {
  baseStoreUrl: string;
  affiliates: AffiliateOption[];
  products: ProductOption[];
  collections: CollectionOption[];
  customerSegments: CustomerSegmentOption[];
  lockedAffiliateId?: string;
  defaultMode?: ManagerMode;
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<ManagerMode>(lockedAffiliateId ? "single" : defaultMode);

  const firstAffiliate = affiliates[0];
  const lockedAffiliate = lockedAffiliateId
    ? affiliates.find((affiliate) => affiliate.id === lockedAffiliateId) ?? null
    : null;

  const [singleAffiliateId, setSingleAffiliateId] = useState(lockedAffiliateId ?? firstAffiliate?.id ?? "");
  const [singleMethod, setSingleMethod] = useState<SingleMethod>("create");
  const [singleCode, setSingleCode] = useState("");
  const [singleDiscountType, setSingleDiscountType] = useState<DiscountType>("percent");
  const [singleValue, setSingleValue] = useState("15");
  const [singlePurchaseType, setSinglePurchaseType] = useState<PurchaseType>("one_time");
  const [singleAppliesToType, setSingleAppliesToType] = useState<AppliesToType>("all");
  const [singleProductIds, setSingleProductIds] = useState<string[]>([]);
  const [singleCollectionIds, setSingleCollectionIds] = useState<string[]>([]);
  const [singleMinimumRequirementType, setSingleMinimumRequirementType] = useState<MinimumRequirementType>("none");
  const [singleMinimumSubtotal, setSingleMinimumSubtotal] = useState("");
  const [singleMinimumQuantity, setSingleMinimumQuantity] = useState("");
  const [singleCustomerEligibilityType, setSingleCustomerEligibilityType] = useState<CustomerEligibilityType>("all");
  const [singleSegmentIds, setSingleSegmentIds] = useState<string[]>([]);
  const [singleUsageLimit, setSingleUsageLimit] = useState("");
  const [singleAppliesOncePerCustomer, setSingleAppliesOncePerCustomer] = useState(true);
  const [singleCombinesWithProductDiscounts, setSingleCombinesWithProductDiscounts] = useState(false);
  const [singleCombinesWithOrderDiscounts, setSingleCombinesWithOrderDiscounts] = useState(false);
  const [singleCombinesWithShippingDiscounts, setSingleCombinesWithShippingDiscounts] = useState(false);
  const [singleRedirectPath, setSingleRedirectPath] = useState("/");

  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkAssignToAll, setBulkAssignToAll] = useState(false);
  const [selectedAffiliateIds, setSelectedAffiliateIds] = useState<string[]>([]);
  const [bulkCodePrefix, setBulkCodePrefix] = useState("");
  const [bulkCodeSuffix, setBulkCodeSuffix] = useState("");
  const [bulkDiscountType, setBulkDiscountType] = useState<DiscountType>("percent");
  const [bulkValue, setBulkValue] = useState("15");
  const [bulkPurchaseType, setBulkPurchaseType] = useState<PurchaseType>("one_time");
  const [bulkAppliesToType, setBulkAppliesToType] = useState<AppliesToType>("all");
  const [bulkProductIds, setBulkProductIds] = useState<string[]>([]);
  const [bulkCollectionIds, setBulkCollectionIds] = useState<string[]>([]);
  const [bulkMinimumRequirementType, setBulkMinimumRequirementType] = useState<MinimumRequirementType>("none");
  const [bulkMinimumSubtotal, setBulkMinimumSubtotal] = useState("");
  const [bulkMinimumQuantity, setBulkMinimumQuantity] = useState("");
  const [bulkCustomerEligibilityType, setBulkCustomerEligibilityType] = useState<CustomerEligibilityType>("all");
  const [bulkSegmentIds, setBulkSegmentIds] = useState<string[]>([]);
  const [bulkUsageLimit, setBulkUsageLimit] = useState("");
  const [bulkAppliesOncePerCustomer, setBulkAppliesOncePerCustomer] = useState(true);
  const [bulkCombinesWithProductDiscounts, setBulkCombinesWithProductDiscounts] = useState(false);
  const [bulkCombinesWithOrderDiscounts, setBulkCombinesWithOrderDiscounts] = useState(false);
  const [bulkCombinesWithShippingDiscounts, setBulkCombinesWithShippingDiscounts] = useState(false);
  const [bulkRedirectPath, setBulkRedirectPath] = useState("/");

  const selectedSingleAffiliate = lockedAffiliate ?? affiliates.find((affiliate) => affiliate.id === singleAffiliateId) ?? null;
  const hasAffiliates = affiliates.length > 0;

  const generatedSingleCode = useMemo(() => {
    if (!selectedSingleAffiliate) return "";
    return sanitizeCouponCodeSegment(
      singleCode.trim() ||
        selectedSingleAffiliate.couponCode ||
        `${selectedSingleAffiliate.affiliateCode}-${Math.round(Number(singleValue || 0) || 0)}`
    );
  }, [selectedSingleAffiliate, singleCode, singleValue]);

  const generatedSingleLink = useMemo(() => {
    if (!selectedSingleAffiliate || !generatedSingleCode) return "";
    return buildPreviewLink(baseStoreUrl, generatedSingleCode, selectedSingleAffiliate.affiliateCode, singleRedirectPath);
  }, [baseStoreUrl, generatedSingleCode, selectedSingleAffiliate, singleRedirectPath]);

  const filteredAffiliates = useMemo(() => {
    const query = bulkSearch.trim().toLowerCase();
    if (!query) return affiliates;
    return affiliates.filter((affiliate) =>
      `${affiliate.firstName} ${affiliate.lastName} ${affiliate.email ?? ""} ${affiliate.affiliateCode}`
        .toLowerCase()
        .includes(query)
    );
  }, [affiliates, bulkSearch]);

  const effectiveBulkAffiliateIds = bulkAssignToAll
    ? affiliates.map((affiliate) => affiliate.id)
    : selectedAffiliateIds;

  const bulkPreviewAffiliates = useMemo(() => {
    const selectedIds = new Set(effectiveBulkAffiliateIds);
    return affiliates.filter((affiliate) => selectedIds.has(affiliate.id)).slice(0, 3);
  }, [affiliates, effectiveBulkAffiliateIds]);

  function toggleId(setter: Dispatch<SetStateAction<string[]>>, id: string) {
    setter((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function selectAllFilteredAffiliates() {
    setSelectedAffiliateIds(Array.from(new Set(filteredAffiliates.map((affiliate) => affiliate.id))));
  }

  async function handleCopySingleLink() {
    if (!generatedSingleLink) return;
    try {
      await navigator.clipboard.writeText(generatedSingleLink);
      setMessage(lang("קישור התצוגה המקדימה של השותפה הועתק.", "Copied the affiliate preview link."));
    } catch {
      setMessage(lang("לא הצלחנו להעתיק את קישור התצוגה המקדימה.", "Could not copy the affiliate preview link."));
    }
  }

  async function handleSingleAssign() {
    if (!selectedSingleAffiliate || !generatedSingleCode) {
      setMessage(lang("בחרו שותפה וקוד קופון לפני שממשיכים.", "Choose an affiliate and coupon code first."));
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/affiliate-portal/coupons/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            affiliateId: selectedSingleAffiliate.id,
            code: generatedSingleCode,
            title: generatedSingleCode,
            creationMode: singleMethod,
            discountType: singleDiscountType,
            value: Number(singleValue),
            appliesOncePerCustomer: singleAppliesOncePerCustomer,
            redirectPath: singleRedirectPath,
            assignmentMode: "single",
            purchaseType: singlePurchaseType,
            appliesToType: singleAppliesToType,
            appliesToProductIds: singleProductIds,
            appliesToCollectionIds: singleCollectionIds,
            minimumRequirementType: singleMinimumRequirementType,
            minimumSubtotal: singleMinimumRequirementType === "subtotal" ? Number(singleMinimumSubtotal) : null,
            minimumQuantity: singleMinimumRequirementType === "quantity" ? Number(singleMinimumQuantity) : null,
            customerEligibilityType: singleCustomerEligibilityType,
            customerSegmentIds: singleSegmentIds,
            usageLimit: singleUsageLimit ? Number(singleUsageLimit) : null,
            combinesWith: {
              productDiscounts: singleCombinesWithProductDiscounts,
              orderDiscounts: singleCombinesWithOrderDiscounts,
              shippingDiscounts: singleCombinesWithShippingDiscounts
            }
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? lang("השיוך הבודד נכשל.", "Single assignment failed."));
        }

        setMessage(
          singleMethod === "existing"
            ? lang(
                `הקופון הקיים ${payload.code} שויך ל${payload.affiliateName}.`,
                `Attached existing coupon ${payload.code} to ${payload.affiliateName}.`
              )
            : lang(
                `נוצרה הנחת Shopify ${payload.code} עבור ${payload.affiliateName}.`,
                `Created Shopify discount ${payload.code} for ${payload.affiliateName}.`
              )
        );
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : lang("השיוך הבודד נכשל.", "Single assignment failed.")
        );
      }
    });
  }

  async function handleBulkAssign() {
    if (!effectiveBulkAffiliateIds.length) {
      setMessage(lang("בחרו לפחות שותפה אחת לשיוך כמותי.", "Select at least one affiliate for bulk assignment."));
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/affiliate-portal/coupons/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            affiliateIds: effectiveBulkAffiliateIds,
            title: bulkCodePrefix.trim() || "Affiliate discount",
            codePrefix: bulkCodePrefix,
            codeSuffix: bulkCodeSuffix,
            discountType: bulkDiscountType,
            value: Number(bulkValue),
            appliesOncePerCustomer: bulkAppliesOncePerCustomer,
            redirectPath: bulkRedirectPath,
            purchaseType: bulkPurchaseType,
            appliesToType: bulkAppliesToType,
            appliesToProductIds: bulkProductIds,
            appliesToCollectionIds: bulkCollectionIds,
            minimumRequirementType: bulkMinimumRequirementType,
            minimumSubtotal: bulkMinimumRequirementType === "subtotal" ? Number(bulkMinimumSubtotal) : null,
            minimumQuantity: bulkMinimumRequirementType === "quantity" ? Number(bulkMinimumQuantity) : null,
            customerEligibilityType: bulkCustomerEligibilityType,
            customerSegmentIds: bulkSegmentIds,
            usageLimit: bulkUsageLimit ? Number(bulkUsageLimit) : null,
            combinesWith: {
              productDiscounts: bulkCombinesWithProductDiscounts,
              orderDiscounts: bulkCombinesWithOrderDiscounts,
              shippingDiscounts: bulkCombinesWithShippingDiscounts
            }
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? lang("השיוך הכמותי נכשל.", "Bulk assignment failed."));
        }

        setMessage(
          lang(
            `נוצרו ${payload.assignedCount} הנחות Shopify בהפקה כמותית.`,
            `Created ${payload.assignedCount} Shopify discounts in bulk.`
          )
        );
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : lang("השיוך הכמותי נכשל.", "Bulk assignment failed.")
        );
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{lang("ניהול הנחות לשותפות", "Affiliate discount manager")}</h3>
        <p className="text-sm text-muted-foreground">
          {lang(
            "בנו כללי הנחה ב-Shopify לשותפה אחת, או הפיקו קודים ייחודיים בכמות, ואז חברו כל קוד לקישור השותפה שלו.",
            "Build Shopify discount rules for one affiliate or create unique codes in bulk, then attach each code to an affiliate link."
          )}
        </p>
      </div>

      {!lockedAffiliateId ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "single" ? "default" : "secondary"}
            onClick={() => setMode("single")}
          >
            {lang("שיוך בודד", "Single assign")}
          </Button>
          <Button
            type="button"
            variant={mode === "bulk" ? "default" : "secondary"}
            onClick={() => setMode("bulk")}
          >
            {lang("שיוך כמותי", "Bulk assign")}
          </Button>
        </div>
      ) : null}

      {!hasAffiliates ? (
        <p className="text-sm text-muted-foreground">
          {lang(
            "הוסיפו לפחות שותפה אחת לפני יצירה או שיוך של הנחות Shopify.",
            "Add at least one affiliate before creating or attaching Shopify discounts."
          )}
        </p>
      ) : null}

      {mode === "single" ? (
        <div className="space-y-4">
          <RuleCard title={lang("בחירת שותפה", "Select affiliate")}>
            {lockedAffiliate ? (
              <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                {getAffiliateLabel(lockedAffiliate)} - <span dir="ltr">{lockedAffiliate.affiliateCode}</span>
              </div>
            ) : (
              <select
                value={singleAffiliateId}
                onChange={(event) => setSingleAffiliateId(event.target.value)}
                disabled={!hasAffiliates}
                aria-label={lang("בחירת שותפה", "Select affiliate")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              >
                {affiliates.map((affiliate) => (
                  <option key={affiliate.id} value={affiliate.id}>
                    {getAffiliateLabel(affiliate)} - {affiliate.affiliateCode}
                  </option>
                ))}
              </select>
            )}
          </RuleCard>

          <RuleCard title={lang("בחירת שיטה", "Select method")}>
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={singleMethod === "create"}
                  onChange={() => setSingleMethod("create")}
                  className="h-4 w-4 border-border"
                />
                {lang("יצירת קופון חדש ב-Shopify", "Create a new Shopify coupon")}
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={singleMethod === "existing"}
                  onChange={() => setSingleMethod("existing")}
                  className="h-4 w-4 border-border"
                />
                {lang("שימוש בקופון קיים ב-Shopify", "Use an existing Shopify coupon")}
              </label>
            </div>
          </RuleCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <RuleCard title={lang("קוד הקופון", "Coupon code")}>
              <input
                dir="ltr"
                value={singleCode}
                onChange={(event) => setSingleCode(event.target.value)}
                aria-label={lang("קוד הקופון", "Coupon code")}
                placeholder={selectedSingleAffiliate ? `${selectedSingleAffiliate.affiliateCode}-15` : "AFFILIATE-15"}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {lang(
                  "קודי הנחה ב-Shopify מתורגמים אוטומטית לאותיות גדולות באנגלית, ספרות ומקפים.",
                  "Shopify discount codes are normalized to uppercase letters, numbers, and dashes."
                )}
              </p>
            </RuleCard>

            <RuleCard
              title={lang("גובה ההנחה", "Discount value")}
              description={
                singleMethod === "existing"
                  ? lang(
                      "משמש לדיווח ולתצוגה באפליקציה בלבד. כלל ההנחה עצמו נשאר ב-Shopify.",
                      "Used for app reporting and display. The real rule stays in Shopify."
                    )
                  : undefined
              }
            >
              <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                <select
                  value={singleDiscountType}
                  onChange={(event) => setSingleDiscountType(event.target.value as DiscountType)}
                  aria-label={lang("סוג ההנחה", "Discount type")}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                >
                  <option value="percent">{lang("אחוז הנחה", "Percentage")}</option>
                  <option value="fixed">{lang("סכום קבוע", "Fixed amount")}</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={singleValue}
                  onChange={(event) => setSingleValue(event.target.value)}
                  aria-label={lang("גובה ההנחה", "Discount value")}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                />
              </div>
            </RuleCard>
          </div>

          {singleMethod === "create" ? (
            <>
              <RuleCard title={lang("סוג הרכישה", "Purchase type")}>
                <select
                  value={singlePurchaseType}
                  onChange={(event) => setSinglePurchaseType(event.target.value as PurchaseType)}
                  aria-label={lang("סוג הרכישה", "Purchase type")}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                >
                  <option value="one_time">{lang("רכישה חד-פעמית", "One-time purchase")}</option>
                  <option value="subscription">{lang("מנוי בלבד", "Subscription only")}</option>
                  <option value="both">{lang("רכישה חד-פעמית ומנוי", "One-time and subscription")}</option>
                </select>
              </RuleCard>

              <RuleCard title={lang("ההנחה חלה על", "Apply to")}>
                <div className="space-y-3">
                  <select
                    value={singleAppliesToType}
                    onChange={(event) => setSingleAppliesToType(event.target.value as AppliesToType)}
                    aria-label={lang("ההנחה חלה על", "Apply to")}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <option value="all">{lang("כל המוצרים", "All products")}</option>
                    <option value="products">{lang("מוצרים נבחרים", "Specific products")}</option>
                    <option value="collections">{lang("קולקציות נבחרות", "Specific collections")}</option>
                  </select>
                  {renderApplyToSelection({
                    appliesToType: singleAppliesToType,
                    selectedProductIds: singleProductIds,
                    selectedCollectionIds: singleCollectionIds,
                    products,
                    collections,
                    toggleProduct: (id) => toggleId(setSingleProductIds, id),
                    toggleCollection: (id) => toggleId(setSingleCollectionIds, id),
                    lang
                  })}
                </div>
              </RuleCard>

              <RuleCard title={lang("דרישות מינימום לרכישה", "Minimum purchase requirements")}>
                <div className="space-y-3">
                  <select
                    value={singleMinimumRequirementType}
                    onChange={(event) => setSingleMinimumRequirementType(event.target.value as MinimumRequirementType)}
                    aria-label={lang("דרישות מינימום לרכישה", "Minimum purchase requirements")}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <option value="none">{lang("ללא דרישות מינימום", "No minimum requirements")}</option>
                    <option value="subtotal">{lang("סכום רכישה מינימלי", "Minimum purchase amount")}</option>
                    <option value="quantity">{lang("כמות פריטים מינימלית", "Minimum item quantity")}</option>
                  </select>
                  {singleMinimumRequirementType === "subtotal" ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={singleMinimumSubtotal}
                      onChange={(event) => setSingleMinimumSubtotal(event.target.value)}
                      placeholder={lang("סכום ביניים מינימלי", "Minimum subtotal")}
                      aria-label={lang("סכום ביניים מינימלי", "Minimum subtotal")}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                  ) : null}
                  {singleMinimumRequirementType === "quantity" ? (
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={singleMinimumQuantity}
                      onChange={(event) => setSingleMinimumQuantity(event.target.value)}
                      placeholder={lang("כמות מינימלית", "Minimum quantity")}
                      aria-label={lang("כמות מינימלית", "Minimum quantity")}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                  ) : null}
                </div>
              </RuleCard>

              <RuleCard title={lang("זכאות לקוחות", "Customer eligibility")}>
                <div className="space-y-3">
                  <select
                    value={singleCustomerEligibilityType}
                    onChange={(event) => setSingleCustomerEligibilityType(event.target.value as CustomerEligibilityType)}
                    aria-label={lang("זכאות לקוחות", "Customer eligibility")}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <option value="all">{lang("כל הלקוחות", "All customers")}</option>
                    <option value="segments">{lang("פלחי לקוחות נבחרים", "Specific customer segments")}</option>
                  </select>
                  {renderSegmentSelection({
                    customerEligibilityType: singleCustomerEligibilityType,
                    selectedSegmentIds: singleSegmentIds,
                    customerSegments,
                    toggleSegment: (id) => toggleId(setSingleSegmentIds, id),
                    lang
                  })}
                </div>
              </RuleCard>

              <RuleCard title={lang("מספר שימושים מרבי בהנחה", "Maximum discount uses")}>
                <div className="space-y-3">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={singleUsageLimit}
                    onChange={(event) => setSingleUsageLimit(event.target.value)}
                    placeholder={lang("השאירו ריק לשימוש ללא הגבלה", "Leave blank for unlimited total uses")}
                    aria-label={lang("מספר שימושים מרבי בהנחה", "Maximum discount uses")}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <label className="flex items-center gap-3 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={singleAppliesOncePerCustomer}
                      onChange={(event) => setSingleAppliesOncePerCustomer(event.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {lang("הגבלה לשימוש אחד לכל לקוח", "Limit to one use per customer")}
                  </label>
                </div>
              </RuleCard>

              <RuleCard title={lang("שילוב עם הנחות אחרות", "Combinations")}>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={singleCombinesWithProductDiscounts}
                      onChange={(event) => setSingleCombinesWithProductDiscounts(event.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {lang("הנחות על מוצרים", "Product discounts")}
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={singleCombinesWithOrderDiscounts}
                      onChange={(event) => setSingleCombinesWithOrderDiscounts(event.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {lang("הנחות על ההזמנה", "Order discounts")}
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={singleCombinesWithShippingDiscounts}
                      onChange={(event) => setSingleCombinesWithShippingDiscounts(event.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {lang("הנחות על משלוח", "Shipping discounts")}
                  </label>
                </div>
              </RuleCard>
            </>
          ) : (
            <RuleCard title={lang("קופון קיים ב-Shopify", "Existing Shopify coupon")}>
              <p className="text-sm text-muted-foreground">
                {lang(
                  "הקופון כבר קיים ב-Shopify. הפעולה הזו רק משייכת את הקוד לשותפה ולקישור המעקב בתוך האפליקציה.",
                  "The coupon already exists in Shopify. This action only attaches that code to the affiliate and tracking link inside the app."
                )}
              </p>
            </RuleCard>
          )}

          <RuleCard title={lang("נתיב או כתובת להפניה", "Redirect path or URL")}>
            <input
              dir="ltr"
              value={singleRedirectPath}
              onChange={(event) => setSingleRedirectPath(event.target.value || "/")}
              aria-label={lang("נתיב או כתובת להפניה", "Redirect path or URL")}
              placeholder={lang(
                "/products/your-product או https://yourstore.com/products/your-product",
                "/products/your-product or https://yourstore.com/products/your-product"
              )}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </RuleCard>

          <RuleCard title={lang("קישור ההפעלה", "Preview link")}>
            <p
              dir={generatedSingleLink ? "ltr" : undefined}
              className="break-all text-xs text-muted-foreground"
            >
              {generatedSingleLink ||
                lang(
                  "בחרו שותפה כדי לראות תצוגה מקדימה של קישור ההנחה.",
                  "Select an affiliate to preview the discount link."
                )}
            </p>
          </RuleCard>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleSingleAssign} disabled={isPending || !selectedSingleAffiliate}>
              {isPending
                ? lang("שומר...", "Saving...")
                : singleMethod === "existing"
                  ? lang("שיוך קופון קיים", "Attach existing coupon")
                  : lang("יצירה ב-Shopify", "Create in Shopify")}
            </Button>
            <Button type="button" variant="secondary" onClick={handleCopySingleLink} disabled={!generatedSingleLink}>
              {lang("העתקת קישור ההפעלה", "Copy preview link")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <RuleCard title={lang("בחירת שותפות", "Select affiliates")}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={!bulkAssignToAll}
                    onChange={() => setBulkAssignToAll(false)}
                    className="h-4 w-4 border-border"
                  />
                  {lang("בחירת שותפות מסוימות", "Select specific affiliates")}
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={bulkAssignToAll}
                    onChange={() => setBulkAssignToAll(true)}
                    className="h-4 w-4 border-border"
                  />
                  {lang("שיוך לכל השותפות", "Assign to all affiliates")}
                </label>
              </div>

              {!bulkAssignToAll ? (
                <>
                  <div className="flex flex-wrap gap-3">
                    <input
                      value={bulkSearch}
                      onChange={(event) => setBulkSearch(event.target.value)}
                      placeholder={lang("חיפוש שותפות", "Search affiliates")}
                      aria-label={lang("חיפוש שותפות", "Search affiliates")}
                      className="min-w-[16rem] flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                    <Button type="button" variant="secondary" onClick={selectAllFilteredAffiliates}>
                      {lang("בחירת כל התוצאות", "Select filtered")}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setSelectedAffiliateIds([])}>
                      {lang("ניקוי", "Clear")}
                    </Button>
                  </div>
                  <SelectableList
                    items={filteredAffiliates.map((affiliate) => ({
                      id: affiliate.id,
                      label: `${getAffiliateLabel(affiliate)} - ${affiliate.affiliateCode}`
                    }))}
                    selectedIds={selectedAffiliateIds}
                    onToggle={(id) => toggleId(setSelectedAffiliateIds, id)}
                    emptyLabel={lang("לא נמצאו שותפות שתואמות לחיפוש.", "No affiliates matched your search.")}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {lang(
                    "כל שותפה בתוכנית תקבל קוד קופון ייחודי ב-Shopify.",
                    "Every affiliate in the program will receive a unique Shopify coupon code."
                  )}
                </p>
              )}
            </div>
          </RuleCard>

          <RuleCard title={lang("מבנה הקוד", "Code format")}>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                dir="ltr"
                value={bulkCodePrefix}
                onChange={(event) => setBulkCodePrefix(event.target.value)}
                placeholder={lang("קידומת לקוד", "Code prefix")}
                aria-label={lang("קידומת לקוד", "Code prefix")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
              <input
                dir="ltr"
                value={bulkCodeSuffix}
                onChange={(event) => setBulkCodeSuffix(event.target.value)}
                placeholder={lang("סיומת לקוד", "Code suffix")}
                aria-label={lang("סיומת לקוד", "Code suffix")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
            </div>
          </RuleCard>

          <RuleCard title={lang("גובה ההנחה", "Discount value")}>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <select
                value={bulkDiscountType}
                onChange={(event) => setBulkDiscountType(event.target.value as DiscountType)}
                aria-label={lang("סוג ההנחה", "Discount type")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              >
                <option value="percent">{lang("אחוז הנחה", "Percentage")}</option>
                <option value="fixed">{lang("סכום קבוע", "Fixed amount")}</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={bulkValue}
                onChange={(event) => setBulkValue(event.target.value)}
                aria-label={lang("גובה ההנחה", "Discount value")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
            </div>
          </RuleCard>

          <RuleCard title={lang("סוג הרכישה", "Purchase type")}>
            <select
              value={bulkPurchaseType}
              onChange={(event) => setBulkPurchaseType(event.target.value as PurchaseType)}
              aria-label={lang("סוג הרכישה", "Purchase type")}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            >
              <option value="one_time">{lang("רכישה חד-פעמית", "One-time purchase")}</option>
              <option value="subscription">{lang("מנוי בלבד", "Subscription only")}</option>
              <option value="both">{lang("רכישה חד-פעמית ומנוי", "One-time and subscription")}</option>
            </select>
          </RuleCard>

          <RuleCard title={lang("ההנחה חלה על", "Apply to")}>
            <div className="space-y-3">
              <select
                value={bulkAppliesToType}
                onChange={(event) => setBulkAppliesToType(event.target.value as AppliesToType)}
                aria-label={lang("ההנחה חלה על", "Apply to")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              >
                <option value="all">{lang("כל המוצרים", "All products")}</option>
                <option value="products">{lang("מוצרים נבחרים", "Specific products")}</option>
                <option value="collections">{lang("קולקציות נבחרות", "Specific collections")}</option>
              </select>
              {renderApplyToSelection({
                appliesToType: bulkAppliesToType,
                selectedProductIds: bulkProductIds,
                selectedCollectionIds: bulkCollectionIds,
                products,
                collections,
                toggleProduct: (id) => toggleId(setBulkProductIds, id),
                toggleCollection: (id) => toggleId(setBulkCollectionIds, id),
                lang
              })}
            </div>
          </RuleCard>

          <RuleCard title={lang("דרישות מינימום לרכישה", "Minimum purchase requirements")}>
            <div className="space-y-3">
              <select
                value={bulkMinimumRequirementType}
                onChange={(event) => setBulkMinimumRequirementType(event.target.value as MinimumRequirementType)}
                aria-label={lang("דרישות מינימום לרכישה", "Minimum purchase requirements")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              >
                <option value="none">{lang("ללא דרישות מינימום", "No minimum requirements")}</option>
                <option value="subtotal">{lang("סכום רכישה מינימלי", "Minimum purchase amount")}</option>
                <option value="quantity">{lang("כמות פריטים מינימלית", "Minimum item quantity")}</option>
              </select>
              {bulkMinimumRequirementType === "subtotal" ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bulkMinimumSubtotal}
                  onChange={(event) => setBulkMinimumSubtotal(event.target.value)}
                  placeholder={lang("סכום ביניים מינימלי", "Minimum subtotal")}
                  aria-label={lang("סכום ביניים מינימלי", "Minimum subtotal")}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                />
              ) : null}
              {bulkMinimumRequirementType === "quantity" ? (
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={bulkMinimumQuantity}
                  onChange={(event) => setBulkMinimumQuantity(event.target.value)}
                  placeholder={lang("כמות מינימלית", "Minimum quantity")}
                  aria-label={lang("כמות מינימלית", "Minimum quantity")}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                />
              ) : null}
            </div>
          </RuleCard>

          <RuleCard title={lang("זכאות לקוחות", "Customer eligibility")}>
            <div className="space-y-3">
              <select
                value={bulkCustomerEligibilityType}
                onChange={(event) => setBulkCustomerEligibilityType(event.target.value as CustomerEligibilityType)}
                aria-label={lang("זכאות לקוחות", "Customer eligibility")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              >
                <option value="all">{lang("כל הלקוחות", "All customers")}</option>
                <option value="segments">{lang("פלחי לקוחות נבחרים", "Specific customer segments")}</option>
              </select>
              {renderSegmentSelection({
                customerEligibilityType: bulkCustomerEligibilityType,
                selectedSegmentIds: bulkSegmentIds,
                customerSegments,
                toggleSegment: (id) => toggleId(setBulkSegmentIds, id),
                lang
              })}
            </div>
          </RuleCard>

          <RuleCard title={lang("מספר שימושים מרבי בהנחה", "Maximum discount uses")}>
            <div className="space-y-3">
              <input
                type="number"
                min="1"
                step="1"
                value={bulkUsageLimit}
                onChange={(event) => setBulkUsageLimit(event.target.value)}
                placeholder={lang("השאירו ריק לשימוש ללא הגבלה", "Leave blank for unlimited total uses")}
                aria-label={lang("מספר שימושים מרבי בהנחה", "Maximum discount uses")}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={bulkAppliesOncePerCustomer}
                  onChange={(event) => setBulkAppliesOncePerCustomer(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {lang("הגבלה לשימוש אחד לכל לקוח", "Limit to one use per customer")}
              </label>
            </div>
          </RuleCard>

          <RuleCard title={lang("שילוב עם הנחות אחרות", "Combinations")}>
            <div className="space-y-3 text-sm text-muted-foreground">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={bulkCombinesWithProductDiscounts}
                  onChange={(event) => setBulkCombinesWithProductDiscounts(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {lang("הנחות על מוצרים", "Product discounts")}
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={bulkCombinesWithOrderDiscounts}
                  onChange={(event) => setBulkCombinesWithOrderDiscounts(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {lang("הנחות על ההזמנה", "Order discounts")}
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={bulkCombinesWithShippingDiscounts}
                  onChange={(event) => setBulkCombinesWithShippingDiscounts(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {lang("הנחות על משלוח", "Shipping discounts")}
              </label>
            </div>
          </RuleCard>

          <RuleCard title={lang("נתיב או כתובת להפניה", "Redirect path or URL")}>
            <input
              dir="ltr"
              value={bulkRedirectPath}
              onChange={(event) => setBulkRedirectPath(event.target.value || "/")}
              aria-label={lang("נתיב או כתובת להפניה", "Redirect path or URL")}
              placeholder={lang(
                "/products/your-product או https://yourstore.com/products/your-product",
                "/products/your-product or https://yourstore.com/products/your-product"
              )}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </RuleCard>

          <RuleCard title={lang("קישורי הפעלה", "Preview links")}>
            <div className="space-y-2">
              {bulkPreviewAffiliates.length ? bulkPreviewAffiliates.map((affiliate) => {
                const code = buildBulkPreviewCode(affiliate, bulkCodePrefix, bulkCodeSuffix, Number(bulkValue || 0) || 0);
                return (
                  <div key={affiliate.id} className="rounded-xl border border-border/60 bg-background px-4 py-3 text-sm">
                    <p className="font-medium">{getAffiliateLabel(affiliate)}</p>
                    <p dir="ltr" className="mt-1 text-muted-foreground">{code}</p>
                    <p dir="ltr" className="mt-1 break-all text-xs text-muted-foreground">
                      {buildPreviewLink(baseStoreUrl, code, affiliate.affiliateCode, bulkRedirectPath)}
                    </p>
                  </div>
                );
              }) : (
                <p className="text-sm text-muted-foreground">
                  {lang(
                    "בחרו שותפות כדי לראות תצוגה מקדימה של קישורי הקופונים שיופקו.",
                    "Select affiliates to preview generated coupon links."
                  )}
                </p>
              )}
              {effectiveBulkAffiliateIds.length > bulkPreviewAffiliates.length ? (
                <p className="text-xs text-muted-foreground">
                  {lang(
                    effectiveBulkAffiliateIds.length - bulkPreviewAffiliates.length === 1
                      ? "ועוד שותפה אחת."
                      : `ועוד ${effectiveBulkAffiliateIds.length - bulkPreviewAffiliates.length} שותפות.`,
                    `Plus ${effectiveBulkAffiliateIds.length - bulkPreviewAffiliates.length} more affiliate${effectiveBulkAffiliateIds.length - bulkPreviewAffiliates.length === 1 ? "" : "s"}.`
                  )}
                </p>
              ) : null}
            </div>
          </RuleCard>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleBulkAssign} disabled={isPending || !effectiveBulkAffiliateIds.length}>
              {isPending
                ? lang("מפיק...", "Creating...")
                : lang(
                    `הפקה כמותית (${effectiveBulkAffiliateIds.length})`,
                    `Create in bulk (${effectiveBulkAffiliateIds.length})`
                  )}
            </Button>
          </div>
        </div>
      )}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
