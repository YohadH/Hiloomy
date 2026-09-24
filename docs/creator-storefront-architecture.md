# Creator Storefronts — architecture decision

Status: **architecture and Phase 3 schema approved by owner 2026-09-24** (final
adjustment: events SetNull on storefront deletion, maxProducts default 20). Migration
NOT applied — gate = app-proxy smoke test (§13), then an explicit GO.

## 1. What Hiloomy already has (verified in code and prod)

| Area | Where | What it means for storefronts |
|---|---|---|
| Shopify app | Custom-distribution app, Dev Dashboard; OAuth in `lib/services/shopify-oauth-service.ts` (`DEFAULT_SCOPES`) | No Shopify CLI project, no `shopify.app.toml`, no `extensions/`. |
| Admin API client | `lib/shopify/client.ts` (GraphQL, throttle-aware) | Product picker in the builder. No writes needed for storefronts. |
| App proxy **code** | `app/api/shopify/app-proxy/[...rest]/route.ts`, signature check `verifyAppProxySignature`; short links built as `/apps/go/{token}` | **Not configured on the production app.** `https://takeanap.co.il/apps/go/x` and `https://incenseparfums.com/apps/go/x` return Shopify's 404 (checked 2026-09-24), while the Hiloomy route answers directly (401 without signature). The Dev Dashboard proxy (prefix `apps`, subpath `go`, URL `https://www.hiloomy.com/api/shopify/app-proxy`) must be created once — this is the single manual Shopify step of the feature. Prod short links: 4 rows, 1 click (QA). |
| Webhooks | `orders/create|updated|cancelled`, `app/uninstalled`, GDPR (`WebhookEvent`) | No `products/*` webhooks; products are pulled nightly. |
| Creators | `AffiliateMember` (storeId, programId, affiliateCode, couponCode, instagramUsername/ProfileUrl, status pending/approved); `AffiliateProgram.autoApprove` | The creator IS the affiliate member. Approval state exists. |
| Creator self-service | `/my/[slug]` magic-link portal, `aff_portal_session` cookie | The builder lives here. |
| Merchant portal | `/affiliate-portal/*` | "Creator Storefronts" tab + settings go here. |
| Coupons | `AffiliateMember.couponCode`, `AffiliateCoupon` (created via `write_discounts`) | Storefront displays `couponCode`; no second coupon system. |
| Attribution | `AttributionSession` (clickId unique, affiliateMemberId, affiliateCode, couponCode, sourcePlatform, landingPath, utm*, ipHash, userAgent, convertedAt); `/r/`, `/l/`, proxy short links; storefront script `public/hiloomy-track.js` writes `ref` / `agent_click_id` / `coupon` to a 30-day first-party cookie AND cart attributes → order `note_attributes` → `matchAffiliateMemberForOrder` | Storefront visits are sessions with `sourcePlatform = "storefront"`; the same script carries the click id to the order. |
| Products | `Product` (shopifyProductId, handle, title, status), `ProductVariant`. No images stored. | Store id + handle only; Shopify renders the rest. |
| Metaobjects / metafields | Not used | — |
| Live themes | Take a Nap: Prestige 7.3.2 · Incense: Minimog OS 2.0 | Card snippets differ per theme. |
| robots.txt (live) | Shopify default does not block `/apps/` | Proxy pages are indexable. |

## 2. Options evaluated (summary)

A Page-per-creator collapses into B or D. **B Metaobject web pages** (`/pages/{urlHandle}/{handle}`)
need `read/write_metaobjects`, a theme template created by the merchant or via
`write_themes`, a Shopify write on every publish, and cannot reuse theme product
cards without C. **C Theme App Extension** needs a Shopify CLI project and app-version
deploys this repo lacks; app blocks can only render the extension's own snippets,
never the merchant theme's `product-card`; 100 KB Liquid cap. **D App Proxy** renders
Hiloomy's Liquid inside the live theme (layout, cart, checkout, session, pixels),
can call the theme's own snippets, needs no Shopify writes and no theme files.
**E Hybrid** = D now, optional metaobject mirror later for `/pages/` URLs.

## 3. Decision: D (approved)

App Proxy + Liquid rendered by the merchant theme. Detailed reasoning against the
brief's criteria (native feel, install complexity, scale, publishing UX,
personalization, performance, SEO, maintainability) is unchanged from the first
draft; the owner's adjustments below refine it.

## 4. Routing — extend `/apps/go`, do not migrate

