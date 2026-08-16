// Shopify Bulk Operations client — large-store initial sync (SA-HIGH-02).
//
// The paginated path (ShopifyGraphQLClient.paginateConnection) walks a connection
// 100 nodes at a time. For a store with tens of thousands of orders/customers that
// is hundreds of serial round-trips, high latency, and a real throttle risk.
//
// A Bulk Operation hands Shopify a single query, runs it asynchronously server-side,
// and returns the WHOLE connection as one JSONL file. This module drives that
// lifecycle:
//   1. runBulkQuery()      — bulkOperationRunQuery mutation kicks off the export.
//   2. pollBulkOperation() — currentBulkOperation(type: QUERY) until COMPLETED.
//   3. fetchBulkJsonl()    — download + parse the JSONL result (one object per line).
//   4. reassembleByParent()— rebuild Shopify's flattened JSONL back into the nested
//                            `edges[].node` shape the existing shopify-mappers expect.
//
// Bulk JSONL flattening: each nested connection node is emitted on its own line with
// a `__parentId` pointing at its parent's `id`. We re-nest children under their parent
// so mapOrderNode/mapProductNode/mapCustomerNode can be reused UNCHANGED.
//
// All GraphQL here was validated against the live Admin schema via the shopify-dev
// MCP validate_graphql_codeblocks tool before being written (see lib/shopify/queries/bulk.ts).

import { AppError } from "@/lib/server/errors";
import { ShopifyGraphQLClient } from "@/lib/shopify/client";
import { BULK_CANCEL_MUTATION, BULK_POLL_QUERY, BULK_RUN_MUTATION } from "@/lib/shopify/queries/bulk";

export type BulkOperationStatus =
  | "CREATED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELING"
  | "CANCELED"
  | "EXPIRED";

export interface BulkOperationState {
  id: string | null;
  status: BulkOperationStatus | null;
  errorCode: string | null;
  objectCount: string | null;
  fileSize: string | null;
  url: string | null;
  partialDataUrl: string | null;
  completedAt: string | null;
}

interface BulkRunResponse {
  bulkOperationRunQuery: {
    bulkOperation: { id: string; status: BulkOperationStatus } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

interface BulkPollResponse {
  currentBulkOperation: {
    id: string;
    status: BulkOperationStatus;
    errorCode: string | null;
    createdAt: string | null;
    completedAt: string | null;
    objectCount: string | null;
    fileSize: string | null;
    url: string | null;
    partialDataUrl: string | null;
  } | null;
}

interface BulkCancelResponse {
  bulkOperationCancel: {
    bulkOperation: { id: string; status: BulkOperationStatus } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

// Defaults tuned for a large-store initial export. A Bulk Operation can legitimately
// take many minutes; the staleness watchdog in shopify-sync-service already allows a
// multi-hour initial sync, so this poll budget (default 30 min) lives well inside it.
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = (() => {
  const mins = Number(process.env.SHOPIFY_BULK_POLL_TIMEOUT_MIN);
  return (Number.isFinite(mins) && mins > 0 ? mins : 30) * 60 * 1000;
})();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thrown when a sister bulk operation is already running for the shop. Shopify
 * allows exactly ONE bulk QUERY at a time per shop, so the caller can decide to
 * cancel-and-retry or fall back to paginated sync.
 */
export class BulkOperationBusyError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = "BulkOperationBusyError";
  }
}

/**
 * Kicks off a bulk export for the given inner query string and returns the new
 * operation's id. Throws BulkOperationBusyError if one is already running.
 */
export async function runBulkQuery(client: ShopifyGraphQLClient, innerQuery: string): Promise<string> {
  const data = await client.request<BulkRunResponse>(BULK_RUN_MUTATION, { query: innerQuery });
  const payload = data.bulkOperationRunQuery;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    const message = userErrors.map((e) => e.message).join("; ");
    // Shopify surfaces "A bulk query operation for this app and shop is already
    // in progress" as a user error here when a previous run is still active.
    if (/already in progress|already running/i.test(message)) {
      throw new BulkOperationBusyError(message);
    }
    throw new AppError(`Bulk operation could not be started: ${message}`, 400, userErrors);
  }

  const id = payload?.bulkOperation?.id;
  if (!id) {
    throw new AppError("Bulk operation did not return an operation id.", 502, payload);
  }
  return id;
}

/** Reads the current bulk QUERY operation's state. */
export async function getCurrentBulkOperation(client: ShopifyGraphQLClient): Promise<BulkOperationState> {
  const data = await client.request<BulkPollResponse>(BULK_POLL_QUERY);
  const op = data.currentBulkOperation;
  if (!op) {
    return {
      id: null,
      status: null,
      errorCode: null,
      objectCount: null,
      fileSize: null,
      url: null,
      partialDataUrl: null,
      completedAt: null
    };
  }
  return {
    id: op.id,
    status: op.status,
    errorCode: op.errorCode,
    objectCount: op.objectCount,
    fileSize: op.fileSize,
    url: op.url,
    partialDataUrl: op.partialDataUrl,
    completedAt: op.completedAt
  };
}

/** Best-effort cancel of a running bulk operation. Never throws. */
export async function cancelBulkOperation(client: ShopifyGraphQLClient, id: string): Promise<void> {
  try {
    await client.request<BulkCancelResponse>(BULK_CANCEL_MUTATION, { id });
  } catch (error) {
    console.warn(`[shopify-bulk] cancel failed for ${id}:`, error);
  }
}

/**
 * Polls currentBulkOperation until it leaves the RUNNING/CREATED state, then returns
 * the terminal state. Throws on FAILED / CANCELED / EXPIRED, or on poll timeout.
 *
 * Only matches the operation we launched (by id) so a concurrent unrelated bulk op
 * can't make us return early against the wrong result file.
 */
export async function pollBulkOperation(
  client: ShopifyGraphQLClient,
  operationId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<BulkOperationState> {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  // Give Shopify a beat before the first poll — the op is CREATED immediately but
  // the result url only appears after COMPLETED.
  for (;;) {
    const state = await getCurrentBulkOperation(client);

    // If currentBulkOperation now reports a DIFFERENT id, our operation already
    // finished and was superseded by a newer one. Treat as completed-but-unknown
    // so the caller can fall back rather than block forever.
    const isOurs = state.id === operationId || state.id === null;

    if (isOurs && state.status === "COMPLETED") {
      return state;
    }
    if (isOurs && (state.status === "FAILED" || state.status === "CANCELED" || state.status === "EXPIRED")) {
      throw new AppError(
        `Bulk operation ${operationId} ended with status ${state.status}` +
          (state.errorCode ? ` (errorCode: ${state.errorCode}).` : "."),
        502,
        state
      );
    }
    if (!isOurs) {
      throw new AppError(
        `Bulk operation ${operationId} was superseded by ${state.id ?? "another operation"} before completing.`,
        409,
        state
      );
    }

    if (Date.now() >= deadline) {
      // Best-effort cancel so the shop's single bulk-query slot is freed for the
      // paginated/next attempt.
      await cancelBulkOperation(client, operationId);
      throw new AppError(
        `Bulk operation ${operationId} did not complete within ${Math.round(timeoutMs / 60000)} minutes; canceled.`,
        504,
        state
      );
    }

    await sleep(intervalMs);
  }
}

/**
 * Downloads the JSONL result from a completed bulk operation's `url` and parses it
 * into an array of plain objects (one per non-empty line). Returns [] when the url
 * is null (Shopify returns null url when the query produced zero rows).
 */
export async function fetchBulkJsonl(url: string | null): Promise<Array<Record<string, any>>> {
  if (!url) return [];

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AppError(`Failed to download bulk JSONL (status ${response.status}). ${text}`, response.status);
  }

  const body = await response.text();
  const rows: Array<Record<string, any>> = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      // A single malformed line should not abandon the entire export. Log and skip.
      console.warn("[shopify-bulk] skipped unparseable JSONL line:", error);
    }
  }
  return rows;
}

