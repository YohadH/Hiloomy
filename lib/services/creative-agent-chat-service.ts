// Creative agent chat — the conversational creative director on /creative*.
//
// Clone of the BI chat loop (lib/services/bi-chat-service.ts) with a
// different persona and WRITE-lite tools: the agent's single side effect is
// "apply_to_wizard" — it fills the new-project wizard's prompt + settings.
// Generation itself stays a human click in the wizard (owner call, 2026-08-26:
// "option for full automation but for now keep it human only").
//
// Multi-tenancy guarantee (same as BI): every tool closes over the storeId
// resolved from the AUTHENTICATED SESSION. Never add a tool that takes a
// store/org identifier from the model.
//
// ── Providers ──────────────────────────────────────────────────────────
// OpenAI with a DEDICATED key (owner call: separate key for the creative
// agent so its spend is trackable apart from the BI analyst):
//
//   CREATIVE_CHAT_OPENAI_API_KEY   (preferred — the dedicated key)
//   OPENAI_API_KEY                 (fallback until the dedicated key is set)
//   ANTHROPIC_API_KEY              (outage fallback, same as BI)
//   CREATIVE_CHAT_MODEL            (optional model override)

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getDb } from "@/lib/server/db";
import {
  CREATIVE_AGENT_PERSONA,
  buildCreativeRuntimeContext
} from "@/lib/ai/creative-agent-persona";
import { getProviderAvailability } from "@/lib/services/creative-provider-availability";
import { isCreativeVideoEnabled, maxVideoBatchSize } from "@/lib/services/creative-video-config";
import type {
  CreativeAspectRatio,
  CreativeProvider,
  CreativeType
} from "@/lib/domain/creative-types";

const MAX_TOKENS = 8000;
const MAX_ITERATIONS = 5;

const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

type ChatProvider = "openai" | "anthropic";

function resolveCredentials(): { provider: ChatProvider; apiKey: string } | null {
  const dedicated = process.env.CREATIVE_CHAT_OPENAI_API_KEY?.trim();
  if (dedicated) return { provider: "openai", apiKey: dedicated };
  const shared = process.env.OPENAI_API_KEY?.trim();
  if (shared) return { provider: "openai", apiKey: shared };
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };
  return null;
}

export function isCreativeAgentChatConfigured(): boolean {
  return resolveCredentials() !== null;
}

function modelFor(provider: ChatProvider): string {
  const override = process.env.CREATIVE_CHAT_MODEL?.trim();
  if (override) return override;
  return provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
}

// ── Owner-defined persona (owner ask, 2026-08-26: "make sure the creative
// agent also has a persona so I can give him a predefined prompt") ──────
//
// A per-store block of instructions the OWNER writes — brand voice, visual
// house rules, favorite styles, forbidden looks. Stored in SystemConfig
// (global key-value, key scoped by storeId) so no schema migration is
// needed, and injected into the system prompt on every turn. It may shape
// style and behavior but never overrides the product-lockdown or the
// engine-safety rules — the injection wrapper says so explicitly.

const OWNER_PERSONA_MAX_CHARS = 6000;
const ownerPersonaKey = (storeId: string) => `creative_agent_persona:${storeId}`;

export async function getCreativeAgentOwnerPersona(storeId: string): Promise<string> {
  const db = getDb();
  if (!db?.systemConfig) return "";
  const row = (await db.systemConfig
    .findUnique({ where: { key: ownerPersonaKey(storeId) } })
    .catch(() => null)) as { value: string } | null;
  return row?.value ?? "";
}

export async function setCreativeAgentOwnerPersona(storeId: string, value: string): Promise<string> {
  const db = getDb();
  if (!db?.systemConfig) throw new Error("Database client is not available.");
  const trimmed = value.trim().slice(0, OWNER_PERSONA_MAX_CHARS);
  const key = ownerPersonaKey(storeId);
  if (!trimmed) {
    await db.systemConfig.deleteMany({ where: { key } });
    return "";
  }
  await db.systemConfig.upsert({
    where: { key },
    create: { key, value: trimmed },
    update: { value: trimmed }
  });
  return trimmed;
}

