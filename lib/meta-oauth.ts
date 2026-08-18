// Shared constants for the Meta Ads one-click OAuth flow. They live here
// (not in the route files) because Next.js route modules may only export
// HTTP handlers and route-config fields — anything else fails the build.

export const META_OAUTH_STATE_COOKIE = "hl_meta_oauth_state";
export const META_OAUTH_STORE_COOKIE = "hl_meta_oauth_store";
