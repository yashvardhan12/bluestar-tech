# Blue Star — Fleet Management Platform

## Stack
- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/vite`) — configured via `@theme` in `src/styles/global.css`
- **React Router v7** (`react-router-dom`)
- **Supabase** — client in `src/lib/supabase.ts`. Note it is `createClient<any>`:
  `src/lib/database.types.ts` exists but is **not wired to the client**, so queries
  are unchecked. A wrong column name fails at runtime, not compile time.
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

Sections with sub-navigation get their own layout wrapper alongside `AppShell`:
`BillingLayout`, `DatabaseLayout`, `DriverAttendanceLayout`, `VehicleTrackerLayout`.

## Multi-tenancy

Every domain table is scoped to a company, and **scoping is enforced by Postgres
RLS, not by the client**. Policies are `company_id = current_company_id()`, which
resolves the signed-in user's `profiles.active_company_id`.

- **Do not add `.eq('company_id', …)` to queries** — RLS already filters, and the
  column is not on every table (`duties` is scoped indirectly through its booking).
- **Do not set `company_id` on insert** — it is defaulted and immutable.
- `useAuth()` (`src/lib/auth.tsx`) gives `session`, `profile`, `loading`, `signOut`.
- `useActiveCompany()` (`src/lib/useActiveCompany.ts`) gives the company *row* when
  you need its name, GSTIN or address — `profile` carries only the id.
- A user with no `company_members` row sees **zero rows everywhere**, not an error.

## Component Patterns

**Check this list before building a form control — all of these already exist.**

### Drawer
`src/components/ui/Drawer.tsx` — right-side slide-in panel. Used for add/edit forms and detail views.
Props: `open`, `onClose`, `title`, `description?`, `children`, `footer?`, `width?`
(`width` is a Tailwind class, defaulting to `w-[480px]` — pass it for wider panels).

### Field
`src/components/ui/Field.tsx` — the label + required marker + error wrapper for every
form input. Props: `label`, `required?`, `children`, `error?`. Consolidated from four
duplicates in `cc97427` — do not write another one.

### FileUpload
`src/components/ui/FileUpload.tsx` — upload to the private `documents` bucket.
Props: `label`, `storagePath?`, `existingUrl?`, `disabled?`, `onChange?`.

### DateRangePicker
`src/components/ui/DateRangePicker.tsx` — range calendar. Exports the `DateRange`
(`{ start, end }`) type. Props: `value?`, `onChange`, `placeholder?`, `className?`.

### StatusBadge
`src/components/ui/StatusBadge.tsx` — colored pill with leading dot for booking status.

### Modals
`ConfirmDeleteModal`, `ClearAllotmentModal`, `RestoreDutyModal` — in `src/components/ui/`.
(There is no `ConfirmModal`; earlier versions of this file listed one.)

### Toast
`src/components/ui/Toast.tsx` — feedback toasts.

### CompanySwitcher
`src/components/CompanySwitcher.tsx` — active-company dropdown in the shell.
Note the path: it is in `components/`, not `components/ui/`.

## File Conventions
```
src/
  pages/<domain>/<PageName>Page.tsx   — route-level page components
                                        (auth, availability, billing, bookings,
                                         database, driver-ops, settings,
                                         vehicle-expenses)
  components/ui/<ComponentName>.tsx   — shared UI primitives
  layouts/<LayoutName>.tsx            — AppShell + per-section layouts
  lib/                                — supabase, auth, utilities
  lib/*.check.ts                      — self-checks; no test framework is installed
  routes.tsx                          — NAV config + route definitions
  styles/
    tokens.css                        — Untitled UI design tokens (primitives + semantics)
    global.css                        — Tailwind import + @theme token registration
```

Non-trivial logic leaves one runnable check beside it, e.g.
`node --experimental-strip-types src/lib/invoice.check.ts`. These files are excluded
from `tsconfig.app.json` and must stay excluded — they import `node:` builtins.

## Dos and Don'ts
- **Do** use `clsx` for all conditional className logic
- **Do** use `lucide-react` icons with `strokeWidth={1.75}`
- **Do** pull semantic colors from the token system (`text-gray-900`, `border-gray-200`, etc.)
- **Do** reuse the primitives in Component Patterns instead of rebuilding them
- **Don't** hardcode hex values — use token classes
- **Don't** add a second font — Inter only
- **Don't** create new shadow or spacing values; use the defined scales
- **Don't** use `enum` — `erasableSyntaxOnly` is on; use union string types
- **Don't** trust `supabase/migrations/` as a description of the database; it drifts
  from production. Verify against the live schema.

## Deeper context

`_bmad-output/project-context.md` carries the verified production schema facts,
the auth/Supabase landmines, and the billing rules. Read it before working on
tenancy, invoicing or anything touching the database.