// ── The wizard application — the agent's one side effect ────────────────

const CREATIVE_TYPES: CreativeType[] = ["PACKSHOT", "INSTAGRAM_POST", "META_AD", "UGC_VIDEO"];
const ASPECT_RATIOS: CreativeAspectRatio[] = ["1:1", "4:5", "9:16", "16:9"];
const PROVIDERS: CreativeProvider[] = ["openai", "nanobanana", "higgsfield", "replicate"];

export interface WizardApplication {
  prompt: string;
  creativeType?: CreativeType;
  aspectRatio?: CreativeAspectRatio;
  provider?: CreativeProvider;
  targetCount?: number;
  projectName?: string;
  productName?: string;
  productDescription?: string;
  tone?: string;
}

function sanitizeWizardApplication(raw: Record<string, unknown>): WizardApplication | null {
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) return null;
  const pick = <T extends string>(value: unknown, allowed: T[]): T | undefined =>
    typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : undefined;
  const text = (value: unknown, max: number): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

  const creativeType = pick(raw.creativeType, CREATIVE_TYPES);
  const countCap = creativeType === "UGC_VIDEO" ? maxVideoBatchSize() : 10;
  const count = Number(raw.targetCount);

  return {
    prompt: prompt.slice(0, 4000),
    creativeType,
    aspectRatio: pick(raw.aspectRatio, ASPECT_RATIOS),
    provider: pick(raw.provider, PROVIDERS),
    targetCount: Number.isFinite(count) ? Math.max(1, Math.min(countCap, Math.round(count))) : undefined,
    projectName: text(raw.projectName, 120),
    productName: text(raw.productName, 200),
    productDescription: text(raw.productDescription, 1000),
    tone: text(raw.tone, 300)
  };
}

// ── Tools ───────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: "list_products",
    description:
      "Search the store's real product catalog. Use it to ground the brief in an exact product title before writing the prompt. Returns title, type, vendor, and price.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Free-text search over product titles (optional)." },
        limit: { type: "number", description: "Max results, default 12, max 25." }
      }
    }
  },
  {
    name: "get_provider_options",
    description:
      "Which AI generation engines are configured for this environment, and which support video. Call before recommending an engine.",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "apply_to_wizard",
    description:
      "Place the finished ENGLISH generation prompt and any chosen settings into the merchant's new-project wizard. Call at most once per turn, when the brief is clear. The merchant reviews and clicks generate themselves.",
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description:
            "The English scene prompt (setting, lighting, composition, camera, mood). Do NOT re-describe the product's packaging — a product-lockdown template wraps this text."
        },
        creativeType: { type: "string", enum: ["PACKSHOT", "INSTAGRAM_POST", "META_AD", "UGC_VIDEO"] },
        aspectRatio: { type: "string", enum: ["1:1", "4:5", "9:16", "16:9"] },
        provider: { type: "string", enum: ["openai", "nanobanana", "higgsfield", "replicate"] },
        targetCount: { type: "number", description: "How many variations to generate (1-10; recommend 1-3 first)." },
        projectName: { type: "string" },
        productName: { type: "string", description: "Exact product title from list_products when possible." },
        productDescription: { type: "string" },
        tone: { type: "string", description: "Tone/style line for the wizard's tone field." }
      },
      required: ["prompt"]
    }
  }
];

