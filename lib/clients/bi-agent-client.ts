// Brandzp BI Gateway client.
//
// The gateway fronts two internal agents behind a single Cloudflare tunnel:
//
//   /ask           → BI agent (analytics Q&A — "what was last week's CAC?")
//   /creative/ask  → Creative agent (briefs, marketing copy, planner reasoning)
//
// Both endpoints accept the same request shape and return the same envelope:
//   POST  Authorization: Bearer <token>
//         Content-Type: application/json
//         body: {"question": "..."}
//   200   {"ok": true, "agent": "<name>", "answer": "<string>"}
//
// The agent's answer is always a plain string. Structured outputs are
// achieved by instructing the agent to emit JSON in the answer field
// (same pattern as anthropicChatJson) — we then parse it out.
//
// Env:
//   BI_AGENT_URL   — base URL of the tunnel (no trailing slash, no path)
//   BI_AGENT_TOKEN — shared bearer token
//
// Failure mode: a single retry on 5xx / 429 with a 750ms backoff so a
// transient tunnel hiccup doesn't kill a 10-call brief fan-out.

const DEFAULT_TIMEOUT_MS = 90_000;

// Two-tunnel mode: the BI agent and the Creative agent can live behind
// different Cloudflare tunnels with different bearer tokens. When the
// CREATIVE_* env vars are set we use them for the Creative agent; when
// they aren't, we fall back to the BI_* vars (single-tunnel legacy
// behavior — both agents behind one gateway routed by path).
//
// Env vars:
//   BI_AGENT_URL        — REQUIRED. Base URL of the BI-agent tunnel.
//   BI_AGENT_TOKEN      — REQUIRED. Bearer for the BI agent.
//   CREATIVE_AGENT_URL  — OPTIONAL. Base URL of the Creative-agent tunnel.
//                         If unset, falls back to BI_AGENT_URL.
//   CREATIVE_AGENT_TOKEN — OPTIONAL. Bearer for the Creative agent.
//                         If unset, falls back to BI_AGENT_TOKEN.
//
// The Creative agent also expects a different path — /creative/ask on
// the shared-tunnel setup, but just /ask (or whatever path is defined
// on the dedicated Creative tunnel) when CREATIVE_AGENT_URL is set.
// CREATIVE_AGENT_PATH controls this, defaulting to "/ask" when the
// dedicated URL is present and "/creative/ask" otherwise.

type AgentKind = "bi" | "creative";

function getBaseUrl(kind: AgentKind = "bi"): string {
  if (kind === "creative" && process.env.CREATIVE_AGENT_URL?.trim()) {
    return process.env.CREATIVE_AGENT_URL.trim().replace(/\/$/, "");
  }
  const url = process.env.BI_AGENT_URL;
  if (!url) {
    throw new Error("BI_AGENT_URL is not set. Add it to .env (e.g. https://<tunnel>.trycloudflare.com).");
  }
  return url.replace(/\/$/, "");
}

function getToken(kind: AgentKind = "bi"): string {
  if (kind === "creative" && process.env.CREATIVE_AGENT_TOKEN?.trim()) {
    return process.env.CREATIVE_AGENT_TOKEN.trim();
  }
  const token = process.env.BI_AGENT_TOKEN;
  if (!token) {
    throw new Error("BI_AGENT_TOKEN is not set. Add it to .env.");
  }
  return token;
}

