// Template cells — field labels with nothing after the colon — are not
// tasks. Real tasks (a value, a code, a sentence) must never be dropped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isLabelOnlyCell } from "@/lib/services/gantt-parser-service";

test("labels with empty values are skipped", () => {
  assert.equal(isLabelOnlyCell("מסר \r\nמבצע\r\nקופון\r\nהתניות\r\nקהלים:"), true);
  assert.equal(isLabelOnlyCell("Message:\nOffer:\nCoupon:"), true);
  assert.equal(isLabelOnlyCell("   "), true);
});

test("a filled template is a task", () => {
  assert.equal(isLabelOnlyCell("מסר: מבצע ראש השנה\nמבצע: 15% הנחה\nקופון: EXTRANAP"), false);
  assert.equal(isLabelOnlyCell("קופון: CODE: EXTRANAP"), false);
});

test("short real tasks are kept", () => {
  assert.equal(isLabelOnlyCell("סטורי 20% הנחה"), false);
  assert.equal(isLabelOnlyCell("Newsletter about the new set of three"), false);
  assert.equal(isLabelOnlyCell("https://takeanap.co.il"), false);
});

test("a single-word label without a colon is still scaffolding", () => {
  assert.equal(isLabelOnlyCell("קהלים"), true);
});
