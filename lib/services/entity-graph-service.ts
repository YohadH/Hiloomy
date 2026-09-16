// Entity graph — the persisted record of every relationship Hiloomy inferred,
// confirmed or rejected for a plan's initiatives (docs §0h). Resolution
// itself is stateless and reruns on every read (new campaigns, coupons and
// orders are picked up automatically); this store gives each relationship a
// memory: when it was first seen (`createdAt`) and when it was last
// re-validated (`lastValidatedAt`), so "Sukkot Sale 2026 appeared on Sep 19
// and was linked provisionally" is a fact the system can show.
//
// Stored per sheet in SystemConfig `entity_graph:<sheetId>`. Best effort:
// a failed write never fails a page.

import { getDb } from "@/lib/server/db";
import type { Relationship, RelationshipStatus } from "@/lib/domain/entity-resolution";
import type { EntityLink, InitiativeMappings, MappingKind } from "@/lib/domain/initiative-reality";

const TYPE_OF: Record<MappingKind, Relationship["target"]["type"]> = { product: "product", gift_product: "product", discount: "coupon", meta_campaign: "meta_campaign" };
const STATUS_OF: Record<EntityLink["state"], RelationshipStatus> = { confirmed: "CONFIRMED", provisional: "PROVISIONAL", suggested: "SUGGESTED" };
const MAX_RELATIONSHIPS = 2000;

export interface EntityGraph {
  sheetId: string;
  relationships: Relationship[];
  updatedAt: string;
}

const key = (sheetId: string) => `entity_graph:${sheetId}`;
const relKey = (r: Relationship) => `${r.source.id}|${r.target.type}|${r.target.id}`;

export async function readEntityGraph(sheetId: string): Promise<EntityGraph> {
  try {
    const row = await getDb().systemConfig.findUnique({ where: { key: key(sheetId) }, select: { value: true } });
    if (!row) return { sheetId, relationships: [], updatedAt: new Date(0).toISOString() };
    const parsed = JSON.parse(row.value) as Partial<EntityGraph>;
    return { sheetId, relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [], updatedAt: parsed.updatedAt ?? new Date(0).toISOString() };
  } catch {
    return { sheetId, relationships: [], updatedAt: new Date(0).toISOString() };
  }
}

// The relationships one initiative's mappings imply right now.
export function relationshipsFromMappings(initiative: { id: string; title: string }, m: InitiativeMappings, now: Date): Relationship[] {
  const at = now.toISOString();
  const source = { type: "initiative" as const, id: initiative.id, label: initiative.title };
  const out: Relationship[] = [];
  const scoreOf = (l: EntityLink) => {
    const m2 = l.provenance.matchedOn.match(/^(\d+)%/);
    if (m2) return Number(m2[1]) / 100;
    return l.state === "confirmed" ? 1 : l.state === "provisional" ? 0.7 : l.confidence === "medium" ? 0.45 : 0.3;
  };
  for (const l of m.links) {
    if (l.id === "__none__") continue;
    out.push({
      source,
      target: { type: TYPE_OF[l.kind], id: l.id, label: l.label },
      confidence: scoreOf(l),
      status: STATUS_OF[l.state],
      evidence: [{ kind: l.provenance.rule === "operator" ? "MANAGER" : l.kind === "meta_campaign" ? "NAME_MATCH" : l.kind === "discount" ? "COUPON_MATCH" : "PRODUCT_MATCH", weight: scoreOf(l), detail: l.reason }],
      reason: l.reason,
      createdAt: at,
      lastValidatedAt: at
    });
  }
  for (const r of m.campaignResolution?.rejected ?? []) {
    out.push({
      source,
      target: { type: "meta_campaign", id: r.id, label: r.name },
      confidence: 0,
      status: "REJECTED",
      evidence: [{ kind: r.by === "manager" ? "MANAGER" : "EVENT_CONFLICT", weight: 0, detail: r.reason }],
      reason: r.reason,
      createdAt: at,
      lastValidatedAt: at
    });
  }
  return out;
}

// Merge the current relationships into the stored graph: keep the first
// `createdAt`, refresh `lastValidatedAt`, confidence, status and evidence.
// Relationships of THIS initiative that no longer appear are dropped (the
// entity vanished or was re-scored below the suggestion floor).
export async function recordRelationships(sheetId: string, initiativeId: string, current: Relationship[], now: Date): Promise<{ added: number; refreshed: number; dropped: number } | null> {
  try {
    const graph = await readEntityGraph(sheetId);
    const byKey = new Map(graph.relationships.map((r) => [relKey(r), r]));
    let added = 0;
    let refreshed = 0;
    const mine = new Set<string>();
    for (const r of current) {
      const k = relKey(r);
      mine.add(k);
      const prev = byKey.get(k);
      if (prev) {
        refreshed += 1;
        byKey.set(k, { ...r, createdAt: prev.createdAt, lastValidatedAt: now.toISOString() });
      } else {
        added += 1;
        byKey.set(k, r);
      }
    }
    let dropped = 0;
    for (const [k, r] of byKey) {
      if (r.source.id === initiativeId && !mine.has(k)) {
        byKey.delete(k);
        dropped += 1;
      }
    }
    if (added === 0 && dropped === 0 && graph.relationships.length && now.getTime() - Date.parse(graph.updatedAt) < 6 * 3_600_000) return { added, refreshed, dropped };
    const relationships = [...byKey.values()].slice(-MAX_RELATIONSHIPS);
    const value = JSON.stringify({ sheetId, relationships, updatedAt: now.toISOString() } satisfies EntityGraph);
    await getDb().systemConfig.upsert({ where: { key: key(sheetId) }, update: { value }, create: { key: key(sheetId), value } });
    return { added, refreshed, dropped };
  } catch {
    return null;
  }
}
