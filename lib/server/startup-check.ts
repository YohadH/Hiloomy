/**
 * Boot-time environment validation.
 *
 * Historically, when critical secrets (Supabase URL/key, the Shopify
 * credentials encryption key) were missing on the host, the app would boot
 * "successfully" and then 500 silently the first time a request touched
 * Supabase Auth or tried to decrypt stored Shopify credentials. On Render
 * that surfaced as opaque 500s with no obvious cause.
 *
 * This check runs once at server start (from instrumentation.ts `register()`)
 * and FAILS FAST with a clear, actionable error listing exactly which env
 * vars are absent — so a misconfigured deploy dies loudly at boot instead of
 * limping along and 500-ing on the install/auth path.
 *
 * Notes:
 *  - Each requirement may be satisfied by ANY of its listed names (e.g. the
 *    server Supabase client accepts SUPABASE_URL *or* NEXT_PUBLIC_SUPABASE_URL),
 *    matching lib/auth/supabase-server.ts resolution order.
 *  - Only hard-required-for-boot secrets are enforced here. Shopify OAuth
 *    creds (SHOPIFY_CLIENTID / SHOPIFY_CLIENT_SECRET) and APP_URL are validated
 *    at the point of use in the OAuth flow, not at boot, because the app can
 *    run useful analytics paths without an active Shopify install.
 */

type EnvRequirement = {
  /** Human-readable label for the error message. */
  label: string;
  /** Any one of these env var names satisfies the requirement. */
  names: string[];
};

const REQUIRED_ENV: EnvRequirement[] = [
  {
    label: "Supabase project URL",
    names: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]
  },
  {
    label: "Supabase anon key",
    names: ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]
  },
  {
    label: "Shopify credentials encryption key",
    names: ["SHOPIFY_CREDENTIALS_ENCRYPTION_KEY"]
  }
];

function isSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validate required env vars. Returns the list of missing requirements
 * (empty when everything required is present). Pure — does not throw — so
 * it can be unit-tested or called in a non-fatal context.
 */
export function getMissingRequiredEnv(): EnvRequirement[] {
  return REQUIRED_ENV.filter((req) => !req.names.some(isSet));
}

/**
 * Optional integration env vars. These are NOT required for boot — the app
 * runs fine without them — but a feature silently no-ops when they're absent.
 * We WARN (never throw) at boot so an operator who expected the feature to
 * work sees a clear reason it didn't, instead of wondering why no email ever
 * arrived. Each entry's `names` are OR'd (any one satisfies it).
 */
const OPTIONAL_ENV: Array<EnvRequirement & { feature: string }> = [
  {
    label: "Resend API key",
    names: ["RESEND_API_KEY"],
    feature: "weekly/monthly email reports + digests"
  },
  {
    label: "Report from-address",
    names: ["REPORT_FROM_EMAIL"],
    feature: "weekly/monthly email reports + digests"
  },
  {
    label: "Telegram bot token",
    names: ["TELEGRAM_BOT_TOKEN"],
    feature: "daily morning PDF digest to owner Telegram"
  },
  {
    label: "Telegram chat ID",
    names: ["TELEGRAM_CHAT_ID"],
    feature: "daily morning PDF digest to owner Telegram"
  },
  {
    label: "RivalSweeper API credentials",
    names: ["RIVALSWEEPER_KEY_ID", "RIVALSWEEPER_KEY_SECRET"],
    feature:
      "competitor intelligence in the weekly report (runs in deterministic mock mode until configured)"
  }
];

/**
 * Emit a non-fatal warning for any absent optional integration env var.
 * Specifically: if the weekly-report cron is enabled but RESEND_API_KEY /
 * REPORT_FROM_EMAIL are unset, the cron will run and generate reports but be
 * UNABLE to deliver email — so we warn loudly at boot rather than letting the
 * delivery silently no-op. Never throws. Safe to call after the crons start.
 */
export function warnOptionalEnv(): void {
  for (const opt of OPTIONAL_ENV) {
    if (opt.names.some(isSet)) continue;
    console.warn(
      `[startup-check] ${opt.label} is not set (one of: ${opt.names.join(" or ")}). ` +
        `Feature degraded: ${opt.feature} will be skipped until it is configured.`
    );
  }
}

// ── Schema drift detection ──────────────────────────────────────────────
// schema.prisma once gained the DiscountUsage mechanism columns with no
// accompanying migration; production (where schema changes are a manual
// step, see render.yaml) kept the old shape, and the first write touching
// the new columns 500-ed at runtime ("The column `applicationType` does
// not exist"). This probe compares the live database against the columns
// the code is known to depend on and screams at boot instead. Add a row
// here whenever a schema change ships that production must receive.

const EXPECTED_SCHEMA_COLUMNS: Array<{ table: string; column: string; fixWith: string }> = [
  {
    table: "DiscountUsage",
    column: "applicationType",
    fixWith: "prisma/migrations/20260825_discount_mechanism/migration.sql"
  },
  {
    table: "CampaignProductLink",
    column: "campaignId",
    fixWith: "prisma/migrations/20260825_campaign_links_bundles/migration.sql"
  },
  {
    table: "BundleComponent",
    column: "bundleProductId",
    fixWith: "prisma/migrations/20260825_campaign_links_bundles/migration.sql"
  }
];

/**
 * Warn loudly (never throw — analytics paths still work) when the live
 * database is missing a column the deployed code writes. Call once at boot,
 * fire-and-forget.
 */
export async function warnSchemaDrift(): Promise<void> {
  try {
    const { getDb } = await import("@/lib/server/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getDb() as any;
    const tables = [...new Set(EXPECTED_SCHEMA_COLUMNS.map((e) => e.table))];
    const rows = (await db.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_name = ANY(${tables})
    `) as Array<{ table_name: string; column_name: string }>;
    const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    for (const expected of EXPECTED_SCHEMA_COLUMNS) {
      if (present.has(`${expected.table}.${expected.column}`)) continue;
      console.error(
        `[startup-check] SCHEMA DRIFT: the live database is missing column ` +
          `"${expected.table}"."${expected.column}" that the deployed code writes. ` +
          `Every write to that table will fail until the schema is updated. ` +
          `Apply ${expected.fixWith} (or run \`npx prisma db push\` against the direct DB URL).`
      );
    }
  } catch (err) {
    // No DB at boot (build step, misconfigured env) — the required-env check
    // handles that story; this probe just skips.
    console.warn(
      "[startup-check] schema drift check skipped:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Assert all required env vars are present. Throws a clear Error listing the
 * missing ones if not. Call once at boot so the process dies loudly instead
 * of silently 500-ing later.
 */
export function assertRequiredEnv(): void {
  const missing = getMissingRequiredEnv();
  if (missing.length === 0) return;

  const lines = missing.map(
    (req) =>
      `  - ${req.label} (set one of: ${req.names.join(" or ")})`
  );
  const message =
    "Startup env check failed — the following required environment " +
    `variable(s) are not set:\n${lines.join("\n")}\n` +
    "Set them in the deployment environment before starting the app.";

  // Log first so the reason is visible even if the throw is swallowed
  // somewhere up the stack.
  console.error(`[startup-check] ${message}`);
  throw new Error(message);
}
