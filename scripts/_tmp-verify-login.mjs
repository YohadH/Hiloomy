// End-to-end sign-in check for one account on the LIVE site, plus the auth
// flags the app cannot see (banned / deleted / identity row).
//
//   $env:PROD_DB_URL   = "<prod pooler url>"        (or SUPABASE_PROJECT_REF + .env password)
//   $env:TEST_PASSWORD = "<the password to sign in with>"
//   node scripts/_tmp-verify-login.mjs shlomo@brandzp.co.il                 # check flags + real sign-in
//   node scripts/_tmp-verify-login.mjs shlomo@brandzp.co.il --set-password  # first set TEST_PASSWORD as the password, then sign in
//
// Nothing secret is printed. The sign-in runs in headless Chromium against
// https://www.hiloomy.com/login exactly as a person would do it.

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email.includes("@")) { console.error("usage: node scripts/_tmp-verify-login.mjs <email> [--set-password]"); process.exit(1); }
const setPassword = process.argv.includes("--set-password");
const password = process.env.TEST_PASSWORD ?? "";
const site = (process.env.SITE_URL ?? "https://www.hiloomy.com").replace(/\/$/, "");

// ---------- DB: flags GoTrue enforces at sign-in ----------
const CR = String.fromCharCode(13);
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").map((l) => l.replace(CR, "")).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; })
);
const ref = process.env.SUPABASE_PROJECT_REF ?? (env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const shellUrl = process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? process.env.DATABASE_URL : null;
const url = process.env.PROD_DB_URL ?? shellUrl ?? (ref && env.SUPABASE_DB_PASSWORD ? `postgresql://postgres.${ref}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require` : null);

let dbOk = false;
if (url) {
  const p = new PrismaClient({ log: [], datasources: { db: { url } } });
  try {
    const rows = await p.$queryRaw`
      SELECT email, email_confirmed_at IS NOT NULL AS confirmed, banned_until, deleted_at, is_sso_user,
             encrypted_password IS NOT NULL AND encrypted_password <> '' AS has_password,
             (SELECT string_agg(provider, ',') FROM auth.identities i WHERE i.user_id = u.id) AS identity_providers
      FROM auth.users u WHERE lower(email) = ${email}`;
    console.log("## auth.users flags");
    if (!rows.length) console.log("NO AUTH USER — this address never signed up. Sign-in cannot work until they register.");
    rows.forEach((r) => console.log(JSON.stringify(r)));
    const r = rows[0];
    if (r) {
      if (!r.confirmed) console.log("!! email not confirmed → sign-in fails until confirmed (diag script --confirm-email)");
      if (r.banned_until && new Date(r.banned_until) > new Date()) console.log(`!! BANNED until ${r.banned_until}`);
      if (r.deleted_at) console.log("!! auth user is soft-deleted");
      if (!r.identity_providers) console.log("!! no auth.identities row — GoTrue may refuse password sign-in");
      if (!r.has_password) console.log("!! no password set");
    }
    if (setPassword) {
      if (password.length < 8) throw new Error("--set-password needs TEST_PASSWORD (≥ 8 chars) in the environment");
      const n = await p.$executeRaw`
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()), banned_until = NULL, updated_at = now()
        WHERE lower(email) = ${email}`;
      console.log(`## password set (${n} row(s)); email confirmed; ban cleared`);
    }
    dbOk = true;
  } catch (e) {
    console.log(`## DB check failed: ${(e instanceof Error ? e.message : String(e)).split("\n").filter(Boolean).slice(-1)[0]}`);
    if (setPassword) process.exit(1);
  } finally {
    await p.$disconnect();
  }
} else {
  console.log("## DB check skipped (no production DB URL available)");
}

// ---------- Live sign-in, as a person would ----------
if (!password) {
  console.log("## sign-in test skipped: set TEST_PASSWORD to try a real sign-in");
  process.exit(dbOk ? 0 : 1);
}
console.log(`## signing in at ${site}/login as ${email}`);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
  await page.goto(`${site}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Success = we leave the auth pages. Failure = the form shows an error.
  // Poll: leaving the auth pages = success; the form showing an error = failure.
  const ERR = /שגוי|לא אושר|Invalid|not confirmed|failed|נכשל/;
  let outcome = "timeout";
  let errText = "";
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (!/\/(login|signin|signup)(\?|$)/.test(new URL(page.url()).pathname)) { outcome = "redirected"; break; }
    const formText = ((await page.textContent("form").catch(() => "")) ?? "").replace(/\s+/g, " ");
    if (ERR.test(formText)) { outcome = "error"; errText = formText; break; }
    await page.waitForTimeout(500);
  }
  const finalUrl = page.url();
  if (outcome === "redirected") {
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const landed = page.url();
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    const shell = /היום|Today|Command Center|חנות|Store/.test(body);
    console.log(`LOGIN OK → ${landed}${shell ? " (app shell rendered)" : " (page rendered, shell text not detected)"}`);
    if (/onboarding|connect|welcome/i.test(landed)) console.log("!! landed on an onboarding page — the account has no org/store resolved");
  } else if (outcome === "error") {
    console.log(`LOGIN FAILED at ${finalUrl}: ${errText.replace(/^.*?(?=פרטי|Invalid|לא אושר|not confirmed)/, "").trim().slice(0, 200)}`);
    process.exitCode = 2;
  } else {
    console.log(`LOGIN UNDETERMINED (timeout) at ${finalUrl}`);
    process.exitCode = 3;
  }
} finally {
  await browser.close();
}