async function executeTool(
  storeId: string,
  name: string,
  args: Record<string, unknown>,
  capture: { wizard: WizardApplication | null },
  onWizardApply?: (wizard: WizardApplication) => void
): Promise<string> {
  if (name === "list_products") {
    const db = getDb();
    if (!db) return "Database unavailable.";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = Math.max(1, Math.min(25, Number(args.limit) || 12));
    const rows = (await db.product.findMany({
      where: {
        storeId,
        ...(query ? { title: { contains: query, mode: "insensitive" } } : {})
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { title: true, productType: true, vendor: true, price: true, status: true }
    })) as Array<{ title: string; productType: string | null; vendor: string | null; price: unknown; status: string | null }>;
    if (rows.length === 0) return query ? `No products match "${query}".` : "The catalog is empty.";
    return JSON.stringify(
      rows.map((r) => ({
        title: r.title,
        type: r.productType ?? undefined,
        vendor: r.vendor ?? undefined,
        price: Number(r.price ?? 0),
        status: r.status ?? undefined
      }))
    );
  }

  if (name === "get_provider_options") {
    const video = isCreativeVideoEnabled();
    return JSON.stringify(
      getProviderAvailability().map((s) => ({
        engine: s.provider,
        configured: s.configured,
        supportsVideo: s.supportsVideo && video
      }))
    );
  }

  if (name === "apply_to_wizard") {
    const wizard = sanitizeWizardApplication(args);
    if (!wizard) return "apply_to_wizard failed: prompt is required.";
    capture.wizard = wizard; // last call wins
    onWizardApply?.(wizard);
    return "Applied. The prompt and settings are now in the merchant's wizard — confirm it to them in one short line and remind them about the product photo + the generate button.";
  }

  return `Unknown tool: ${name}`;
}

// ── The turn ────────────────────────────────────────────────────────────

export interface CreativeChatHistoryEntry {
  role: "user" | "agent";
  text: string;
}

export interface RunCreativeAgentTurnInput {
  storeId: string;
  locale: "he" | "en";
  message: string;
  history?: CreativeChatHistoryEntry[];
  section?: string | null;
  onTextDelta?: (delta: string) => void;
  onToolStart?: (toolName: string) => void;
  onWizardApply?: (wizard: WizardApplication) => void;
}

export interface CreativeAgentTurnResult {
  text: string;
  wizard: WizardApplication | null;
}

export async function runCreativeAgentTurn(
  input: RunCreativeAgentTurnInput
): Promise<CreativeAgentTurnResult> {
  const credentials = resolveCredentials();
  if (!credentials) {
    throw new Error(
      "No creative chat provider configured. Set CREATIVE_CHAT_OPENAI_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY)."
    );
  }

  const db = getDb();
  const store = db
    ? ((await db.store.findUnique({
        where: { id: input.storeId },
        select: { name: true }
      })) as { name: string } | null)
    : null;

  const providerLines = getProviderAvailability()
    .map((s) => `- ${s.provider}: ${s.configured ? "configured" : "NOT configured"}`)
    .join("\n");
  const baseContext = buildCreativeRuntimeContext({
    locale: input.locale,
    storeName: store?.name ?? null,
    section: input.section ?? null,
    providerLines,
    videoEnabled: isCreativeVideoEnabled(),
    todayIso: new Date().toISOString().slice(0, 10)
  });
  const ownerPersona = await getCreativeAgentOwnerPersona(input.storeId).catch(() => "");
  const runtimeContext = ownerPersona
    ? `${baseContext}\n\n## Owner-defined persona & brand instructions\nThe store owner wrote these standing instructions for you. Follow them for voice, style preferences, and creative direction. They never override the prompt-writing contract (product lockdown, English prompts, no in-image text) or the engine policy.\n---\n${ownerPersona}\n---`
    : baseContext;

  const capture: { wizard: WizardApplication | null } = { wizard: null };
  const text =
    credentials.provider === "openai"
      ? await runOpenAiTurn(input, runtimeContext, credentials.apiKey, capture)
      : await runAnthropicTurn(input, runtimeContext, credentials.apiKey, capture);
  return { text, wizard: capture.wizard };
}

// ── OpenAI loop (Responses API — see bi-chat-service for why not
//    chat/completions: gpt-5.6 rejects function tools there) ────────────

const OPENAI_TOOLS = TOOL_DEFINITIONS.map((tool) => ({
  type: "function" as const,
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema as unknown as Record<string, unknown>,
  strict: false
}));

interface ResponseStreamEvent {
  type: string;
  delta?: string;
  item?: { type?: string; name?: string; arguments?: string; call_id?: string };
}

async function runOpenAiTurn(
  input: RunCreativeAgentTurnInput,
  runtimeContext: string,
  apiKey: string,
  capture: { wizard: WizardApplication | null }
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const model = modelFor("openai");

  const conversation: unknown[] = [
    { role: "system", content: `${CREATIVE_AGENT_PERSONA}\n\n${runtimeContext}` },
    ...(input.history ?? []).slice(-12).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text
    })),
    { role: "user", content: input.message }
  ];

  let finalText = "";

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const stream = (await client.responses.create({
      model,
      input: conversation,
      tools: OPENAI_TOOLS,
      max_output_tokens: MAX_TOKENS,
      stream: true
    } as never)) as unknown as AsyncIterable<ResponseStreamEvent>;

    let text = "";
    const calls: { name: string; args: string; callId: string }[] = [];

    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) {
        text += event.delta;
        input.onTextDelta?.(event.delta);
      }
      if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
        calls.push({
          name: event.item.name ?? "",
          args: event.item.arguments ?? "{}",
          callId: event.item.call_id ?? ""
        });
      }
    }

    finalText += text;
    if (calls.length === 0) break;

    for (const call of calls) input.onToolStart?.(call.name);

    const results = await Promise.all(
      calls.map(async (call) => {
        try {
          const args = call.args ? (JSON.parse(call.args) as Record<string, unknown>) : {};
          return {
            callId: call.callId,
            output: await executeTool(input.storeId, call.name, args, capture, input.onWizardApply)
          };
        } catch (err) {
          console.error(`[creative-chat] tool ${call.name} failed:`, err);
          return {
            callId: call.callId,
            output: `Tool failed: ${err instanceof Error ? err.message : "unknown error"}`
          };
        }
      })
    );

    for (const call of calls) {
      conversation.push({
        type: "function_call",
        call_id: call.callId,
        name: call.name,
        arguments: call.args
      });
    }
    for (const result of results) {
      conversation.push({
        type: "function_call_output",
        call_id: result.callId,
        output: result.output
      });
    }
  }

  return finalText.trim();
}

