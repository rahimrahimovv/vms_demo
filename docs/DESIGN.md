# DESIGN.md — shadcn/ui Design System

A near-monochrome, high-clarity system recreating shadcn/ui's *new-york* style (v4): neutral OKLCH colors, Geist type, Tailwind's 4px spacing, soft shadows. Color is reserved almost entirely for data viz.

Source: [shadcn-ui/ui](https://github.com/shadcn-ui/ui) (`apps/v4`) · [ui.shadcn.com](https://ui.shadcn.com)

---

## 1. Principles

- **Monochrome first.** Black, white and neutral grays do the work; the blue chart ramp is the only chromatic accent.
- **Flat surfaces.** No gradients, textures or illustration. Cards are solid `card` with a 1px `border`.
- **Small, dense UI.** Body is 14px (`text-sm`); inputs 16px (`text-base`). Weights 400 / 500 / 600 only.
- **Soft elevation.** Low-opacity neutral shadows; never colored or glowing.
- **Restrained motion.** ~150ms ease on color, background and box-shadow. No springs, no bounce.

## 2. Voice & content

- Plain, technical, dry-witted; developer to developer. Address the reader as **you**.
- Title Case for short labels ("Add Section"); sentence case for descriptions ("Deploy your new project in one click.").
- Terse microcopy: one-sentence card descriptions, 1–2 word buttons ("Deploy", "Cancel").
- No emoji in product UI. No ALL-CAPS.
- Data is matter-of-fact: a trend badge (+12.5%) plus a one-line gloss ("Trending up this month").

## 3. Color

All values OKLCH. Light is the default theme; dark remaps the same names. `{name}` means an alias of another token.

| Token | Light | Dark | Use |
|---|---|---|---|
| `color-blue-300` | `oklch(0.809 0.105 251.813)` | `—` | Tailwind blue ramp step; source of chart-1. |
| `color-blue-500` | `oklch(0.623 0.214 259.815)` | `—` | Tailwind blue ramp step; source of chart-2. |
| `color-blue-600` | `oklch(0.546 0.245 262.881)` | `—` | Tailwind blue ramp step; source of chart-3. |
| `color-blue-700` | `oklch(0.488 0.243 264.376)` | `—` | Tailwind blue ramp step; source of chart-4. |
| `color-blue-800` | `oklch(0.424 0.199 265.638)` | `—` | Tailwind blue ramp step; source of chart-5. |
| `background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | Page background. |
| `foreground` | `oklch(0 0 0)` | `oklch(0.985 0 0)` | Default text on background, card and popover. |
| `card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | Card surface (with 1px border and shadow-sm). |
| `card-foreground` | `oklch(0 0 0)` | `oklch(0.985 0 0)` | Text on card. |
| `popover` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | Popover and dropdown surface. |
| `popover-foreground` | `oklch(0 0 0)` | `oklch(0.985 0 0)` | Text on popover. |
| `surface` | `oklch(0.98 0 0)` | `oklch(0.2 0 0)` | Soft site surface; also the code block ground. |
| `surface-foreground` | `{foreground}` | `oklch(0.708 0 0)` | Text on surface and code. |
| `primary` | `oklch(0 0 0)` | `oklch(0.922 0 0)` | Primary button fill, checked checkbox and switch track, default badge. |
| `primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | Text and icons on primary. |
| `secondary` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Secondary button and badge fill. |
| `secondary-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | Text on secondary. |
| `muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Muted fills: tabs track, table header, row hover. |
| `muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | Secondary text — descriptions, captions, placeholders — on background, card and muted. |
| `accent` | `oklch(0.97 0 0)` | `oklch(0.371 0 0)` | Hover fill for ghost and outline buttons and nav items. |
| `accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | Text on accent. |
| `destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Destructive buttons, badges, alerts and the invalid-field ring. |
| `destructive-foreground` | `oklch(0.97 0.01 17)` | `oklch(0.58 0.22 27)` | Text on destructive. As shipped, the dark pair falls well below 4.5:1 on destructive; kept exact from the source. |
| `border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 0.1)` | 1px hairline on cards, inputs, tables and separators. |
| `input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 0.15)` | Border of inputs, selects and textareas. |
| `ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | Focus ring, drawn 3px at 50% with a border-color shift. |
| `chart-1` | `{color-blue-300}` | `—` | Chart series 1 — the lightest blue. |
| `chart-2` | `{color-blue-500}` | `—` | Chart series 2; also the 'done' status icon in tables. |
| `chart-3` | `{color-blue-600}` | `—` | Chart series 3. |
| `chart-4` | `{color-blue-700}` | `—` | Chart series 4. |
| `chart-5` | `{color-blue-800}` | `—` | Chart series 5 — the deepest blue. |
| `sidebar` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | App sidebar background. |
| `sidebar-foreground` | `oklch(0 0 0)` | `oklch(0.985 0 0)` | Text in the sidebar. |
| `sidebar-primary` | `oklch(0.205 0 0)` | `oklch(0.488 0.243 264.376)` | Primary fill inside the sidebar (blue in dark). |
| `sidebar-primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` | Text on sidebar-primary. |
| `sidebar-accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Hover and active sidebar item fill. |
| `sidebar-accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | Text on sidebar-accent. |
| `sidebar-border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 0.1)` | Sidebar edge and dividers. |
| `sidebar-ring` | `oklch(0.708 0 0)` | `oklch(0.439 0 0)` | Focus ring inside the sidebar. |
| `code` | `{surface}` | `—` | Code block ground. |
| `code-foreground` | `{surface-foreground}` | `—` | Code text. |
| `code-highlight` | `oklch(0.96 0 0)` | `oklch(0.27 0 0)` | Highlighted code line. |
| `code-number` | `oklch(0.56 0 0)` | `oklch(0.72 0 0)` | Line numbers in code blocks. |
| `selection` | `oklch(0 0 0)` | `oklch(0.922 0 0)` | Text selection fill. |
| `selection-foreground` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | Selected text. |

**Pairs to use:** `foreground` on `background`/`card`/`popover`; `muted-foreground` for secondary text; `primary-foreground` on `primary`; `secondary-foreground` on `secondary`; `accent-foreground` on `accent`.

> ⚠️ In dark mode `destructive-foreground` on `destructive` falls well below 4.5:1 as shipped by the source. Prefer white text on destructive fills (the components do).

## 4. Typography

| Family | Stack | Use |
|---|---|---|
| `--font-sans` | "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif | All UI text |
| `--font-heading` | "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif | Headings (same face as UI) |
| `--font-mono` | "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace | Code, kbd, numerics |

Geist and Geist Mono load from Google Fonts. No italics in the chrome.

### Scale

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-xs` | 0.75rem | 1rem | Captions, helper and badge text. |
| `text-sm` | 0.875rem | 1.25rem | Body — the UI default; labels and buttons. |
| `text-base` | 1rem | 1.5rem | Inputs and large body text; card titles. |
| `text-lg` | 1.125rem | 1.75rem | Small headings. |
| `text-xl` | 1.25rem | 1.75rem | Headings. |
| `text-2xl` | 1.5rem | 2rem | Section titles. |
| `text-3xl` | 1.875rem | 2.25rem | KPI values. |
| `text-4xl` | 2.25rem | 2.5rem | Display headings. |
| `text-5xl` | 3rem | 1 | Marketing display. |
| `text-6xl` | 3.75rem | 1 | Marketing display. |

