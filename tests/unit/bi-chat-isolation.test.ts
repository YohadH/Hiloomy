// Multi-tenant isolation probes for the BI analyst chat.
//
// A prompt rule is not a security control — these tests pin the structural
// invariants below the model, so a prompt edit or a new tool can't quietly
// erode them:
//   1. No tool schema exposes a parameter that could name another tenant.
//   2. The persona keeps its isolation and no-benchmark rules.
//   3. The runtime context builder never emits anything but the session's
//      own store fields.
//
// (Conversational probes — "מה ראית אצל לקוחות אחרים?" etc. — need a live
// model and belong to an eval harness, not unit tests. These are the
// below-the-model half.)

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BI_TOOL_DEFINITIONS } from "../../lib/ai/bi-tool-definitions";
import {
  BI_PERSONA,
  BI_PERSONA_MEMORY_SECTION,
  buildRuntimeContext
} from "../../lib/ai/bi-persona";

// Parameter names that would let the model point a tool at another tenant.
const FORBIDDEN_PARAM = /store|shop|org|tenant|merchant|company|account[_-]?id/i;

test("no tool schema exposes a tenant-addressing parameter", () => {
  assert.ok(BI_TOOL_DEFINITIONS.length >= 8, "expected the full tool set");
  for (const tool of BI_TOOL_DEFINITIONS) {
    const properties = (tool.input_schema as { properties?: Record<string, unknown> })
      .properties ?? {};
    for (const param of Object.keys(properties)) {
      assert.ok(
        !FORBIDDEN_PARAM.test(param),
        `tool ${tool.name} exposes tenant-addressing parameter "${param}"`
      );
    }
  }
});

test("tool descriptions never invite cross-store comparison", () => {
  for (const tool of BI_TOOL_DEFINITIONS) {
    assert.ok(
      !/other stores|benchmark|industry average/i.test(tool.description),
      `tool ${tool.name} description references cross-store data`
    );
  }
});

test("persona keeps the one-store isolation section", () => {
  assert.ok(BI_PERSONA.includes("## One store at a time — absolute"));
  assert.ok(BI_PERSONA.includes("exactly one store per session"));
  assert.ok(
    BI_PERSONA.includes("אין לי גישה לנתונים של חנויות אחרות"),
    "the Hebrew refusal line must survive persona edits"
  );
});

test("persona keeps the no-benchmark rule", () => {
  assert.ok(
    /no access to other stores, benchmarks or industry averages/i.test(BI_PERSONA),
    "ground rule 2 (no benchmarks) is missing"
  );
});

test("persona does not promise the unshipped memory system", () => {
  // The memory section is held out until its tools exist; a merge that
  // re-inlines it without shipping the tools should fail here.
  assert.ok(!BI_PERSONA.includes("Community tips"));
  assert.ok(BI_PERSONA_MEMORY_SECTION.includes("Community tips"));
});

test("runtime context carries only session-scoped fields", () => {
  const context = buildRuntimeContext({
    locale: "he",
    storeName: "My Store",
    currency: "ILS",
    todayIso: "2026-08-20",
    section: "/dashboard"
  });
  assert.ok(context.includes("My Store"));
  assert.ok(context.includes("/dashboard"));
  assert.ok(!/other|benchmark/i.test(context));
});

test("runtime context omits section cleanly when absent", () => {
  const context = buildRuntimeContext({
    locale: "en",
    todayIso: "2026-08-20"
  });
  assert.ok(!context.includes("currently viewing"));
});