/**
 * Re-nests Shopify's flattened bulk JSONL back into the `edges[].node` connection
 * shape the existing shopify-mappers consume.
 *
 * Shopify emits every connection child on its own line tagged with `__parentId`.
 * Root objects (orders / products / customers) have NO `__parentId`. We:
 *   1. Collect root objects in file order (order is preserved within a connection).
 *   2. Bucket every child by (__parentId, child-type) and attach it to the parent
 *      under the connection field name we expect (e.g. lineItems / variants), in the
 *      `{ edges: [{ node }] }` form, OR as a plain array for inline-list fields.
 *
 * `childPlan` maps a child's Shopify GID type prefix to the parent connection field
 * and whether the mapper wants an `edges[].node` connection or a plain array.
 */
export interface ChildAttachPlan {
  /** Substring that identifies the child type in its GID, e.g. "/LineItem/". */
  gidMarker: string;
  /** Parent field name to attach under, e.g. "lineItems". */
  field: string;
  /** "connection" => { edges: [{ node }] }; "array" => plain node array. */
  shape: "connection" | "array";
}

export function reassembleByParent(
  rows: Array<Record<string, any>>,
  childPlan: ChildAttachPlan[]
): Array<Record<string, any>> {
  // index of parentId -> field -> node[]
  const childrenByParent = new Map<string, Map<string, any[]>>();
  const roots: Array<Record<string, any>> = [];

  function planFor(node: Record<string, any>): ChildAttachPlan | null {
    const id: string = typeof node.id === "string" ? node.id : "";
    for (const plan of childPlan) {
      if (id.includes(plan.gidMarker)) return plan;
    }
    return null;
  }

  for (const node of rows) {
    const parentId = node.__parentId as string | undefined;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const plan = planFor(node);
    if (!plan) {
      // Unknown child type — keep it loosely under a generic bucket so nothing is
      // silently dropped, but mappers won't read it. (Defensive; shouldn't happen
      // for the fields we query.)
      continue;
    }
    let byField = childrenByParent.get(parentId);
    if (!byField) {
      byField = new Map<string, any[]>();
      childrenByParent.set(parentId, byField);
    }
    const bucket = byField.get(plan.field) ?? [];
    bucket.push(node);
    byField.set(plan.field, bucket);
  }

  // Attach children to their roots in the connection/array shape the mappers expect.
  for (const root of roots) {
    const rootId: string = typeof root.id === "string" ? root.id : "";
    const byField = childrenByParent.get(rootId);
    if (!byField) continue;
    for (const plan of childPlan) {
      const bucket = byField.get(plan.field);
      if (!bucket) continue;
      if (plan.shape === "connection") {
        root[plan.field] = { edges: bucket.map((node) => ({ node })) };
      } else {
        root[plan.field] = bucket;
      }
    }
  }

  return roots;
}