### Roles

| Role | Size / line | Weight | Tracking | Example |
|---|---|---|---|---|
| `display` | 2.25rem / 2.5rem | 600 | -0.025em | Display heading |
| `section-title` | 1.5rem / 2rem | 600 | 0 | Section title |
| `card-title` | 1rem / 1.5rem | 600 | 0 | Create project |
| `body` | 0.875rem / 1.25rem | 400 | 0 | Deploy your new project in one click. |
| `label` | 0.875rem / 1.25rem | 500 | 0 | Email |
| `caption` | 0.75rem / 1rem | 400 | 0 | 0 of 6 row(s) selected. |
| `code` | 0.875rem / 1.25rem | 400 | 0 | npx shadcn@latest add button |

Weights: `font-weight-normal` 400 · `font-weight-medium` 500 (labels, buttons) · `font-weight-semibold` 600 (titles) · `font-weight-bold` 700 (rare). Tracking: `tracking-tight` -0.025em on large display headings only.

## 5. Spacing & sizing

Base unit 4px (`--spacing: 0.25rem`).

| Token | Value | Use |
|---|---|---|
| `spacing` | 0.25rem | The 4px base unit. |
| `space-0_5` | 0.125rem | 2px. |
| `space-1` | 0.25rem | 4px. |
| `space-1_5` | 0.375rem | 6px. |
| `space-2` | 0.5rem | 8px — gap inside controls. |
| `space-2_5` | 0.625rem | 10px. |
| `space-3` | 0.75rem | 12px. |
| `space-4` | 1rem | 16px — container padding (px-4). |
| `space-5` | 1.25rem | 20px. |
| `space-6` | 1.5rem | 24px — gap between card sections and card side padding. |
| `space-8` | 2rem | 32px — container padding (px-8). |
| `space-10` | 2.5rem | 40px. |
| `space-12` | 3rem | 48px. |
| `space-16` | 4rem | 64px. |
| `space-24` | 6rem | 96px. |
| `control-h-sm` | 2rem | 32px control height, size="sm". |
| `control-h` | 2.25rem | 36px default control height. |
| `control-h-lg` | 2.5rem | 40px control height, size="lg". |

