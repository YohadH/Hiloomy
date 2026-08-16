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
//   1. Brandzp BI agent (askBiAgentJson) — primary. Domain-tuned, runs
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

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

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
// Useful for the print page footer ("Written by Brandzp BI" vs "OpenAI").
export async function generateInsightsJsonTraced<T>(input: GenerateInsightsInput): Promise<GenerateInsightsResult<T>> {
  const biActive = isBiAgentConfigured() && process.env.BI_AGENT_DISABLE !== "1";
  const timeoutMs = input.timeoutMs ?? 90_000;

  // ── 1. Try BI agent ────────────────────────────────────────────────
  if (biActive) {
    try {
      const combined = `${input.systemPrompt}\n\n---\n\n${input.userPrompt}`;
      const data = await askBiAgentJson<T>({
        question: combined,
        jsonHint: input.jsonHint,
        timeoutMs
      });
      return { data, trace: { provider: "bi" } };
    } catch (err) {
      console.warn("[ai-insights] BI agent failed, trying OpenAI:", err instanceof Error ? err.message : err);
    }
  }

  // ── 2. Fall back to OpenAI ─────────────────────────────────────────
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      data: null,
      trace: { provider: null, reason: biActive ? "bi-failed-no-openai-key" : "no-bi-no-openai-key" }
    };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let parsed: T | null = null;
    try {
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.openaiModel ?? "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: input.userPrompt }
          ],
          temperature: input.temperature ?? 0.5,
          max_tokens: input.maxTokens ?? 900
        })
      });
      if (!response.ok) {
        return { data: null, trace: { provider: null, reason: `openai-${response.status}` } };
      }
      const payload = (await response.json()) as OpenAIChatResponse;
      if (payload.error) {
        return { data: null, trace: { provider: null, reason: payload.error.message ?? "openai-error" } };
      }
      const raw = payload.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        return { data: null, trace: { provider: null, reason: "openai-empty" } };
      }
      parsed = JSON.parse(raw) as T;
    } finally {
      clearTimeout(timer);
    }
    return { data: parsed, trace: { provider: "openai" } };
  } catch (err) {
    return {
      data: null,
      trace: { provider: null, reason: err instanceof Error ? err.message : String(err) }
    };
  }
}
