---
project_name: 'bluestar'
user_name: 'Yash'
date: '2026-08-04'
sections_completed:
  [
    'technology_stack',
    'language_rules',
    'framework_rules',
    'testing_rules',
    'code_quality_rules',
    'workflow_rules',
    'critical_rules',
  ]
existing_patterns_found: 14
status: 'complete'
rule_count: 41
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

Blue Star is a multi-tenant fleet management platform for Indian car-rental operators: bookings → duties → allotment → invoicing, plus driver payroll and vehicle expenses.

---

## Technology Stack & Versions

**Build & language**

| Package | Version | Note |
|---|---|---|
| `vite` | ^8.0.1 | `npm run dev` / `npm run build` (`tsc -b && vite build`) |
| `typescript` | ~5.9.3 | `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` |
| `@vitejs/plugin-react` | ^6.0.1 | |
| `eslint` | ^9.39.4 | flat config + `typescript-eslint`, react-hooks, react-refresh |

**Runtime**

| Package | Version | Note |
|---|---|---|
| `react` / `react-dom` | ^19.2.4 | |
| `react-router-dom` | ^7.13.2 | routes **and** `NAV` config both in `src/routes.tsx` |
| `@supabase/supabase-js` | ^2.100.0 | project ref `pmuppvvhcafrgfysubtc` (ap-northeast-2) |
| `tailwindcss` / `@tailwindcss/vite` | ^4.2.2 | v4 — `@theme` in `src/styles/global.css`, **no** `tailwind.config.js` |
| `lucide-react` | ^1.0.1 | |
| `clsx` | ^2.1.1 | |

**Notable absences — do not add these without being asked**

- **No test framework.** Not vitest, not jest. Verification is `src/lib/*.check.ts` — plain `node:assert` scripts.
- **No data-fetching library.** No react-query, no SWR. `useEffect` + `useState`.
- **No state manager.** No redux, no zustand. Context (`src/lib/auth.tsx`) is the only global store.
- **No form library.** Plain controlled inputs.
- **No PWA plugin.** Relevant if the driver app gets built.

---

## Critical Implementation Rules

### Language-Specific Rules

- `verbatimModuleSyntax: true` — type imports **must** be `import type { … }`. A plain import of a type fails the build.
- `allowImportingTsExtensions: true` — modules imported by a `*.check.ts` need explicit `.ts` extensions so node can run them directly (`src/lib/invoice.ts` imports `./money.ts`).
- `erasableSyntaxOnly: true` — **no** `enum`, no constructor parameter properties, no `namespace`. Use union string types (see `DutyStatus` in `src/lib/bookingStatus.ts`).
- `noUnusedLocals` / `noUnusedParameters` — an unused variable fails `npm run build`, which fails the Vercel deploy.
- **Supabase errors are returned, not thrown.** Always destructure and handle:
  ```ts
  const { data, error } = await supabase.from('x').select()
  if (error) { console.error('[scope]', error.message); return }
  ```
  Silent failure has shipped a bug here before (`d47d8fc`).
- **DB is snake_case, TS is camelCase.** Mapping is hand-written at the query boundary — see `loadProfile` in `src/lib/auth.tsx`. There is no ORM and no codegen in the loop.

### Framework-Specific Rules

- **Data fetching pattern:** `useEffect` + `useState`, with a `cancelled` flag in the cleanup to drop late responses. Canonical example: `src/lib/useActiveCompany.ts`.
- **`onAuthStateChange` callback must stay synchronous.** It runs *inside* the Supabase auth lock — awaiting any Supabase call there deadlocks the sign-in that emitted the event. Defer work with `setTimeout(…, 0)`.
- **`getSession()` needs its timeout.** It waits on a Web Lock with no deadline; a stale tab holding it hangs the app on the loading screen forever. The 5s `Promise.race` in `src/lib/auth.tsx` is load-bearing.
- **Routes and navigation are one file.** Add a section to `NAV` in `src/routes.tsx` and `AppShell` picks it up — do not edit the shell.
- **Add/edit forms go in a `Drawer`** (`src/components/ui/Drawer.tsx`, 480px right-side panel), not a modal. Modals are for confirmation only.
- Row action menus **must** render in a portal or they get clipped by table overflow (`76e879c`).

### Testing Rules

- **No test framework is installed and none is being added.**
- Non-trivial logic leaves one runnable self-check: `src/lib/<module>.check.ts`, using `node:assert/strict`, exiting non-zero on the first failure.
  ```
  node --experimental-strip-types src/lib/invoice.check.ts
  ```
- `*.check.ts` files **must stay in `tsconfig.app.json`'s `exclude`** — they import `node:` builtins that the browser type space has no declarations for.
- The money/invoice path is the one area where a check is mandatory, not optional.

### Code Quality & Style Rules