Shopify allows one proxy per app: `/{prefix}/{subpath}/*`, prefix ∈
`a | apps | community | tools`. The existing prefix/subpath `apps/go` stays. The
existing route becomes a router keyed on the first path segment after `/apps/go/`:

| Path | Handler | Notes |
|---|---|---|
| `/apps/go/{token}` | short link (existing) | unchanged, backward compatible |
| `/apps/go/@{creatorSlug}` | creator storefront (GET) | `?c={contentId}` reserved · `?preview={token}` renders the draft, `noindex`, no cache |
| `/apps/go/@{creatorSlug}/e` | storefront events (POST) | shopper events for the same session |
| `/apps/go/@{creatorSlug}/p` | lazy product batch (GET, Liquid) | §5 escape path A2 |

`@` safety: `@` is a legal path character (RFC 3986 `pchar`), Shopify forwards the
path verbatim (`%40` arrives decoded as `@` in the Next.js catch-all), and short-link
tokens are 6 lowercase alphanumerics (`TOKEN_LENGTH = 6`) so no token can start with `@` or equal `test`. End-to-end verification against
Shopify is blocked until the proxy is configured (§1); it is the first check of
Phase 4. Fallback if a problem appears: `/apps/go/c/{creatorSlug}`.

## 5. Product limit — why it exists and how we escape it

**Why.** Shopify Liquid caps `all_products[...]` at **20 unique handles per rendered
page**. It is a per-render (per HTTP response) budget of the Liquid runtime, not a
data limit: a second response gets its own 20. It exists because `all_products` is a
lazy catalogue lookup Shopify does not want abused as a query engine.

**Rule.** The limit lives ONLY in the render layer. The data model has no product
cap; `CreatorStorefrontSettings.maxProducts` is an implementation/configuration
limit for the builder (V1 default 20, matching the current 20-lookup render budget),
not a permanent product-domain constraint. Rendering allocates the 20-handle budget by position
(featured first, then visible products in order, collections consume from the same
budget) and hands the remainder to an escape path. Nothing about the tables changes
when the budget changes.

**Escape paths, in order of preference.**
- A1 (V1) — Lazy Liquid batches: the page includes `<div data-hiloomy-more
  data-src="/apps/go/@slug/p?from=20">`; a 20-line script fetches that proxied
  URL, which returns the NEXT 20 products rendered with the SAME Liquid card
  (theme adapter or fallback), and appends it. Theme cards, live prices, no extra
  APIs, no Shopify writes. Each batch is its own render → its own 20 budget.
- A2 (V1, belt and braces) — Ajax Product API `GET /products/{handle}.js` (public
  storefront JSON: price, compare_at_price, available, variants, images, url) for
  the fallback card when A1 is unavailable. Live data, no limit, client-side.
- B (later, if SEO for long lists matters) — `?page=N` server pagination, 20 per
  page, `rel=next/prev`.
- C (later, needs a Shopify write + `write_products`) — a hidden custom collection
  per storefront and `collections[handle].products` with `paginate` (50/page).
  Rejected for V1 by the no-Shopify-write principle; the data model already stores
  what such a collection would need (ordered product ids).

## 6. Product card strategy — progressive enhancement

```
Hiloomy fallback card (always renders; product.featured_image, title, price,
compare_at_price, available, url; theme CSS variables + theme button class)
   ↓ theme detection: request.design_mode/`Shopify.theme.schema_name` read once
     via a tiny proxied probe, cached per store with the theme id
   ↓ verified adapter (Prestige, Minimog, Dawn/OS 2.0 in V1) — an adapter is a
     Liquid snippet name + parameter map + a "smoke" marker; on first use we
     render one card through it and check the marker appears without
     "Liquid error"; only then is it enabled
   ↓ merchant override in settings: force adapter or force fallback
```
The storefront never depends on knowing the theme. A theme change flips the cached
theme id → adapter re-verified; an unknown theme → fallback. We will not maintain
hundreds of adapters: three now, others only if a merchant asks, and always behind
the same fallback.

## 7. Snapshot — what publish freezes and what it never freezes

`publishedConfig` (JSON) freezes **configuration only**: layout key, section order,
creator copy (headline, subtitle, bio, social links), coupon code reference, product
list (shopifyProductId + handle, position, featured, visible), collections
(title, description, order, product handles), content blocks (type + payload).
`publishedTemplate` (text) is the Liquid **template** generated from that config —
it contains `all_products['handle'].price`, `.compare_at_price`, `.available`,
`.featured_image`, `.url`, variant loops — never resolved values. Shopify resolves
them on every request, so price, compare-at, availability, variants, images,
product URL and inventory-dependent state are always live. A product edited in
Shopify shows the change immediately; a product deleted or unpublished renders as
nothing (the template guards on `product.handle`) — no republish needed.

