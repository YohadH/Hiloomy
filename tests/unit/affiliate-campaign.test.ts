import { test } from "node:test";
import assert from "node:assert/strict";
import { briefIsLate, isBriefFormat, isBriefStatus, isCampaignStatus, pickBriefForClick } from "../../lib/domain/affiliate-campaign";

const day = 86_400_000;

test("value-set guards accept only the documented strings", () => {
  assert.equal(isCampaignStatus("active"), true);
  assert.equal(isCampaignStatus("ACTIVE"), false);
  assert.equal(isBriefFormat("reel"), true);
  assert.equal(isBriefFormat("tiktok"), false);
  assert.equal(isBriefStatus("posted"), true);
  assert.equal(isBriefStatus(null), false);
});

test("a planned brief is late only a full day after its due date; posted briefs never are", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  assert.equal(briefIsLate({ status: "planned", dueDate: new Date(now.getTime() - 2 * day) }, now), true);
  assert.equal(briefIsLate({ status: "planned", dueDate: new Date(now.getTime() - 0.5 * day) }, now), false);
  assert.equal(briefIsLate({ status: "planned", dueDate: new Date(now.getTime() + day) }, now), false);
  assert.equal(briefIsLate({ status: "posted", dueDate: new Date(now.getTime() - 10 * day) }, now), false);
});

test("pickBriefForClick prefers the planned brief nearest to now, then the most recent of any status", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const briefs = [
    { id: "old-posted", status: "posted", dueDate: new Date(now.getTime() - 20 * day) },
    { id: "far-planned", status: "planned", dueDate: new Date(now.getTime() + 15 * day) },
    { id: "near-planned", status: "planned", dueDate: new Date(now.getTime() + 1 * day) }
  ];
  assert.equal(pickBriefForClick(briefs, now)?.id, "near-planned");
  const none = briefs.filter((b) => b.status !== "planned");
  assert.equal(pickBriefForClick(none, now)?.id, "old-posted");
  assert.equal(pickBriefForClick([], now), null);
  const two = [
    { id: "a", status: "missed", dueDate: new Date(now.getTime() - 9 * day) },
    { id: "b", status: "posted", dueDate: new Date(now.getTime() - 3 * day) }
  ];
  assert.equal(pickBriefForClick(two, now)?.id, "b");
});
