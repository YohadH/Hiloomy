---
name: shopify-section
description: Conventions for authoring Shopify Liquid sections and blocks for this store. Invoke when creating or editing a section, block, or section schema. Covers schema decoupling, RTL handling, theme fonts, and MCP validation.
---

# Shopify Section Authoring

Follow these conventions for every section/block in this store. Validate against the live schema with the `shopify-dev-mcp` tools before writing Liquid or GraphQL — never guess filters or fields.

## Structure
- One concern per section. Keep markup, CSS, and `{% schema %}` in the same `.liquid` file unless the theme already splits CSS into assets.
- Wrap each section's root in a unique class derived from its filename so styles never leak: `.section-<name>`.
- Blocks render in a `{% for block in section.blocks %}` loop with `{{ block.shopify_attributes }}` on the block root (required for the theme editor).

## Schema decoupling
- Do NOT hardcode copy, image URLs, colors, or counts. Every editor-facing value is a `setting` (section or block).
- Group settings with `header` settings and sensible `default` values so the section works the moment it's added.
- Keep `max_blocks` realistic; expose block types rather than many boolean toggles.

## RTL handling
- This store renders RTL. Use logical CSS properties (`margin-inline-start`, `padding-inline-end`, `inset-inline`) — never raw `left`/`right`.
- Mirror icons/arrows with `[dir="rtl"]` overrides where direction is meaningful.

## Theme fonts
- Use the theme's font settings (`{{ settings.type_*_font | font_face }}` / `font-family` from settings) — do not import external fonts in a section.

## Validation (required before writing)
1. `learn_shopify_api` once per session.
2. Introspect/validate any GraphQL against the live Admin/Storefront schema.
3. Validate Liquid (filters, objects, tags) against the current theme schema to catch undefined variables and removed filters.
4. State what to re-check in the theme editor after the change.

> Customize this file with the store's actual base theme, naming prefix, and any house-specific block patterns as they solidify.