## 8. Publishing flow (V1 principle: zero Shopify writes)

save draft → validate (slug, ≥1 visible product that exists in `Product` and is
active, image URLs reachable, content payloads well-formed) → if
`requireApproval` and the actor is the creator: `pending_review` → merchant
approves/rejects in the portal → generate `publishedConfig` + `publishedTemplate`,
`publishedVersion = draftVersion`, `publishedAt = now`, `status = published` →
live on the next proxy request. Re-publish overwrites the same columns. Unpublish
sets `status = unpublished`; the proxy returns a theme-styled "page unavailable"
Liquid (never a raw error). No Shopify resource is created, read or written.

## 9. Attribution — one engine, one chain

Visit: the proxy handler creates an `AttributionSession` (`sourcePlatform =
"storefront"`, `affiliateMemberId`, `affiliateCode`, `couponCode`, `storefrontId`,
`contentId` from `?c`, utm*, `landingPath`, `sourceUrl` = referrer, ipHash,
userAgent) and injects `clickId` into the page. The page's inline bootstrap calls the
same storage logic as `hiloomy-track.js` (`ref`, `agent_click_id`, `coupon` → cookie
+ cart attributes). Orders arrive with those `note_attributes` and are matched by the
existing matcher. Shopper events (`storefront_viewed` is the session itself;
`storefront_product_clicked`, `storefront_coupon_copied`, `storefront_add_to_cart`)
POST to `/apps/go/@slug/e` and are stored in `CreatorStorefrontEvent` keyed by the
session. The chain the model answers:

`AffiliateMember` → `AttributionSession.contentId` → `AttributionSession.storefrontId`
→ `CreatorStorefrontEvent(product_click | add_to_cart, shopifyProductId)` →
order via `note_attributes.agent_click_id` → `AffiliateAttribution` (sales, commission).

## 10. Source of truth

| Owner | Owns |
|---|---|
| Hiloomy DB | storefront configuration, drafts, publishing/approval state, slugs, per-store settings, attribution sessions and storefront events |
| Shopify (Admin data) | products, variants, pricing, compare-at, availability, inventory, images, collections, discounts |
| Shopify storefront (runtime) | rendering inside the theme, cart, checkout, customer session, pixels, currency/locale |

## 11. Explicitly not in V1

Metaobjects, theme app extension, Shopify Pages, personalization engine (only the
`?c=` capture), image cropping, custom colours/fonts, video hosting (URL embeds
only), storefront product search, wishlist, reviews, Shopify writes of any kind,
Shopify Files uploads.

## 12. Final Phase 3 schema (owner adjustments 2026-09-24 applied — NOT applied to the DB)

Repo convention check: `schema.prisma` has zero Prisma `enum`s; every state column
is a `String` with a documented value set (`Alert.status`, `AffiliateMember.status`,
`Order.financialStatus`…). We follow that: the value sets below are enforced in the
service layer and in tests. (Switching to Prisma enums later is a one-line change
per column and a data-preserving migration.)

### Value sets ("enums")

| Column | Values |
|---|---|
| `CreatorStorefront.status` | `draft` · `pending_review` · `published` · `unpublished` · `disabled` |
| `CreatorStorefront.layout` / `Settings.defaultLayout` | `default` (V1 only value) |
| `CreatorStorefrontContent.type` | `text` · `image` · `video` |
| `CreatorStorefrontSettings.cardAdapter` | `auto` · `prestige` · `minimog` · `dawn` · `fallback` |
| `CreatorStorefrontEvent.type` | `product_click` · `add_to_cart` · `coupon_copy` · `collection_click` |
| `AttributionSession.sourcePlatform` (existing) | adds `storefront` |

### Models

