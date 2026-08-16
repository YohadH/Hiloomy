// Anthropic Messages API client — thin fetch wrapper, no SDK.
//
// Mirrors the style of `creative-ai-openai-service.ts`: direct REST calls,
// Bearer-ish auth via the x-api-key header, env-var configuration.
// Built for the Creative Sprint brief generator (chats) and any future
// LLM-driven feature that needs Claude. Structured-output mode forces the
// model to emit valid JSON by injecting a system instruction and parsing
// the first content block — saves us from a `tool_use` round-trip when the
// caller just wants a typed object.
//
// Auth: x-api-key: <ANTHROPIC_API_KEY>, anthropic-version: 2023-06-01.
//
// Defaults:
//   model       = claude-sonnet-4-6  (overrideable per call or via env)
//   max tokens  = 4096
//
// One retry on 5xx / 429 with a 750ms backoff so a single transient
// rate-limit doesn't blow up a 10-call brief-generation fan-out.

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env to use the Anthropic provider.");
  }
  return key;
}

function getBaseUrl(): string {
  return (process.env.ANTHROPIC_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getDefaultModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type?: string; message?: string };
}

export interface AnthropicChatInput {
  system?: string;
  messages: AnthropicMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AnthropicChatOutput {
  text: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

async function postOnce(body: unknown): Promise<{ ok: boolean; status: number; json: AnthropicResponse | null; rawText: string }> {
  const res = await fetch(`${getBaseUrl()}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "anthropic-version": DEFAULT_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const rawText = await res.text();
  let json: AnthropicResponse | null = null;
  try {
    json = rawText ? (JSON.parse(rawText) as AnthropicResponse) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, rawText };
}

export async function anthropicChat(input: AnthropicChatInput): Promise<AnthropicChatOutput> {
  const model = input.model || getDefaultModel();
  const body: Record<string, unknown> = {
    model,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: input.messages
  };
  if (input.system) body.system = input.system;
  if (typeof input.temperature === "number") body.temperature = input.temperature;

  let attempt = await postOnce(body);
  if (!attempt.ok && (attempt.status === 429 || attempt.status >= 500)) {
    await new Promise((r) => setTimeout(r, 750));
    attempt = await postOnce(body);
  }

  if (!attempt.ok) {
    const message =
      attempt.json?.error?.message ||
      `Anthropic API ${attempt.status}: ${attempt.rawText.slice(0, 200)}`;
    throw new Error(message);
  }

  const json = attempt.json;
  if (!json) {
    throw new Error("Anthropic returned an empty body");
  }
  const textBlock = json.content?.find((c) => c.type === "text");
  const text = textBlock?.text ?? "";
  return {
    text,
    modelUsed: model,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0
  };
}

// Force the model to emit a single JSON object that matches the caller's
// expectation. We append a stern "output JSON only" instruction to the
// system prompt, then strip the common LLM mistakes (markdown fences,
// leading prose) before parsing. If parsing still fails, throw — the
// caller should treat this as a retry-worthy error.
//
// We don't use Anthropic's tool-use loop because the round-trip cost for
// a one-shot structured response isn't worth it; rejection-sampling on
// the parse step is simpler and faster.
export async function anthropicChatJson<T>(
  input: AnthropicChatInput & { jsonHint?: string }
): Promise<T> {
  const systemPrefix =
    input.system ?? "You are a precise assistant that always outputs valid JSON only.";
  const jsonInstruction =
    "Output ONLY a single valid JSON value with no markdown fences, no prose, no explanation. " +
    "If asked for an array, output the bare JSON array. " +
    "If asked for an object, output the bare JSON object. " +
    "Start your response with `{` or `[` and end with `}` or `]`.";
  const system = `${systemPrefix}\n\n${jsonInstruction}${input.jsonHint ? `\n\nFormat hint: ${input.jsonHint}` : ""}`;

  const result = await anthropicChat({ ...input, system });
  return parseJsonResponse<T>(result.text);
}

function parseJsonResponse<T>(text: string): T {
  // Strip markdown fences (```json ... ``` or ``` ... ```)
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // Skip any leading prose by finding the first `{` or `[`.
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start > 0) cleaned = cleaned.slice(start);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `Anthropic returned invalid JSON (first 300 chars): ${cleaned.slice(0, 300)}`
    );
  }
}
