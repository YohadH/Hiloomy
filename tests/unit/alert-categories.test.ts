// /alerts groups the inbox by category (owner, 18 Sep 2026). Severity still
// decides which category surfaces first and the order inside a category.

import { test } from "node:test";
import assert from "node:assert/strict";
import { categorizeAlert, groupAlertsByCategory } from "@/lib/domain/alert-categories";
import type { Alert } from "@/lib/domain/types";

function alert(partial: Partial<Alert> & { id: string; severity: Alert["severity"] }): Alert {
  return { title: partial.id, explanation: "", suggestedAction: "", periodLabel: "", timestamp: "2026-09-18T08:00:00.000Z", ...partial };
}

test("every engine slug in production maps to a named category, unknowns fall to other", () => {
  assert.equal(categorizeAlert({ type: "stockout_imminent" }), "inventory");
  assert.equal(categorizeAlert({ type: "restock_hero" }), "inventory");
  assert.equal(categorizeAlert({ type: "campaign_no_conversion" }), "campaigns");
  assert.equal(categorizeAlert({ type: "roas_collapse" }), "campaigns");
  assert.equal(categorizeAlert({ type: "competitor_promo" }), "competitors");
  assert.equal(categorizeAlert({ type: "plan_decision" }), "plan");
  assert.equal(categorizeAlert({ type: "decision_discount_tradeoff" }), "plan");
  assert.equal(categorizeAlert({ type: "decision_standalone_loss" }), "plan");
  assert.equal(categorizeAlert({ type: "product_gone_silent" }), "products");
  assert.equal(categorizeAlert({ type: "return_rate_high" }), "returns");
  assert.equal(categorizeAlert({ type: "commission_leakage" }), "affiliates");
  // Rule alerts computed on the fly.
  assert.equal(categorizeAlert({ type: "revenue_down" }), "money");
  assert.equal(categorizeAlert({ type: "discount_spike" }), "money");
  assert.equal(categorizeAlert({ type: "refund_spike" }), "returns");
  assert.equal(categorizeAlert({ type: "repeat_rate_drop" }), "customers");
  assert.equal(categorizeAlert({ type: "product_growth" }), "products");
  // Legacy rows without a slug fall back to the linked entity, then to other.
  assert.equal(categorizeAlert({ type: "legacy", relatedEntityType: "product" }), "products");
  assert.equal(categorizeAlert({ type: "legacy" }), "other");
  assert.equal(categorizeAlert({}), "other");
});

test("categories are ordered by worst severity, then fixed order; alerts inside by severity then newest", () => {
  const groups = groupAlertsByCategory([
    alert({ id: "comp-low", type: "competitor_promo", severity: "low" }),
    alert({ id: "camp-med", type: "roas_collapse", severity: "medium" }),
    alert({ id: "stock-crit", type: "stockout_imminent", severity: "critical" }),
    alert({ id: "hero-med-old", type: "restock_hero", severity: "medium", timestamp: "2026-09-10T08:00:00.000Z" }),
    alert({ id: "hero-med-new", type: "restock_hero", severity: "medium", timestamp: "2026-09-17T08:00:00.000Z" }),
    alert({ id: "plan-high", type: "plan_decision", severity: "high" })
  ]);
  assert.deepEqual(groups.map((g) => g.category.id), ["inventory", "plan", "campaigns", "competitors"]);
  const inventory = groups[0];
  assert.deepEqual(inventory.alerts.map((a) => a.id), ["stock-crit", "hero-med-new", "hero-med-old"]);
  assert.equal(inventory.worst, "critical");
  assert.deepEqual(inventory.counts, { critical: 1, high: 0, medium: 2, low: 0 });
});

test("empty categories are omitted and nothing is dropped", () => {
  const input = [alert({ id: "a", type: "made_up_slug", severity: "low" }), alert({ id: "b", type: "commission_leakage", severity: "high" })];
  const groups = groupAlertsByCategory(input);
  assert.equal(groups.reduce((n, g) => n + g.alerts.length, 0), input.length);
  assert.deepEqual(groups.map((g) => g.category.id), ["affiliates", "other"]);
  assert.deepEqual(groupAlertsByCategory([]), []);
});
