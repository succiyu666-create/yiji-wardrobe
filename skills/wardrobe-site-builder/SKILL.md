---
name: wardrobe-site-builder
description: Build and update personal wardrobe and outfit management websites. Use when a user asks to catalog clothes, create and browse outfit combinations, track wears and cost per wear, archive or resell garments, or publish an existing wardrobe web app.
---

# Wardrobe Site Builder

Build a calm, photo-first personal wardrobe tool. Keep the clothing and outfit data useful before adding decorative features.

## Product baseline

Use [references/product-blueprint.md](references/product-blueprint.md) for the default data model, lifecycle rules, and visual direction. Preserve an existing project's architecture, design system, and data whenever updating it.

Default to device-local storage for a personal prototype. Add accounts, cross-device sync, AI try-on, or social features only when the user explicitly asks for them.

## Workflow

1. Inspect the existing app, its persistence model, and its publishing configuration. Do not replace a working stack merely to use a preferred framework.
2. Restate the user-visible outcome in plain language, then implement one coherent change rather than scattering partial controls across the interface.
3. Treat outfits as records that reference garment IDs. From a garment detail, always make its related outfits discoverable.
4. Keep uploaded garment photos visually dominant. Use quiet warm surfaces, restrained typography, and small status labels instead of dashboard-like charts.
5. Make lifecycle and money calculations explicit in the interface. Preserve historical values instead of deleting archived garments.
6. Test the relevant build and lint commands. When the project has `.openai/hosting.json`, use the Sites build and hosting workflows. When it uses GitHub Pages, preserve its existing Pages build and publish workflow.

## Required interaction patterns

- Make all categories available in both the item form and the wardrobe filters; include `袜子` in the default category set.
- Show a garment's outfit count on its card and its complete related-outfit list in the detail view.
- Keep wear count separate from saved outfit count. A quick “今天穿了” action increments wear count and updates the last-worn date.
- Let users record purchase price. Calculate average cost per wear only when both price and at least one wear are known.
- Give archives a visible destination in navigation, not only a hidden filter. Let users edit an archive record or restore an item to the active wardrobe.
- For an archived garment, support `待处理`, `已报废`, and `已出二手`. Require a resale price for the resale state and display the final cost formula clearly.

## Safety and handoff

- Keep existing browser-stored data compatible when evolving the schema; normalize legacy records on load.
- Do not claim cross-device synchronization when data is stored only in the browser.
- Publish only after a successful build. Report the live URL and the primary actions the user can now take.
