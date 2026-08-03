---
name: Bluestar
description: Fleet management platform for a parent company running several operating companies. Untitled UI on React + Tailwind v4; this DESIGN.md specifies the multi-tenancy delta and records the accent colour the product actually uses.
status: final
updated: 2026-07-31
inherits: Untitled UI (src/styles/tokens.css, registered via @theme in src/styles/global.css)
sources:
  - ../../ux-backlog.md
  - ../../../../src/styles/tokens.css
colors:
  # Untitled UI tokens, already implemented. Nothing here is new — this names the
  # subset the multi-tenancy surfaces use. Violet is the product's accent; see
  # Colors for why this supersedes CLAUDE.md's brand-600 claim.
  violet-25: '#fbfaff'
  violet-50: '#f5f3ff'
  violet-100: '#ece9fe'
  violet-500: '#875bf7'
  violet-600: '#7839ee'
  violet-700: '#6927da'
  violet-800: '#5720b7'
  gray-200: '#eaecf0'
  gray-400: '#98a2b3'
  error-50: '#fef3f2'
  error-500: '#f04438'
  error-600: '#d92d20'
  error-700: '#b42318'
  warning-50: '#fffaeb'
  warning-500: '#f79009'
  success-50: '#ecfdf3'
  success-600: '#079455'
  # Full gray ramp (gray-25 → gray-950) inherited, referenced by token name.
typography:
  # Inter ramp inherited from Untitled UI in full. No overrides.
  # Sizes: text-xs / sm / md / lg / xl / display-xs → display-2xl
  # Weights: 400 regular · 500 medium · 600 semibold · 700 bold
  page-title:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
rounded:
  # Untitled UI radius scale, referenced by token name — NOT re-minted as pixels.
  # radius-md 8px · radius-lg 10px · radius-xl 12px · radius-full
  input: radius-lg
  card: radius-xl
  popover: radius-xl
  pill: radius-full
spacing:
  # Untitled UI spacing scale inherited (spacing-xxs 2px → spacing-11xl 160px).
components:
  company-badge:
    background: '{colors.violet-50}'
    foreground: '{colors.violet-700}'
    radius: '{rounded.input}'
  company-switcher-popover:
    background: white
    border: '{colors.gray-200}'
    radius: '{rounded.popover}'
  skeleton-row:
    background: gray-100
    radius: '{rounded.input}'
  error-block:
    icon: '{colors.error-500}'
    detail-background: gray-50
    detail-font: 'JetBrains Mono'
---

## Brand & Style

Bluestar is a fleet management platform. Its users are not browsing — they are
dispatching vehicles and drivers against real bookings on a real morning, and
every screen is a work surface with consequences attached. The visual posture
follows: sober, dense where density earns its keep, and completely uninterested
in delight for its own sake.

Bluestar inherits **Untitled UI** wholesale. The token system already exists in
`src/styles/tokens.css` and is registered into Tailwind's `@theme` in
`src/styles/global.css`. This DESIGN.md adds **no new palette and no new type
ramp**. It names the components the multi-tenancy build introduces, and records
which of the existing tokens those components are permitted to use.

Two audiences with opposite needs, and the design language splits accordingly:

- **Operational surfaces** (duties, bookings, availability, expenses) serve a
  person who uses them hundreds of times a year. Dense, fast, quiet.
- **Settings surfaces** serve a person who visits a handful of times a year and
  will have forgotten how they work. Roomier, labelled, explicit.

Settings must not inherit the operational pages' density. A deliberate
divergence, not an inconsistency.

## Colors

**`violet-600` `#7839ee` is the accent colour.** Primary buttons, active nav,
links, focus rings. `violet-700` `#6927da` is its hover and text weight.
`violet-50` `#f5f3ff` is the only accent fill permitted on large areas.

This supersedes `CLAUDE.md`, which names `brand-600` `#155eef` as the primary.
That claim does not describe the product. Measured against `src/` on 2026-07-31:

| Token family | Usages in application code | Occurrences in `styles/` |
|---|---|---|
| `violet-*` | **316**, across 33 files | 24 (scale definition) |
| `brand-*` | **0** | 41 (scale definition) |

Measured 2026-07-31, counting occurrences outside `src/styles/`. Every
`brand-*` occurrence is a token *definition*; not one is a usage in a component.
The comparison is **316 to nothing**.

Violet is a fully defined, `@theme`-registered scale (`violet-25` → `violet-950`,
`tokens.css:146`) used by `Field`, `DateRangePicker`, `Toast`,
`ConfirmDeleteModal`, `FileUpload`, `AppShell` and every layout. It is not drift
in one page; it is the design system as built. `CLAUDE.md` should be corrected to
match.

The gray ramp (`gray-25` → `gray-950`) carries all text, borders and surfaces.
Semantic scales (`error-*`, `warning-*`, `success-*`) carry state and nothing
else — `error-*` is never emphasis, `success-*` is never decoration.

**Raw hex is still banned.** Two literals appear in
`src/pages/settings/SettingsPage.tsx`, and they are not the same kind of problem:

| Literal | Uses | Status |
|---|---|---|
| `#98a2b3` | — | Exactly `gray-400`. Replace with the token. |
| `#e4e7ec` | 8 | **Not in the token system.** Nearest is `gray-200` `#eaecf0` — close but different. Someone eyeballed a border colour. Replace with `gray-200` and accept the one-shade shift. |

