// Unit tests for the affiliate CSV export row builder. The original
// positional array shipped 28 cells under 30 headers, shifting every value
// from "Facebook" onward under the wrong column.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:9/hermetic-test";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_EXPORT_COLUMNS,
  buildAffiliateExportRow
} from "@/lib/services/affiliate-portal-directory-service";

const affiliate = {
  email: "sara@example.com",
  firstName: "Sara",
  lastName: "Levi",
  country: "IL",
  instagramProfileUrl: "https://instagram.com/sara",
  programName: "Affiliate Program",
  shortLink: "https://shop.example/s/SARA",
  affiliateCode: "SARA",
  referralLink: "https://shop.example/?ref=SARA",
  couponCode: "SARA15",
  status: "approved",
  dateJoined: "2026-01-01T00:00:00.000Z",
  lastLogin: null
};

test("row cell count always equals the header count", () => {
  const row = buildAffiliateExportRow(affiliate);
  assert.equal(SAMPLE_EXPORT_COLUMNS.length, 30);
  assert.equal(row.length, SAMPLE_EXPORT_COLUMNS.length);
});

test("each value lands under its own header (regression for the column shift)", () => {
  const row = buildAffiliateExportRow(affiliate);
  const cell = (header: string) => row[SAMPLE_EXPORT_COLUMNS.indexOf(header as never)];

  assert.equal(cell("Email"), "sara@example.com");
  assert.equal(cell("Instagram"), "https://instagram.com/sara");
  assert.equal(cell("Facebook"), "");
  assert.equal(cell("Program"), "Affiliate Program");
  assert.equal(cell("Shortlink"), "https://shop.example/s/SARA");
  assert.equal(cell("Referral code"), "SARA");
  assert.equal(cell("Network link"), "https://shop.example/?ref=SARA");
  assert.equal(cell("Coupons"), "SARA15");
  assert.equal(cell("Status"), "approved");
  assert.equal(cell("Approved"), "Yes");
  assert.equal(cell("Date created"), "2026-01-01T00:00:00.000Z");
  assert.equal(cell("Last login"), "");
});

test("non-approved status exports Approved=No", () => {
  const row = buildAffiliateExportRow({ ...affiliate, status: "pending" });
  assert.equal(row[SAMPLE_EXPORT_COLUMNS.indexOf("Approved" as never)], "No");
});

test("nullable fields export as empty strings, never 'null'", () => {
  const row = buildAffiliateExportRow({ ...affiliate, instagramProfileUrl: null, couponCode: null });
  for (const value of row) {
    assert.notEqual(value, "null");
    assert.notEqual(value, "undefined");
  }
});
