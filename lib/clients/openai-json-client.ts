// One-shot OpenAI JSON helper — the cloud providers the BI and Creative
// chat widgets already use (bi-chat-service.ts / creative-agent-chat-
// service.ts), exposed for services that need a single structured answer
// rather than a streamed tool-calling turn.
//
// TWO SEPARATE ACCOUNTS (owner: "1 account for creative and 1 for BI" so
// spend is trackable apart):
//   kind "bi"       → OPENAI_API_KEY               + BI_CHAT_MODEL
//   kind "creative" → CREATIVE_CHAT_OPENAI_API_KEY + CREATIVE_CHAT_MODEL
//                     (CREATIVE_CHAT_OPENAI_API_KEY falls back to
//                      OPENAI_API_KEY until the dedicated key is set)
//
// Uses the OpenAI SDK (Responses API) with an EXPLICIT apiKey so the right
// account is billed — verified working on this account with gpt-5.6-terra.
// The older ai-insights-client hardcodes api.openai.com + gpt-4o-mini; prefer
// THIS helper wherever the account's pinned model matters.
//
// Structured output is achieved by instructing the model to emit a single
// JSON value (mirrors bi-agent-client / anthropicChatJson) and parsing it
// defensively, rather than relying on response_format — which differs
// between the chat/completions and Responses surfaces.

import OpenAI from "openai";

export type OpenAiJsonAccount = "bi" | "creative";

const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_TIMEOUT_MS = 90_000;

function resolveApiKey(kind: OpenAiJsonAccount): string | null {
  if (kind === "creative") {
    const dedicated = process.env.CREATIVE_CHAT_OPENAI_API_KEY?.trim();
    if (dedicated) return dedicated;
  }
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function isOpenAiConfigured(kind: OpenAiJsonAccount = "bi"): boolean {
  return resolveApiKey(kind) !== null;
}

function modelFor(kind: OpenAiJsonAccount): string {
  const override =
    kind === "creative"
      ? process.env.CREATIVE_CHAT_MODEL?.trim()
      : process.env.BI_CHAT_MODEL?.trim();
  return override || DEFAULT_MODEL;
}

const JSON_INSTRUCTION =
  "Output ONLY a single valid JSON value with no markdown fences, no prose, no explanation. " +
  "If asked for an array, output the bare JSON array. " +
  "If asked for an object, output the bare JSON object. " +
  "Start your response with `{` or `[` and end with `}` or `]`.";

function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start > 0) cleaned = cleaned.slice(start);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`OpenAI returned invalid JSON (first 300 chars): ${cleaned.slice(0, 300)}`);
  }
}

export async function askOpenAiJson<T>(input: {
  question: string;
  jsonHint?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  // Which billing account + model pin to use. Defaults to the BI account.
  account?: OpenAiJsonAccount;
}): Promise<T> {
  const kind = input.account ?? "bi";
  const apiKey = resolveApiKey(kind);
  if (!apiKey) {
    throw new Error(
      kind === "creative"
        ? "No creative OpenAI key. Set CREATIVE_CHAT_OPENAI_API_KEY (or OPENAI_API_KEY)."
        : "No BI OpenAI key. Set OPENAI_API_KEY."
    );
  }
  const client = new OpenAI({ apiKey, timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  const full =
    `${input.question}\n\n---\n${JSON_INSTRUCTION}` +
    (input.jsonHint ? `\n\nFormat hint: ${input.jsonHint}` : "");

  const response = (await client.responses.create({
    model: modelFor(kind),
    input: full,
    max_output_tokens: input.maxOutputTokens ?? 3000
  } as never)) as unknown as { output_text?: string };

  return parseJsonResponse<T>(response.output_text ?? "");
}