```prisma
// One storefront per creator per store (DB-enforced). Per-content experiences
// are a FUTURE child concept (StorefrontExperience / Variant → contentId) hanging
// off this row — never additional CreatorStorefront rows.
model CreatorStorefront {
  id                    String    @id @default(cuid())
  storeId               String
  affiliateMemberId     String
  // URL segment after "@": ^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$ ; unique per store.
  slug                  String
  // draft | pending_review | published | unpublished | disabled
  status                String    @default("draft")

  // ---- draft (editable by the creator) ----
  displayName           String?
  headline              String?
  subtitle              String?
  bio                   String?
  profileImageUrl       String?
  heroDesktopUrl        String?
  heroMobileUrl         String?
  socialLinks           Json?     // { instagram?: string; tiktok?: string; youtube?: string }
  layout                String    @default("default")
  showCoupon            Boolean   @default(true)
  draftVersion          Int       @default(1)   // +1 on every draft save

  // ---- published (frozen CONFIG + Liquid TEMPLATE; never commerce state) ----
  publishedVersion      Int?
  publishedConfig       Json?
  publishedTemplate     String?   @db.Text
  publishedAt           DateTime?
  unpublishedAt         DateTime?

  // ---- review (only when Settings.requireApproval) ----
  reviewRequestedAt     DateTime?
  reviewedAt            DateTime?
  reviewedByUserId      String?
  reviewNote            String?

  // ---- preview: 32 random bytes (crypto.randomBytes) base64url, rotatable,
  //      grants READ of the draft render only; never identifies the creator ----
  previewToken          String    @unique
  previewTokenRotatedAt DateTime  @default(now())

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  store               Store                         @relation(fields: [storeId], references: [id], onDelete: Cascade)
  affiliateMember     AffiliateMember               @relation(fields: [affiliateMemberId], references: [id], onDelete: Cascade)
  products            CreatorStorefrontProduct[]
  collections         CreatorStorefrontCollection[]
  content             CreatorStorefrontContent[]
  events              CreatorStorefrontEvent[]
  attributionSessions AttributionSession[]

  @@unique([storeId, affiliateMemberId])
  @@unique([storeId, slug])
  @@index([storeId, status])
}

// The canonical creator-level selection of ONE Shopify product. Everything the
// creator says about a product (order, featured, visibility) lives here once;
// collections point at this row, never at Shopify ids directly.
model CreatorStorefrontProduct {
  id               String   @id @default(cuid())
  storeId          String
  storefrontId     String
  shopifyProductId String
  // Handle captured at selection; refreshed from Product on render when it changed.
  handle           String
  position         Int      // 0-based, contiguous within the storefront; rewritten on reorder
  // Several products may be featured; the service caps it at 4. Featured
  // products render in the "featured" strip before the grid, ordered by position.
  isFeatured       Boolean  @default(false)
  // Shown in the main product grid. A product can be hidden from the grid and
  // still appear inside a collection ("look").
  visible          Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  storefront     CreatorStorefront                    @relation(fields: [storefrontId], references: [id], onDelete: Cascade)
  inCollections  CreatorStorefrontCollectionProduct[]

  @@unique([storefrontId, shopifyProductId])
  @@index([storefrontId, position])
  @@index([storeId, shopifyProductId])   // which storefronts show a product (sync / deletion flags)
}

model CreatorStorefrontCollection {
  id           String   @id @default(cuid())
  storeId      String
  storefrontId String
  title        String
  description  String?
  position     Int
  visible      Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  storefront CreatorStorefront                    @relation(fields: [storefrontId], references: [id], onDelete: Cascade)
  products   CreatorStorefrontCollectionProduct[]

  @@index([storefrontId, position])
}

// Membership = (collection, storefront product). Removing a product from the
// storefront cascades out of every collection; no Shopify id is duplicated.
model CreatorStorefrontCollectionProduct {
  id                 String @id @default(cuid())
  collectionId       String
  storefrontProductId String
  position           Int

  collection       CreatorStorefrontCollection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  storefrontProduct CreatorStorefrontProduct   @relation(fields: [storefrontProductId], references: [id], onDelete: Cascade)

  @@unique([collectionId, storefrontProductId])
  @@index([collectionId, position])
  @@index([storefrontProductId])
}

model CreatorStorefrontContent {
  id           String   @id @default(cuid())
  storeId      String
  storefrontId String
  // text | image | video
  type         String
  // text:  { heading?: string; body: string }
  // image: { url: string; alt?: string; link?: string }
  // video: { url: string (YouTube/Instagram/TikTok/Vimeo page URL); caption?: string }
  payload      Json
  position     Int
  visible      Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  storefront CreatorStorefront @relation(fields: [storefrontId], references: [id], onDelete: Cascade)

  @@index([storefrontId, position])
}

model CreatorStorefrontSettings {
  id                    String   @id @default(cuid())
  storeId               String   @unique
  enabled               Boolean  @default(false)
  requireApproval       Boolean  @default(true)
  allowProductSelection Boolean  @default(true)
  showBio               Boolean  @default(true)
  showCoupon            Boolean  @default(true)
  showCollections       Boolean  @default(true)
  showSocialLinks       Boolean  @default(true)
  defaultLayout         String   @default("default")
  // auto | prestige | minimog | dawn | fallback
  cardAdapter           String   @default("auto")
  // Implementation/configuration limit for the builder (max selectable
  // products), NOT a permanent product-domain constraint. V1 defaults to 20
  // because the current rendering strategy budgets 20 Liquid product lookups
  // per page; raising it is a settings change once lazy batches (§5 A1) ship.
  maxProducts           Int      @default(20)
  // Cached theme detection: { themeId, schemaName, schemaVersion, verifiedAdapter, checkedAt }
  themeInfo             Json?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
}

// INTERACTIONS inside a visit. The visit itself is the AttributionSession row
// (created by the proxy handler) — there is deliberately no "viewed" event.
model CreatorStorefrontEvent {
  id                   String   @id @default(cuid())
  // storeId is kept on the row so merchant-level history stays queryable
  // even after the storefront (and its creator) are deleted.
  storeId              String
  storefrontId         String?
  attributionSessionId String?
  // product_click | add_to_cart | coupon_copy | collection_click
  type                 String
  shopifyProductId     String?
  shopifyVariantId     String?
  collectionId         String?
  quantity             Int?
  occurredAt           DateTime @default(now())

  storefront         CreatorStorefront?  @relation(fields: [storefrontId], references: [id], onDelete: SetNull)
  attributionSession AttributionSession? @relation(fields: [attributionSessionId], references: [id], onDelete: SetNull)

  @@index([storefrontId, occurredAt(sort: Desc)])
  @@index([attributionSessionId])
  @@index([storeId, type, occurredAt(sort: Desc)])
}

// ---- additions to EXISTING models (additive, nullable) ----
model AttributionSession {
  // …existing fields… (sourcePlatform = "storefront" for storefront visits)
  storefrontId String?
  // External reference to the creator content that opened the storefront
  // (?c=…). V1: opaque string set by the creator/tools. Business logic must NOT
  // assume it stays free-form: a future CreatorContent model will own it and
  // this column becomes a relation via a data-preserving migration.
  contentId    String?
  storefront   CreatorStorefront?       @relation(fields: [storefrontId], references: [id], onDelete: SetNull)
  events       CreatorStorefrontEvent[]
  @@index([storeId, storefrontId])
  @@index([storeId, contentId])
}
model AffiliateMember { storefront CreatorStorefront? }                       // relation back-ref only
model Store          { creatorStorefronts CreatorStorefront[]; creatorStorefrontSettings CreatorStorefrontSettings? }
```

