# Celestial Fluidity — design system (kyn)

**North star:** *The Infinite Horizon* — floating, tonal, luminous; avoid rigid boxes and pure greys.

## Where it lives

- **Tokens & global rules:** `src/index.css` (`:root` + `@theme inline` + `@layer components`).
- **Tailwind aliases:** `tailwind.config.js` (background, primary, fonts).
- **Fonts:** `index.html` — **Manrope** (body/UI), **Space Grotesk** (display — use `font-display`).
- **Builder (IDE) layout:** same structure; colors/radius/glass via CSS variables in `src/pages/Builder.tsx` (`BUILDER_*` constants map to `--celestial-*`).

## Rules (short)

| Do | Don’t |
|----|--------|
| Separate regions by **surface tier** (`surface` → `surface_container_low` / `_high`) | 1px solid “grid” borders for sectioning |
| **Ghost** edges: `var(--celestial-ghost-outline)` or soft cyan separator | Pure neutral greys |
| **Glass:** `.celestial-glass` / `.celestial-glass-strong` for floating chrome | Flat modal slabs with hard outlines |
| **Primary CTA:** gradient cyan + hover glow (see `.btn-celestial-primary`, Send in Builder) | Flat primary buttons only |
| **Highlight** key words with `var(--celestial-primary)` | |
| Corner radius **≥ `sm` (0.5rem)**; panels often `rounded-2xl` / `1.25rem` | `rounded-none` on UI chrome |

## Optional motion

- **Nebula pulse:** `.celestial-nebula-ripple` + `@keyframes celestial-nebula-pulse` — trigger from JS on high-value submit if desired.

## Full narrative

The detailed art-direction brief (asymmetry, spacing scale, etc.) is product copy; implementation priorities above match the tokens in `index.css`.