Companies are **not** colour-coded. A per-company accent was considered as
ambient wayfinding and rejected — see EXPERIENCE.md and DEC-5. In this product
colour carries state, never identity.

## Typography

Inter throughout, at the Untitled UI ramp. JetBrains Mono appears in exactly one
place: the technical-detail payload inside an error block, signalling "this text
is for a machine or for Yash, not for you."

Page titles are 30px / 38px / semibold — the established pattern across existing
pages. No second font, no display face.

## Layout & Spacing

Untitled UI spacing scale, inherited unchanged. No new values.

The shell is fixed: an **80px icon rail** (`w-20`), then either a **208px
sub-nav panel** (`w-52`) or a horizontal tab bar inside the page. Main content is
`flex-1 overflow-y-auto`.

Multi-tenancy adds nothing to this shell but a company badge in the rail. No new
chrome, no second bar, no banner.

Settings content sits at `max-w-3xl` (768px) — narrower than operational pages,
part of how the two design languages diverge.

> **Corrected 2026-07-31 after implementation.** This line was wrong when
> written: the `@theme` block registered `--spacing-3xl`, and Tailwind v4
> resolves `max-w-*` against that namespace, so `.max-w-3xl` compiled to
> `max-width: 24px`. Every named `max-w-*` utility in the app was broken,
> including the Settings Account tab this line describes. Fixed by removing the
> unused named spacing scale from `@theme`; `max-w-*` now resolves to
> `--container-*` as intended. Three review rounds read this line without
> catching it — reviewers read prose, they do not run the code.

## Elevation & Depth

Untitled UI shadow scale (`shadow-xs` → `shadow-3xl`), inherited. Popovers and
drawers take shadow; tables and cards do not. Elevation means *floating above*,
never hierarchy or importance.

Row action menus and the company switcher popover render in a **portal** —
established by commit `76e879c` after menus were clipped by table overflow. Any
new floating surface follows suit.

## Shapes

Radius is referenced **by token name**, never re-minted as pixels. The scale:
`radius-md` 8px · `radius-lg` 10px · `radius-xl` 12px · `radius-full`.

`radius-lg` is the workhorse — inputs, buttons, badges — and is already used
266 times across `src/` as `rounded-lg`. New components match it rather than
introducing a competing value. `radius-xl` for cards, drawers, popovers and
modals. `radius-full` on status pills and avatars only.

## Components

Inherited from the existing system, unchanged — do not restyle:
`Drawer` (480px right slide-in), `StatusBadge`, `ConfirmDeleteModal`,
`ClearAllotmentModal`, `RestoreDutyModal`, `Toast`, `FileUpload`, `Field`,
`DateRangePicker`.

> `CLAUDE.md` also lists a `ConfirmModal`. **No such component exists** in
> `src/components/ui/`. Do not build against it.

New components introduced by the multi-tenancy build. Rendered 1:1 in
[`mockups/`](mockups/) — shell and switcher, state patterns, member drawer, and
the login/chooser pair. **The spine wins on conflict with any mock.**

- **Company badge** — a square button in the 80px rail. `{colors.violet-50}`
  fill, `{colors.violet-700}` glyph, `{rounded.input}`. Displays the company's
  **short code**, not a derived initial — "Bluestar North", "Bluestar East" and
  "Bluestar South" all yield "B", which conveys nothing. See EXPERIENCE.md for
  the short-code rule.
- **Company switcher popover** — portal-rendered, opens from the badge. One row
  per company: short code, name, duty count. Active row carries a leading
  `violet-600` dot. White surface, `{colors.gray-200}` border,
  `{rounded.popover}`.
- **Skeleton row** — `gray-100` at `{rounded.input}`, sized to the columns of the
  table it stands in. Replaces every "Loading…" text line.
- **Error block** — two tiers. Top: `{colors.error-500}` icon, plain-language
  headline in `gray-900`, body in `gray-600`, primary retry. Below: a collapsed
  **Technical details** disclosure on `gray-50`, contents in JetBrains Mono.
- **Empty state** — headline naming the company, body line, single primary
  action. No illustration.
- **Login card** — centred, `max-w-sm`, on a `gray-50` page. Wordmark, two
  fields, one primary button, one text link.
- **Company chooser** — full-screen, one-time. Reuses the switcher popover's row
  shape at larger scale, so the pattern is learned once.
- **Company access checklist** — a checkbox list inside the member `Drawer`.
  Plain, labelled, no chips. Renders **read-only** on your own row.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use `violet-*` for accent and primary actions | Reintroduce `brand-*` — it has 0 usages against violet's 316 |
| Reference radius by token (`radius-lg`) | Re-mint radius as pixels (8px / 12px) |
| Replace `#98a2b3` with `gray-400` | Leave raw hex anywhere |
| Replace `#e4e7ec` with `gray-200`, accepting the shift | Add `#e4e7ec` to the token system to legitimise it |
| Let Settings breathe at `max-w-3xl` | Give Settings the duties table's density |
| Use `error-*` / `success-*` for state only | Use semantic colour decoratively |
| Show a company **short code** in the badge | Derive an initial — three companies share one |
| Portal every floating surface | Let popovers be clipped by table overflow |
| One loading pattern everywhere | Mix skeletons and "Loading…" text |
| JetBrains Mono for machine-facing text | Use mono for emphasis or headings |