### Relations, uniqueness, indexes, deletion — at a glance

| From → To | Cardinality | On delete of the parent |
|---|---|---|
| Store → CreatorStorefront / Settings | 1:N / 1:1 | Cascade (everything under the store goes) |
| AffiliateMember → CreatorStorefront | **1:1 per store** (`@@unique([storeId, affiliateMemberId])`) | Cascade — creator removed ⇒ storefront and children removed |
| CreatorStorefront → Product / Collection / Content | 1:N | Cascade |
| CreatorStorefront → CreatorStorefrontEvent | 1:N optional | **SetNull** — interaction history survives storefront deletion (storeId stays on the row) |
| CreatorStorefrontProduct → CollectionProduct | 1:N | Cascade — product removed ⇒ leaves every look |
| CreatorStorefrontCollection → CollectionProduct | 1:N | Cascade |
| AttributionSession → CreatorStorefront | N:1 optional | **SetNull** — visit history survives a storefront/creator deletion |
| CreatorStorefrontEvent → AttributionSession | N:1 optional | **SetNull** |

Uniques: `(storeId, affiliateMemberId)`, `(storeId, slug)`, `previewToken`,
`(storefrontId, shopifyProductId)`, `(collectionId, storefrontProductId)`,
`Settings.storeId`. Slug collision on create ⇒ `-2`, `-3`… Soft states
(`disabled`, `unpublished`, member not approved) render the theme-styled
"unavailable" page; hard deletes are admin-only.

### Why no `storefront_viewed` event
The proxy handler creates the `AttributionSession` on every storefront request —
that row IS the visit (time, referrer, utm, `?c`, creator, storefront, ip hash,
UA). A second "viewed" row would duplicate it byte for byte and double the write
volume of the busiest path. Views are counted as sessions with `sourcePlatform =
"storefront"`. `CreatorStorefrontEvent` holds only interactions, which are rarer
than views by an order of magnitude; the existing retention job can prune events
older than 180 days if volume ever matters.

