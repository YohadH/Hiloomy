// Unified AI commentary helper for the weekly/monthly reports.
//
// Every "AI insights" service in this codebase has the same shape:
//   1. Build a system + user prompt
//   2. Call an LLM, expect a JSON object response
//   3. Parse it; fall back to deterministic content if the call fails
//
// This helper centralises that contract behind a single function so all
// the per-feature services can use the same provider waterfall:
//
//   1. BI agent (askBiAgentJson) — primary. Domain-tuned, runs
//      through our tunnel, no per-call cost beyond what the tunnel does.
//   2. OpenAI gpt-4o-mini — fallback if BI agent is unconfigured OR
//      throws. Costs about $0.0008 per call.
//   3. Returns null if both fail — callers should use their own deterministic
//      fallback content (don't fabricate insights).
//
// The BI agent receives `${systemPrompt}\n\n---\n\n${userPrompt}` since it
// doesn't have a separate system role; the JSON instruction is injected
// by askBiAgentJson under the hood.

import { askBiAgentJson, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";
import { askOpenAiJson, isOpenAiConfigured } from "@/lib/clients/openai-json-client";

export interface GenerateInsightsInput {
  systemPrompt: string;
  userPrompt: string;
  // OpenAI fallback options (ignored when BI agent succeeds).
  openaiModel?: string;
  temperature?: number;
  maxTokens?: number;
  // BI agent hint: short string telling the agent what JSON shape to emit.
  jsonHint?: string;
  // Override the call timeout (default 90s). BI agent gets the same.
  timeoutMs?: number;
}

export interface GenerateInsightsTrace {
  provider: "bi" | "openai" | null;
  reason?: string;
}

export interface GenerateInsightsResult<T> {
  data: T | null;
  trace: GenerateInsightsTrace;
}

export async function generateInsightsJson<T>(input: GenerateInsightsInput): Promise<T | null> {
  const result = await generateInsightsJsonTraced<T>(input);
  return result.data;
}

// Same as generateInsightsJson but also returns which provider succeeded.
// Useful for the print page footer ("Written by Hiloomy BI" vs "OpenAI").
//
// Provider order is now OpenAI-FIRST (the BI account actually deployed on
// production), then the self-hosted BI tunnel when configured. The tunnel
// points at a localhost agent that isn't reachable in production, so making
// it primary meant every report silently fell through to it and failed.
export async function generateInsightsJsonTraced<T>(input: GenerateInsightsInput): Promise<GenerateInsightsResult<T>> {
  const timeoutMs = input.timeoutMs ?? 90_000;
  const combined = `${input.systemPrompt}\n\n---\n\n${input.userPrompt}`;
  const biTunnelActive = isBiAgentConfigured() && process.env.BI_AGENT_DISABLE !== "1";

  // ── 1. OpenAI (BI account, pinned model via BI_CHAT_MODEL) ─────────
  if (isOpenAiConfigured("bi")) {
    try {
      const data = await askOpenAiJson<T>({
        question: combined,
        jsonHint: input.jsonHint,
        timeoutMs,
        maxOutputTokens: input.maxTokens ?? 1500,
        account: "bi"
      });
      return { data, trace: { provider: "openai" } };
    } catch (err) {
      console.warn("[ai-insights] OpenAI failed, trying BI tunnel:", err instanceof Error ? err.message : err);
    }
  }

  // ── 2. Fall back to the self-hosted BI tunnel, if configured ───────
  if (biTunnelActive) {
    try {
      const data = await askBiAgentJson<T>({ question: combined, jsonHint: input.jsonHint, timeoutMs });
      return { data, trace: { provider: "bi" } };
    } catch (err) {
      console.warn("[ai-insights] BI tunnel failed:", err instanceof Error ? err.message : err);
    }
  }

  return {
    data: null,
    trace: {
      provider: null,
      reason: isOpenAiConfigured("bi") ? "openai-failed" : "no-openai-key"
    }
  };
}