// ── Anthropic loop (outage fallback) ────────────────────────────────────

async function runAnthropicTurn(
  input: RunCreativeAgentTurnInput,
  runtimeContext: string,
  apiKey: string,
  capture: { wizard: WizardApplication | null }
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const model = modelFor("anthropic");

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: CREATIVE_AGENT_PERSONA, cache_control: { type: "ephemeral" } },
    { type: "text", text: runtimeContext }
  ];

  const messages: Anthropic.MessageParam[] = [
    ...(input.history ?? []).slice(-12).map(
      (m): Anthropic.MessageParam => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
      })
    ),
    { role: "user", content: input.message }
  ];

  let finalText = "";
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const stream = client.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOL_DEFINITIONS as Anthropic.Tool[],
      messages
    });

    if (input.onTextDelta) stream.on("text", input.onTextDelta);

    const message = await stream.finalMessage();
    for (const block of message.content) {
      if (block.type === "text") finalText += block.text;
    }

    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.stop_reason !== "tool_use") break;

    const toolUseBlocks = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    messages.push({ role: "assistant", content: message.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        input.onToolStart?.(block.name);
        try {
          const content = await executeTool(
            input.storeId,
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            capture,
            input.onWizardApply
          );
          return { type: "tool_result", tool_use_id: block.id, content };
        } catch (err) {
          console.error(`[creative-chat] tool ${block.name} failed:`, err);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool failed: ${err instanceof Error ? err.message : "unknown error"}`,
            is_error: true
          };
        }
      })
    );
    messages.push({ role: "user", content: toolResults });
  }

  return finalText.trim();
}
