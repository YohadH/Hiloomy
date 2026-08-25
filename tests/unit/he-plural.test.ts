// Hebrew count phrases (F-005/F-053/F-069/F-075): n=1 must invert to
// "התראה אחת", never "1 התראות" — and never the concatenation bug that
// produced "3 התראהות".

import { test } from "node:test";
import assert from "node:assert/strict";
import { heCount, heCountPhrase } from "@/lib/i18n/he-plural";

const ALERT = { one: "התראה אחת", many: "התראות" };

test("heCount inverts number-noun order at n=1", () => {
  assert.equal(heCount(1, ALERT), "התראה אחת");
});

test("heCount renders count + plural noun for n>1", () => {
  assert.equal(heCount(3, ALERT), "3 התראות");
});

test("heCountPhrase agrees the rest of the sentence in number", () => {
  const rest = { one: "גבוהה פתוחה", many: "גבוהות פתוחות" };
  assert.equal(heCountPhrase(1, ALERT, rest), "התראה אחת גבוהה פתוחה");
  assert.equal(heCountPhrase(3, ALERT, rest), "3 התראות גבוהות פתוחות");
});

test("heCountPhrase never produces the התראהות concatenation bug", () => {
  for (let n = 0; n <= 5; n += 1) {
    assert.ok(!heCountPhrase(n, ALERT).includes("התראהות"));
  }
});