### Preview security (service contract)
`previewToken` = `crypto.randomBytes(32)` base64url, unique, rotated on demand
(`previewTokenRotatedAt`) and automatically on publish-after-approval. It is read-
only access to `renderDraft(storefront)`; it never resolves to a creator session.
Without a valid token, `?preview=` is ignored and the published version (or the
"unavailable" page) is served. Preview responses: `Cache-Control: private,
no-store`, `X-Robots-Tag: noindex, nofollow`, `<meta name="robots"
content="noindex, nofollow">` in the body.

### Publish atomicity (service contract)
`publish()` renders `publishedConfig` + `publishedTemplate` in memory from the
draft, then issues ONE `UPDATE … SET publishedConfig, publishedTemplate,
publishedVersion, publishedAt, status = 'published', unpublishedAt = NULL WHERE id
= ? AND draftVersion = ?` (optimistic check). Readers select the row once, so they
see either the previous or the new version, never a mix; if the update fails the
previous version keeps serving.

### Example tree
```
AffiliateMember  ym_01  "ירדן מלכה"  affiliateCode YARDEN  couponCode YARDEN15  (store: takeanap)
└── CreatorStorefront  cs_01  slug "yarden"  status published  draftVersion 7  publishedVersion 7
    ├── CreatorStorefrontProduct  sp_01  shopifyProductId 8231…  handle "sateen-dance-set"  position 0  isFeatured ✓  visible ✓
    ├── CreatorStorefrontProduct  sp_02  … handle "silk-pillowcase"   position 1  isFeatured ✗  visible ✓
    ├── CreatorStorefrontProduct  sp_03  … handle "eye-mask"          position 2  isFeatured ✗  visible ✗   ← only inside a look
    ├── CreatorStorefrontCollection  cc_01  "שגרת הלילה שלי"  position 0
    │   ├── CollectionProduct  → sp_02  position 0
    │   └── CollectionProduct  → sp_03  position 1
    ├── CreatorStorefrontContent  ct_01  type video  position 0  { url: "https://www.instagram.com/reel/…" }
    └── (AttributionSession  sourcePlatform storefront  storefrontId cs_01  contentId "ig_reel_C9x"  clickId k7…)
            └── CreatorStorefrontEvent  product_click  shopifyProductId 8231…
            └── CreatorStorefrontEvent  add_to_cart    shopifyProductId 8231…  shopifyVariantId 4419…  quantity 1
```

### Example `publishedConfig` (version 7)
```json
{
  "version": 7,
  "publishedAt": "2026-09-30T08:12:41.000Z",
  "layout": "default",
  "creator": {
    "affiliateMemberId": "ym_01",
    "affiliateCode": "YARDEN",
    "displayName": "ירדן מלכה",
    "headline": "הפריטים שאני באמת ישנה איתם",
    "subtitle": "סאטן, משי, ומה שעובד לי בקיץ",
    "bio": "…",
    "profileImageUrl": "https://…/yarden.jpg",
    "heroDesktopUrl": "https://…/hero-d.jpg",
    "heroMobileUrl": "https://…/hero-m.jpg",
    "socialLinks": { "instagram": "https://instagram.com/yarden", "tiktok": null }
  },
  "coupon": { "show": true, "code": "YARDEN15", "label": "15% הנחה" },
  "sections": ["identity", "hero", "coupon", "featured", "collections", "content", "grid", "social"],
  "products": [
    { "id": "sp_01", "shopifyProductId": "8231000000001", "handle": "sateen-dance-set", "position": 0, "isFeatured": true,  "visible": true },
    { "id": "sp_02", "shopifyProductId": "8231000000002", "handle": "silk-pillowcase",  "position": 1, "isFeatured": false, "visible": true },
    { "id": "sp_03", "shopifyProductId": "8231000000003", "handle": "eye-mask",         "position": 2, "isFeatured": false, "visible": false }
  ],
  "collections": [
    { "id": "cc_01", "title": "שגרת הלילה שלי", "description": null, "position": 0, "productIds": ["sp_02", "sp_03"] }
  ],
  "content": [
    { "id": "ct_01", "type": "video", "position": 0, "payload": { "url": "https://www.instagram.com/reel/C9x…", "caption": null } }
  ],
  "render": { "liquidProductBudget": 20, "cardAdapter": "auto" }
}
```
Nothing in it is a price, a compare-at, an availability flag, a variant, an image
of a product, or a product URL — all of those are resolved by Shopify from
`handle` at request time.

