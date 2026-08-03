# Blue Star — Fleet Management Platform

## Stack
- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/vite`) — configured via `@theme` in `src/styles/global.css`
- **React Router v7** (`react-router-dom`)
- **Supabase** — DB types in `src/lib/database.types.ts`, client in `src/lib/supabase.ts`
- **lucide-react** for icons — always use `strokeWidth={1.75}`
- **clsx** for conditional class merging

## Design System

### Tokens
All tokens live in `src/styles/tokens.css` (Untitled UI system) and are registered into Tailwind's `@theme` in `src/styles/global.css`.

**Never use raw hex values.** Always use token-based Tailwind classes (e.g. `text-gray-700`, `bg-violet-600`, `border-gray-200`).

### Accent
**`violet-600` is the accent colour**, not `brand-*`. Measured across `src/`:
violet is used **316 times in 33 files**; `brand-*` has **0 usages** — all its
occurrences are token definitions in `styles/`. Do not "correct" violet to brand.

| Purpose | Token | Value |
|---------|-------|-------|
| Primary action bg | `bg-violet-600` | `#7839ee` |
| Primary action hover | `bg-violet-700` | `#6927da` |
| Accent text | `text-violet-700` | `#6927da` |
| Accent light bg | `bg-violet-50` | `#f5f3ff` |

### Palette summary
- **Gray scale**: `gray-25` → `gray-950` (text, borders, backgrounds)
- **Semantic**: `error-*`, `warning-*`, `success-*` scales
- **Spacing**: use Tailwind's **numeric** scale (`p-4`, `gap-6`). The Untitled UI
  named scale exists in `tokens.css` for reference but is **deliberately not
  registered in `@theme`** — Tailwind v4 resolves `max-w-*` against the
  `--spacing-*` namespace, so registering `--spacing-sm` made `.max-w-sm` mean
  `max-width: 6px`. See the comment in `global.css`.
- **Radius**: `radius-xxs` (2px) → `radius-full`
- **Shadows**: `shadow-xs` → `shadow-3xl`

### Typography
- Font: **Inter** (system fallback `sans-serif`)
- Mono: **JetBrains Mono**
- Sizes: `text-xs` / `text-sm` / `text-md` / `text-lg` / `text-xl` / `text-display-{xs–2xl}`
- Weights: regular (400), medium (500), semibold (600), bold (700)

## Layout / Shell

`src/layouts/AppShell.tsx` provides the global shell:
- **Icon sidebar** — 80px wide, `w-20`, icon buttons navigate to first child route
- **Sub-nav panel** — 208px wide, `w-52`, shown when `horizontalNav` is false on the active section
- **Horizontal tab nav** — used inside pages when `horizontalNav: true` on the nav section
- Main content area: `flex-1 overflow-y-auto`

Nav sections are defined in `src/routes.tsx` as `NAV: NavSection[]`. To add a new section, add an entry there; the shell picks it up automatically.

## Component Patterns

### Drawer
`src/components/ui/Drawer.tsx` — right-side slide-in panel (480px wide). Used for add/edit forms and detail views. Props: `open`, `onClose`, `title`, `description?`, `children`, `footer?`.

### StatusBadge
`src/components/ui/StatusBadge.tsx` — colored pill with leading dot for booking status.

### Modals
`ConfirmDeleteModal`, `ClearAllotmentModal`, `RestoreDutyModal` — in `src/components/ui/`.
(There is no `ConfirmModal`; earlier versions of this file listed one.)

### Toast
`src/components/ui/Toast.tsx` — feedback toasts.

## File Conventions
```
src/
  pages/<domain>/<PageName>Page.tsx   — route-level page components
  components/ui/<ComponentName>.tsx   — shared UI primitives
  layouts/<LayoutName>.tsx            — shell/layout wrappers
  lib/                                — supabase, types, utilities
  routes.tsx                          — NAV config + route definitions
  styles/
    tokens.css                        — Untitled UI design tokens (primitives + semantics)
    global.css                        — Tailwind import + @theme token registration
```

## Dos and Don'ts
- **Do** use `clsx` for all conditional className logic
- **Do** use `lucide-react` icons with `strokeWidth={1.75}`
- **Do** pull semantic colors from the token system (`text-gray-900`, `border-gray-200`, etc.)
- **Don't** hardcode hex values — use token classes
- **Don't** add a second font — Inter only
- **Don't** create new shadow or spacing values; use the defined scales
