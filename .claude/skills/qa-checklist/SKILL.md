---
name: qa-checklist
description: Standard QA and UI verification checklist for this repo's projects. Invoke when running QA, verifying a UI, or building/updating a QA plan. Covers render checks, critical flows, regression, responsive/RTL, and accessibility basics.
---

# QA Checklist

Run the relevant sections for the project under test. Use the Playwright MCP for live UI checks — confirm pages actually render, don't assume.

## 1. Render & load
- [ ] Page returns 200 and renders without console errors.
- [ ] No layout shift / overlapping elements / broken images.
- [ ] Fonts and theme styles applied (no FOUT/unstyled flash).

## 2. Critical user flows
- [ ] Each primary flow completes end to end (e.g. browse → product → add to cart → checkout for storefronts).
- [ ] Forms submit, validate, and show success/error states.
- [ ] Navigation, search, and links resolve (no 404s).

## 3. Responsive & RTL
- [ ] Mobile, tablet, desktop breakpoints intact.
- [ ] RTL layout correct — text alignment, mirrored icons, no clipped content (this store is RTL).

## 4. Regression
- [ ] Areas adjacent to the change still work (check the QA plan's regression list).
- [ ] Previously-fixed defects have not reappeared (cross-check memory/defect history).

## 5. Accessibility & performance (smoke)
- [ ] Images have alt text; interactive elements are keyboard reachable.
- [ ] Color contrast on key text is legible.
- [ ] No obvious performance regression (page weight, blocking scripts).

## Output
For each area: PASS/FAIL + evidence (screenshot path, console snippet, or URL). File confirmed defects to `tasks/bugs.md` with severity and `file:line`.

> Extend with project-specific critical flows and acceptance criteria as the QA plan matures.