### Expected migration SQL — `prisma/migrations/20260924_creator_storefronts/migration.sql`
```sql
-- Creator Storefronts (Phase 3). Additive and idempotent; no data backfill.
CREATE TABLE IF NOT EXISTS "CreatorStorefront" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "affiliateMemberId" TEXT NOT NULL,
  "slug" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft',
  "displayName" TEXT, "headline" TEXT, "subtitle" TEXT, "bio" TEXT,
  "profileImageUrl" TEXT, "heroDesktopUrl" TEXT, "heroMobileUrl" TEXT, "socialLinks" JSONB,
  "layout" TEXT NOT NULL DEFAULT 'default', "showCoupon" BOOLEAN NOT NULL DEFAULT true,
  "draftVersion" INTEGER NOT NULL DEFAULT 1,
  "publishedVersion" INTEGER, "publishedConfig" JSONB, "publishedTemplate" TEXT,
  "publishedAt" TIMESTAMP(3), "unpublishedAt" TIMESTAMP(3),
  "reviewRequestedAt" TIMESTAMP(3), "reviewedAt" TIMESTAMP(3), "reviewedByUserId" TEXT, "reviewNote" TEXT,
  "previewToken" TEXT NOT NULL, "previewTokenRotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorStorefront_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorStorefront_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreatorStorefront_affiliateMemberId_fkey" FOREIGN KEY ("affiliateMemberId") REFERENCES "AffiliateMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorStorefront_storeId_affiliateMemberId_key" ON "CreatorStorefront"("storeId", "affiliateMemberId");
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorStorefront_storeId_slug_key" ON "CreatorStorefront"("storeId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorStorefront_previewToken_key" ON "CreatorStorefront"("previewToken");
CREATE INDEX IF NOT EXISTS "CreatorStorefront_storeId_status_idx" ON "CreatorStorefront"("storeId", "status");

CREATE TABLE IF NOT EXISTS "CreatorStorefrontProduct" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "storefrontId" TEXT NOT NULL,
  "shopifyProductId" TEXT NOT NULL, "handle" TEXT NOT NULL, "position" INTEGER NOT NULL,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false, "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorStorefrontProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorStorefrontProduct_storefrontId_fkey" FOREIGN KEY ("storefrontId") REFERENCES "CreatorStorefront"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorStorefrontProduct_storefrontId_shopifyProductId_key" ON "CreatorStorefrontProduct"("storefrontId", "shopifyProductId");
CREATE INDEX IF NOT EXISTS "CreatorStorefrontProduct_storefrontId_position_idx" ON "CreatorStorefrontProduct"("storefrontId", "position");
CREATE INDEX IF NOT EXISTS "CreatorStorefrontProduct_storeId_shopifyProductId_idx" ON "CreatorStorefrontProduct"("storeId", "shopifyProductId");

CREATE TABLE IF NOT EXISTS "CreatorStorefrontCollection" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "storefrontId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "position" INTEGER NOT NULL, "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorStorefrontCollection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorStorefrontCollection_storefrontId_fkey" FOREIGN KEY ("storefrontId") REFERENCES "CreatorStorefront"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CreatorStorefrontCollection_storefrontId_position_idx" ON "CreatorStorefrontCollection"("storefrontId", "position");

CREATE TABLE IF NOT EXISTS "CreatorStorefrontCollectionProduct" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "storefrontProductId" TEXT NOT NULL, "position" INTEGER NOT NULL,
  CONSTRAINT "CreatorStorefrontCollectionProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorStorefrontCollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CreatorStorefrontCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreatorStorefrontCollectionProduct_storefrontProductId_fkey" FOREIGN KEY ("storefrontProductId") REFERENCES "CreatorStorefrontProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorStorefrontCollectionProduct_collectionId_storefrontProductId_key" ON "CreatorStorefrontCollectionProduct"("collectionId", "storefrontProductId");
CREATE INDEX IF NOT EXISTS "CreatorStorefrontCollectionProduct_collectionId_position_idx" ON "CreatorStorefrontCollectionProduct"("collectionId", "position");
CREATE INDEX IF NOT EXISTS "CreatorStorefrontCollectionProduct_storefrontProductId_idx" ON "CreatorStorefrontCollectionProduct"("storefrontProductId");

CREATE TABLE IF NOT EXISTS "CreatorStorefrontContent" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "storefrontId" TEXT NOT NULL,
  "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "position" INTEGER NOT NULL, "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorStorefrontContent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorStorefrontContent_storefrontId_fkey" FOREIGN KEY ("storefrontId") REFERENCES "CreatorStorefront"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CreatorStorefrontContent_storefrontId_position_idx" ON "CreatorStorefrontContent"("storefrontId", "position");

CREATE TABLE IF NOT EXISTS "CreatorStorefrontSettings" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "requireApproval" BOOLEAN NOT NULL DEFAULT true,
  "allowProductSelection" BOOLEAN NOT NULL DEFAULT true, "showBio" BOOLEAN NOT NULL DEFAULT true,
  "showCoupon" BOOLEAN NOT NULL DEFAULT true, "showCollections" BOOLEAN NOT NULL DEFAULT true,
  "showSocialLinks" BOOLEAN NOT NULL DEFAULT true, "defaultLayout" TEXT NOT NULL DEFAULT 'default',
  "cardAdapter" TEXT NOT NULL DEFAULT 'auto', "maxProducts" INTEGER NOT NULL DEFAULT 20, "themeInfo" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorStorefrontSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorStorefrontSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorStorefrontSettings_storeId_key" ON "CreatorStorefrontSettings"("storeId");

CREATE TABLE IF NOT EXISTS "CreatorStorefrontEvent" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "storefrontId" TEXT, "attributionSessionId" TEXT,
  "type" TEXT NOT NULL, "shopifyProductId" TEXT, "shopifyVariantId" TEXT, "collectionId" TEXT, "quantity" INTEGER,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreatorStorefrontEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorStorefrontEvent_storefrontId_fkey" FOREIGN KEY ("storefrontId") REFERENCES "CreatorStorefront"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CreatorStorefrontEvent_attributionSessionId_fkey" FOREIGN KEY ("attributionSessionId") REFERENCES "AttributionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CreatorStorefrontEvent_storefrontId_occurredAt_idx" ON "CreatorStorefrontEvent"("storefrontId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "CreatorStorefrontEvent_attributionSessionId_idx" ON "CreatorStorefrontEvent"("attributionSessionId");
CREATE INDEX IF NOT EXISTS "CreatorStorefrontEvent_storeId_type_occurredAt_idx" ON "CreatorStorefrontEvent"("storeId", "type", "occurredAt" DESC);

ALTER TABLE "AttributionSession" ADD COLUMN IF NOT EXISTS "storefrontId" TEXT;
ALTER TABLE "AttributionSession" ADD COLUMN IF NOT EXISTS "contentId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_storefrontId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_storefrontId_fkey"
      FOREIGN KEY ("storefrontId") REFERENCES "CreatorStorefront"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "AttributionSession_storeId_storefrontId_idx" ON "AttributionSession"("storeId", "storefrontId");
CREATE INDEX IF NOT EXISTS "AttributionSession_storeId_contentId_idx" ON "AttributionSession"("storeId", "contentId");
```