- **Never hardcode hex.** All colour comes from tokens in `src/styles/tokens.css`, registered into `@theme` in `global.css`. Use `text-gray-700`, `bg-violet-600`, `border-gray-200`.
- **The accent is `violet-600`, not `brand-*`.** violet is used ~316 times across 33 files; `brand-*` has zero usages outside token definitions. Do not "correct" this.
- **Spacing uses Tailwind's numeric scale only** (`p-4`, `gap-6`). The Untitled UI named scale is deliberately *not* registered in `@theme` — registering `--spacing-sm` made `.max-w-sm` resolve to `max-width: 6px` (`9adea26`). Do not register it.
- Icons: `lucide-react` with `strokeWidth={1.75}`, always.
- Conditional classes: `clsx`, always.
- File naming: `src/pages/<domain>/<Name>Page.tsx`, `src/components/ui/<Name>.tsx`, `src/layouts/<Name>.tsx`.
- **Comments explain *why*, and what they replaced.** See `src/lib/money.ts` (consolidated four incompatible `formatINR`s) and `src/lib/auth.tsx` (why the profile query is not `.limit(1)`).
- **`ponytail:` comments mark deliberate simplifications with a known ceiling.** They are intent, not oversight — do not "fix" them without being asked.

### Development Workflow Rules

- **Conventional Commits with a scope:** `feat(tenancy):`, `fix(auth):`, `docs(ux):`, `refactor:`. Subject in lowercase, imperative, describes the effect not the file list.
- Branches: `feat/<topic>` off `main`. Current work is on `feat/multi-tenancy`.
- **`scripts/` is gitignored because it contains credentials.** It holds `SUPABASE_SERVICE_ROLE_KEY`-using migration and storage scripts. Never commit it, and never move that code into `src/`.
- `.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (both public by design, shipped to the browser) and `SUPABASE_SERVICE_ROLE_KEY` (**must never reach `src/`** — it bypasses all RLS).
- Deploys go to Vercel. `vercel.json`'s SPA rewrite is required or deep-route refreshes 404 (`7d2a7e1`).
- Build is `tsc -b && vite build` — a type error blocks the deploy, so run `npm run build` before pushing.

### Critical Don't-Miss Rules

**Database — verified against production, not the migration files**

1. **`supabase/migrations/` drifts from the live database.** Query the real schema before building on it; do not trust the SQL files as a description of production.
2. **`duties` has no `company_id`.** It is tenant-scoped indirectly, via `booking_id → bookings.company_id`. Its RLS policy is `booking_id IN (SELECT id FROM bookings)`, which inherits the bookings policy. Every tenancy assumption about duties routes through the parent booking — including `my_companies()`'s duty count.
3. **`profiles.role` CHECK allows only `'Owner'` and `'Admin'`.** Adding any other role (e.g. `'Driver'`) requires altering the constraint *and* auditing `is_owner()`, `guard_role_change()`, `guard_last_owner()`, and `set_member_role()`.
4. **`drivers` have no link to `auth.users`.** They are records, not accounts — only `phone`, `email`, `driver_id` text. There is no driver-facing authentication today.
5. **All tenant RLS is `company_id = current_company_id()`**, which reads `profiles.active_company_id` gated on a `company_members` row. A signed-in user with no `company_members` row sees **nothing** — every policy silently returns zero rows rather than erroring.
6. **`createClient<any>`** — `src/lib/database.types.ts` exists but is *not* wired to the client. Queries are entirely unchecked; a typo in a column name fails at runtime, not compile time.

**Money and billing**

7. **`invoice.ts` sums `duties.base_rate` and nothing else.** The `duty_types` rate card (`threshold_km`, `rate_per_km`, `rate_0_6_hrs`, `night_charges`, `daily_outstation_charges`) is **dead at invoice time**, because no actual km or hours run are recorded anywhere. Extras are entered manually as custom rows.
8. **All money passes through `round2()`** from `src/lib/money.ts`. Float arithmetic on currency drifts. Display uses `formatINR` — never raw `toLocaleString`.
9. Invoice numbers are assigned by a DB trigger (`assign_invoice_number`) per company per financial year. Never construct one client-side; use `peek_next_invoice_number()` to preview.

**Status automation**

10. **Booking and duty status is machine-derived, not user-set.** `src/lib/bookingStatus.ts` computes it from wall-clock time and `vehicle_id`. `Billed` and `Cancelled` are protected and never touched by automation. Any feature that records *real* start/end events must make these functions defer to the observed timestamps rather than continuing to guess from the clock.
11. Valid values are fixed by CHECK constraints — bookings: `Booked / Confirmed / Allotted / Partially Allotted / On-Going / Completed / Billed / Cancelled`; duties: the same minus `Confirmed` and `Partially Allotted`.

---

## Usage Guidelines

**For AI agents**

- Read this file before implementing any code.
- Follow all rules exactly as documented; when in doubt, prefer the more restrictive option.
- The "Critical Don't-Miss Rules" section describes **production**, not `supabase/migrations/`. Verify live schema before extending it.
- `CLAUDE.md` is auto-loaded and covers the design system. Where the two disagree, this file wins — it was derived from `src/` and the live database.

**For humans**

- Keep it lean; this file is read on every agent invocation.
- Update when the stack changes, when a rule stops being true, or when a bug turns out to have been caused by an undocumented assumption.
- Delete rules that become obvious. A rule nobody would get wrong is wasted context.

Last Updated: 2026-08-04
