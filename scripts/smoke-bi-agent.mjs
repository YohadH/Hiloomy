// Smoke test for the Brandzp BI Gateway Creative agent.
// Verifies a brief-generation-style call goes through and produces parseable JSON.
//
// Usage:
//   node --env-file=.env scripts/smoke-bi-agent.mjs

const URL = process.env.BI_AGENT_URL?.replace(/\/$/, "");
const TOKEN = process.env.BI_AGENT_TOKEN;

if (!URL || !TOKEN) {
  console.error("BI_AGENT_URL / BI_AGENT_TOKEN missing in env.");
  process.exit(1);
}

const prompt = `You are a senior performance-marketing creative director writing Meta ad concepts for Incense & Perfumes.

Brand voice: modern, sensual, premium.

Product:
  - Title: Maison Margiela Replica Beach Walk EDT
  - Tagline: A day at the beach in a bottle

Angle for this batch: **Aspirational lifestyle** — the kind of person who uses this.

Produce exactly 2 ad concepts that all use this angle but feel meaningfully different from each other.
Headlines should be punchy (max ~10 words for EN).
Body copy 1-2 short sentences max.
CTA picked from: Shop now / Get yours / See more.
visualPrompt: 1-2 sentences describing a vertical 9:16 ad shot.
assetType is "image" for static, "video" for motion.

All copy in ENGLISH.

Output JSON array of length 2, each element:
{ "variantLabel": "<short tag>", "headline": "...", "body": "...", "cta": "...", "visualPrompt": "...", "assetType": "image" | "video" }

---
Output ONLY a single valid JSON value with no markdown fences, no prose, no explanation.
Start your response with [ and end with ].`;

console.log("Calling /creative/ask with brief-generation prompt...");
const res = await fetch(`${URL}/creative/ask`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ question: prompt })
});
const data = await res.json();
console.log("Status:", res.status, "Agent:", data.agent, "ok:", data.ok);
console.log("\nRaw answer:");
console.log(data.answer);
console.log("\nAttempt to parse as JSON:");
try {
  let cleaned = String(data.answer).trim();
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const firstArr = cleaned.indexOf("[");
  if (firstArr > 0) cleaned = cleaned.slice(firstArr);
  const parsed = JSON.parse(cleaned);
  console.log("✅ Parsed", Array.isArray(parsed) ? `array of ${parsed.length}` : typeof parsed);
  console.log(JSON.stringify(parsed, null, 2));
} catch (err) {
  console.error("❌ JSON parse failed:", err.message);
  process.exit(1);
}