## 13. App-proxy smoke test (gate before the migration)

Code is in place (`app/api/shopify/app-proxy/[...rest]/route.ts` router +
`lib/services/creator-storefront-proxy-diagnostics.ts`). After the owner creates the
proxy in the Dev Dashboard (prefix `apps`, subpath `go`, URL
`https://www.hiloomy.com/api/shopify/app-proxy`) and deploys:

| URL on the store domain | Expect |
|---|---|
| `/apps/go/test` | plain HTML echo: "Reached Hiloomy: yes", "Proxy signature valid: yes", segments `test`, the `shop`/`timestamp`/`path_prefix` params. |
| `/apps/go/@test?c=abc&utm_source=ig` | the store's header/footer around a table: segments `@test`, query shows `c=abc` and `utm_source=ig`, `shop.name`, `template`, `request.path`, `cart.item_count` equal to the shopper's real cart, `theme.schema_name` (Prestige/Minimog), one product title + price from `collections.all`. |
| response headers (DevTools) | `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow` present on the plain echo; on the Liquid page Shopify may replace headers — note what survives. |
| `/apps/go/@anything-else` | theme-styled "העמוד הזה עדיין לא זמין". |
| existing `/apps/go/{token}` | still redirects as before. |

If `@test` does not arrive as `@test`, the router switches to `/apps/go/c/{slug}`
(one constant), and this document is updated.

## 14. Manual Shopify setup (owner)

Dev Dashboard → app → App proxy: prefix `apps`, subpath `go`, proxy URL
`https://www.hiloomy.com/api/shopify/app-proxy`. This also makes the existing short
links work. No new scopes for V1.