function authHeaders(kind: AgentKind = "bi"): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken(kind)}`,
    "Content-Type": "application/json"
  };
}

// The path on the Creative tunnel where the agent listens. When Creative
// is on its OWN tunnel we default to "/ask" (the tunnel routes directly
// to the Creative agent — no path disambiguation needed). When Creative
// shares the BI tunnel we default to "/creative/ask" (legacy).
function getCreativePath(): string {
  const explicit = process.env.CREATIVE_AGENT_PATH?.trim();
  if (explicit) return explicit.startsWith("/") ? explicit : `/${explicit}`;
  if (process.env.CREATIVE_AGENT_URL?.trim()) return "/ask";
  return "/creative/ask";
}

// Returns true if BI agent env is configured. Callers (like the brief
// generator) can branch on this to fall back to a different provider.
export function isBiAgentConfigured(): boolean {
  return Boolean(process.env.BI_AGENT_URL && process.env.BI_AGENT_TOKEN);
}

// Returns true if the Creative agent has usable env — either its own
// dedicated tunnel/token, OR the BI vars (which cover it in shared-tunnel
// mode).
export function isCreativeAgentConfigured(): boolean {
  const hasDedicated =
    Boolean(process.env.CREATIVE_AGENT_URL) && Boolean(process.env.CREATIVE_AGENT_TOKEN);
  return hasDedicated || isBiAgentConfigured();
}

interface AskEnvelope {
  ok?: boolean;
  agent?: string;
  answer?: string;
  error?: string;
}

async function postOnce(
  kind: AgentKind,
  path: string,
  question: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; body: AskEnvelope | null; rawText: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl(kind)}${path}`, {
      method: "POST",
      headers: authHeaders(kind),
      body: JSON.stringify({ question }),
      signal: ctrl.signal
    });
    const rawText = await res.text();
    let body: AskEnvelope | null = null;
    try {
      body = rawText ? (JSON.parse(rawText) as AskEnvelope) : null;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body, rawText };
  } finally {
    clearTimeout(timer);
  }
}

async function ask(
  kind: AgentKind,
  path: string,
  question: string,
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let attempt = await postOnce(kind, path, question, timeoutMs);
  if (!attempt.ok && (attempt.status === 429 || attempt.status >= 500 || attempt.status === 0)) {
    await new Promise((r) => setTimeout(r, 750));
    attempt = await postOnce(kind, path, question, timeoutMs);
  }
  const agentLabel = kind === "creative" ? "Creative agent" : "BI agent";
  if (!attempt.ok) {
    const detail = attempt.body?.error || attempt.rawText.slice(0, 300);
    throw new Error(`${agentLabel} ${attempt.status} on ${path}: ${detail}`);
  }
  if (!attempt.body?.ok) {
    throw new Error(`${agentLabel} rejected the request: ${attempt.body?.error ?? "unknown error"}`);
  }
  return attempt.body.answer ?? "";
}

// ── BI agent (analytics) ────────────────────────────────────────────────

export async function askBiAgent(question: string, opts?: { timeoutMs?: number }): Promise<string> {
  return ask("bi", "/ask", question, opts);
}

// ── Creative agent (briefs, copy, planner reasoning) ────────────────────

export async function askCreativeAgent(question: string, opts?: { timeoutMs?: number }): Promise<string> {
  return ask("creative", getCreativePath(), question, opts);
}

// ── Structured-output helpers ───────────────────────────────────────────
//
// Force the agent to emit a single JSON value by appending a strict
// formatting instruction. Mirrors anthropicChatJson's contract so the two
// providers are drop-in interchangeable.

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
    throw new Error(`BI agent returned invalid JSON (first 300 chars): ${cleaned.slice(0, 300)}`);
  }
}

export async function askCreativeAgentJson<T>(input: { question: string; jsonHint?: string; timeoutMs?: number }): Promise<T> {
  const full = `${input.question}\n\n---\n${JSON_INSTRUCTION}${input.jsonHint ? `\n\nFormat hint: ${input.jsonHint}` : ""}`;
  const text = await askCreativeAgent(full, { timeoutMs: input.timeoutMs });
  return parseJsonResponse<T>(text);
}

export async function askBiAgentJson<T>(input: { question: string; jsonHint?: string; timeoutMs?: number }): Promise<T> {
  const full = `${input.question}\n\n---\n${JSON_INSTRUCTION}${input.jsonHint ? `\n\nFormat hint: ${input.jsonHint}` : ""}`;
  const text = await askBiAgent(full, { timeoutMs: input.timeoutMs });
  return parseJsonResponse<T>(text);
}