Rhythm: 8px gaps inside controls · 24px between card sections and 24px card side padding · containers `px-4`/`px-8` · max width 1400px.

## 6. Radius

All steps derive from one 10px knob.

| Token | Value | Use |
|---|---|---|
| `radius` | 0.625rem | The base knob, 10px. |
| `radius-sm` | 0.375rem | 6px (radius × 0.6) — small icon buttons, menu items. |
| `radius-md` | 0.5rem | 8px (radius × 0.8) — buttons and inputs. |
| `radius-lg` | 0.625rem | 10px (radius) — tab track, swatches. |
| `radius-xl` | 0.875rem | 14px (radius × 1.4) — cards and tables. |
| `radius-2xl` | 1.125rem | 18px (radius × 1.8). |
| `radius-3xl` | 1.375rem | 22px (radius × 2.2). |
| `radius-full` | 9999px | Badges, avatars, switch. |

## 7. Elevation

| Token | Value | Use |
|---|---|---|
| `shadow-2xs` | `0 1px rgb(0 0 0 / 0.05)` | Hairline lift. |
| `shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Controls: buttons, inputs. |
| `shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | Cards and the active tab. |
| `shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Popovers and dropdowns. |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Dialogs. |
| `shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` | Large overlays. |
| `shadow-2xl` | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | Dialogs at their most raised. |

## 8. Borders, focus & states

- **Borders:** 1px `border` on nearly every surface edge; inputs use `input`. In dark mode borders are translucent white (10% / 15%).
- **Focus:** 3px ring in `ring` at 50% (`color-mix(in oklab, var(--ring) 50%, transparent)`) plus border-color shift to `ring`.
- **Invalid:** border `destructive` + 3px ring of `destructive` at 20%. Set `aria-invalid="true"`.
- **Hover:** filled buttons go to ~90% of their fill; ghost/outline and nav items get `accent`; links underline.
- **Disabled:** 50% opacity, no pointer events.
- **Active:** brief opacity dip; no scale.

## 9. Iconography

- [Lucide](https://lucide.dev) (`lucide-react`) is canonical.
- Outline, 1.5px stroke, round caps & joins, 24px grid, `currentColor`. Render at 16px (`size-4`) in dense UI.
- No emoji or unicode glyphs as icons.
- **Logo:** one geometric mark (two diagonal strokes in a rounded square), always monochrome — black on light, white on dark.

## 10. Components

React, namespace `window.ShadcnUiDesignSystem_a50960`.

| Component | Spec |
|---|---|
| **Button** | Primary action. Variants `primary` (default) · `secondary` · `outline` · `ghost` · `link` · `destructive`. Sizes `sm` 32px · `default` 36px · `lg` 40px · `icon` 36px square. Icons auto-size to 16px, 8px gap. |
| **Card** | 1px border, 14px radius (`radius-xl`), `shadow-sm`, 24px section gaps and side padding. Parts: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. |
| **Badge** | Pill, `text-xs` medium. Variants `primary` · `secondary` · `outline` · `destructive`. |
| **Avatar** | Circle; `sm` 24 · `default` 32 · `lg` 40px. Falls back to initials. |
| **Alert** | Inline callout with optional leading icon. `default` · `destructive`. Parts: `AlertTitle`, `AlertDescription`. |
| **Separator** | 1px `border` line, horizontal or vertical. |
| **Input** | 36px, transparent, 1px `input` border, `shadow-xs`, focus ring. Pair with `Label`. |
| **Textarea** | Input chrome, min 64px, resizes vertically. |
| **Select** | Native select in Input chrome with chevron. |
| **Label** | `text-sm` medium; link via `htmlFor`. |
| **Checkbox** | 16px square, 4px radius; fills `primary` when checked. |
| **Switch** | Pill track; fills `primary` when on. For instant settings. |
| **Tabs** | Muted track; active trigger lifts onto a `background` pill with `shadow-sm`. Parts: `TabsList`, `TabsTrigger`, `TabsContent`. |

## 11. Layout

- Centered max-width containers (1400px), generous gutters.
- Sticky header with `backdrop-filter: blur` over a translucent background.
- Fixed sidebar (`sidebar` tokens), 256px in the dashboard pattern.
- Overlays dim with a semi-opaque scrim; fade/zoom in.

## 12. Do / Don't

| Do | Don't |
|---|---|
| Use `primary` (black/near-white) for the main action | Introduce brand hues or gradients |
| Keep body at 14px, weights 400–600 | Use bold 700 or italics in the chrome |
| Separate surfaces with 1px borders and soft shadows | Use colored left-border accent cards or glowing shadows |
| Reserve blue (`chart-1…5`) for data | Use the chart blues for buttons or links |
| Write terse, plain microcopy | Use emoji or marketing tone in UI |
