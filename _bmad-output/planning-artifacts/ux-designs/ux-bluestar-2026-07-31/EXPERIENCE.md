---
name: Bluestar
description: Information architecture, behavior, states and journeys for the Bluestar fleet management platform.
status: final
updated: 2026-07-31
design: ./DESIGN.md
sources:
  - ../../ux-backlog.md
---

# Bluestar — Experience Spine

> Brownfield. Existing single-tenant fleet platform being converted to
> multi-tenant. Written from the multi-tenancy build outward — the surfaces it
> introduces, and the state patterns its introduction makes mandatory.

## Foundation

Desktop-first responsive web. React 19 + TypeScript + Tailwind CSS v4 on Vite,
React Router v7, Supabase for data and auth. **Untitled UI** is the design
system; `DESIGN.md` is the visual identity reference.

**Multi-tenant.** A parent company (Bluestar Co.) contains several operating
companies. Every operational record belongs to exactly one company; customers
are the single shared exception. Tenant isolation is enforced in Postgres via
row-level security rather than in application code.

Two roles, both global to a person rather than per company:

| Role | Can |
|---|---|
| **Owner** | Create companies, change roles, manage all members. Sees every company **in the Companies management list**; reaching its operational data still requires membership. |
| **Admin** | Everything operational within companies they belong to, plus managing members who share those companies |

**Management visibility and data access are separate.** An Owner can see and
edit every company's record in Settings without being able to read its bookings,
duties or payroll. Only membership grants operational data, for every role
without exception. Creating a company grants that membership automatically — see
Multi-Tenancy Rule 8.

> Implementation delta: `TeamRole` in `src/pages/settings/SettingsPage.tsx`
> currently declares four roles (Owner, Admin, Manager, Staff). Manager and Staff
> are cut. The type and its `CHECK` constraint narrow to two.

No mobile app. Hassel works at a laptop; nothing here is designed for a phone in
a yard.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Login | Unauthenticated visit | Email + password |
| Set password | Invite email link | Accept an invite, choose a password |
| Reset password | Login → "Forgot password?" | Request and complete a reset |
| Company chooser | First sign-in only | Pick a starting company, once |
| Bookings → All bookings | Rail | Booking records for the active company |
| Bookings → All duties | Rail | The daily work surface — Hassel lives here |
| Database | Rail | Drivers, vehicles, groups, duty types, taxes, bank accounts |
| Availability | Rail | Which vehicles are free in a window |
| Billing | Rail | Invoices, receipts |
| Attendance & Payroll | Rail | Driver attendance, payroll runs |
| Vehicle Tracker | Rail | Expense, fuel, loans, average |
| Settings → Account | Rail footer | Your own profile, sign out |
| Settings → Team members | Rail footer | People and their company access |
| Settings → Companies | Rail footer | Create and edit companies. **Owner-only — the whole surface, list included**, not merely the create action |
| Company switcher | Rail badge | Shows active company; switches between them |

**No dashboard, and none is planned.** Hassel's morning scan — "how many duties
in each company" — is answered by the switcher popover, not an overview screen
(DEC-3).

**No cross-company view.** Rollup mode was cut (DEC-6). Exactly one company is
active at any moment; no surface ever shows data from more than one.

→ Visual reference: [`mockups/key-shell-switcher.html`](mockups/key-shell-switcher.html)
(shell, rail badge, switcher popover open over All Duties) ·
[`mockups/key-auth.html`](mockups/key-auth.html) (login with invalid credentials,
first-run company chooser). **The spines win on conflict with any mock.**

## Voice and Tone

Microcopy. Brand posture lives in `DESIGN.md.Brand & Style`.

Bluestar talks to someone mid-task who did not open this app for pleasure. State
the fact, name the scope, offer the action. No exclamation marks, no
encouragement, no apology theatre.

| Do | Don't |
|---|---|
| "No duties in Bluestar North for today." | "Nothing here yet!" |
| "Couldn't load duties. Something went wrong on our end." | "Oops! Something went wrong 😕" |
| "Your data is safe." | *(silence about whether data was lost)* |
| "Send this to Yash if it keeps happening." | "Please contact your administrator." |
| "That email and password don't match." | "Invalid credentials." |
| "Which company are you working in?" | "Let's get you set up!" |

Always name the company when naming a scope. "No duties today" is ambiguous
across three companies; "No duties in Bluestar North for today" is not.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Company badge | Rail, always visible | Shows the active company's **short code**. Click opens the switcher popover. **Rendered even when the user belongs to only one company** — it is a scope label first and a switcher second. This resolves the "control appears from nowhere" problem: nothing new materialises when a second company is added, the popover simply gains a row. |
| Company switcher popover | From the badge | One row per company the user belongs to: short code, name, total duty count. Active row carries a leading dot. Selecting a row changes the active company and refetches the current surface. Portal-rendered. Keyboard-navigable; returns focus to the badge on close. |
| Company chooser | First sign-in only | Full-screen, same row shape as the popover. Selecting lands the user on All Duties. Never shown again. |
| Skeleton row | Every table | Renders in the table's own column shape while data loads. Layout must not shift when real rows arrive. |
| Error block | Every fetch and save failure | Two tiers: plain headline + retry, and a collapsed **Technical details** disclosure. Default collapsed. |
| Empty state | Every table | Names the active company. Carries the surface's primary action. Never suggests other companies. |
| Member drawer | Settings → Team members | Existing 480px `Drawer`. Name, email, role, company access checklist. Scoping rules are load-bearing — see **Member management rules** below. |
| Company row menu | Settings → Companies | Edit only. **No delete, no archive.** |

### Member management rules

These govern who may grant tenant access. They are a security boundary expressed
as UI, and the UI must not offer what the database will refuse.

→ Visual reference: [`mockups/key-member-drawer.html`](mockups/key-member-drawer.html)
— Owner editing another member, beside the same drawer on your own row where the
checklist is read-only.

1. **Whose rows you see.** Owner sees every member. Admin sees only members who
   share at least one company with them.
2. **Which companies the checklist offers.** Owner sees every company. Admin sees
   **only companies they themselves belong to** — never the full list.
3. **No self-grant.** The company checklist is **read-only on your own row**, for
   every role including Owner. Changing your own tenant access is not something
   the UI can do. The *only* way to gain membership without another person is to
   create a company, which auto-joins you (Multi-Tenancy Rule 8).
4. **Saving applies a delta, never a replacement.** The checklist an Admin sees
   is partial (member rule 2), so a whole-row save would silently revoke memberships the
   editor cannot see. Saving may only add or remove companies **present in the
   editor's own visible set**; every other membership is left untouched. An
   Admin cannot remove a member from a company the Admin does not belong to —
   not deliberately, and not by accident.
5. **Role changes are Owner-only.** The role control is disabled for Admins,
   including on rows they may otherwise edit.
6. **At least one company** must remain ticked before the drawer saves. Validated
   against the member's **total** memberships, not the editor's visible subset —
   otherwise an Admin stranding logic would fire on a member who still has access
   elsewhere, or fail to fire on one who doesn't. Makes zero-access unreachable
   (DEC-17).
7. **The last Owner cannot be demoted or removed.** Blocked with an explanation,
   because the alternative is an account nobody can recover.

## State Patterns

The highest-value section of this spine, and the reason it was written.

`ux-backlog.md` has recorded since 2026-06-09 that the app has no loading
skeletons (line 43) and no error or retry patterns at any Supabase fetch point
(line 44). Multi-tenancy does not create that gap — it weaponises it. **After
tenant isolation, one blank table means four different things:**

| Hassel sees | It actually means |
|---|---|
| Empty duties table | No duties today — a genuinely quiet morning |
| Empty duties table | He is in North; the duty he wants is in East |
| Empty duties table | RLS filtered it, correctly |
| Empty duties table | RLS filtered it, **incorrectly** — a bug |

If the last two are indistinguishable, nobody can debug the permission model —
not Hassel, who concludes the app lost his data, and not Yash, who has nothing to
go on. Naming the company in every empty state is what separates them.

→ Visual reference: [`mockups/key-states.html`](mockups/key-states.html) — cold
load, empty, fetch error with the technical disclosure expanded, and access
revoked mid-session, side by side. The last two are the pair that must never
converge.

| State | Surface | Treatment |
|---|---|---|
| Cold load | Any table | Skeleton rows in the table's column shape. **Every table, not just slow ones.** Never a "Loading…" text line. |
| Background refetch | Any table | Existing rows stay. No skeleton over content. Silent unless it fails. |
| Empty — no data | Any table | "No duties in {company} for today." Primary action for the surface. No cross-company suggestion. |
| Empty — filtered | Table with active search/filters | "No duties match "{query}" in {company}." Offer to clear the filter, not to switch company. |
| Fetch error | Any surface | Error block. "Couldn't load {thing}." Body: "Something went wrong on our end. Your data is safe." Retry. Collapsed **Technical details**: error code, surface, timestamp, active company. |
| Save error | Drawers, forms | `Toast`, error variant. Form state **retained** — never clear a form on failure. Technical disclosure available. |
| Invalid credentials | Login | Inline, above the form: "That email and password don't match." Fields retained, password cleared. **Never reveal whether the email exists.** |
| Permission denied | Any Owner-gated surface | Admins do not see Owner-only controls at all — Companies create, role controls. Where a route is reached directly, an explanatory screen, never a raw error. |
| Session expired | Any surface | Redirect to Login with a line explaining why. Never a silent bounce, never a raw 401. |
| Switching company | Global | Current surface stays mounted and refetches with skeletons. Route does not change. |
| Company changed elsewhere | Every other open tab | See **tab consistency** below. A visible notice plus refetch — never stale data under a new label. |
| Invite link expired | Set password | "This invite has expired. Ask Yash to send a new one." No self-service resend. |
| Access revoked mid-session | Any surface | Hassel's membership is removed while he is working. His next request returns nothing. He must **not** see an empty table implying the company went quiet — he sees an explanatory screen naming what happened and offering the switcher for companies he still holds. If he holds none, the same screen without the switcher. |
| Not signed in | Any route | Redirect to Login, preserving the intended destination for post-login return. |

**Error never renders as empty.** A failed fetch and a genuinely empty result
must not converge on the same screen. Any code path that treats "no rows
returned" as success will surface an outage as "No duties in Bluestar North for
today" — the precise false-negative this whole section exists to prevent, and the
bug class that let a dead Settings page look like an empty one for two months.
Error state takes precedence over empty state, always, and an unresolved fetch is
never treated as an empty one.

**Zero company access is prevented at the drawer, but not everywhere.** Member
rule 6 stops it being *created* by unticking. It remains reachable two other
ways: a member deleted while holding a live session, and a membership revoked
mid-session. Both land on the **Access revoked** row above, which is therefore
a required state, not an optional one. DEC-17 chose prevention over explanation;
prevention turned out to cover the drawer only.

## Interaction Primitives

**Mouse-first.** Hassel is a dispatcher at a laptop, not a keyboard power user.
No vim-style navigation, no command palette — neither was asked for and neither
fits the work.

- Company switching is **two clicks**: badge, then company.
- Row actions live behind a `⋯` menu, portal-rendered.
- Drawers open from the right at 480px and close on `Esc` or backdrop click.
- Destructive actions confirm through `ConfirmDeleteModal`. Companies have no
  destructive action at all.

**Banned:** company colour-coding, ambient company banners, cross-company
navigation suggestions inside empty states, more than one loading pattern,
silent failure of any kind.

## Accessibility Floor

Behavioral. Visual contrast inherits Untitled UI's verified ratios.

- WCAG 2.2 AA. Internal tool, but the floor is not negotiable.
- The active company is conveyed by **text, never colour alone** — the badge
  carries a short code and an accessible label naming the company in full.
- Skeleton rows are `aria-hidden`; the table announces a busy state rather than
  reading placeholder content.
- Error blocks announce via `aria-live="polite"`. The technical disclosure is a
  real keyboard-operable control, not a click-only div.
- `Tab` order matches reading order. `Esc` closes the topmost drawer or popover.
- The switcher popover is fully keyboard-operable and restores focus on close.
- Every form field carries a real `<label>`. Placeholder text is never the only
  label.

## Multi-Tenancy Rules

Product-specific, and load-bearing. Several have implementation consequences.

1. **Exactly one company is active at all times — as a UX invariant.** The user
   is never asked to work "across companies", and there is no "all companies"
   mode. This describes the interface, not the server: Rule 7a can legitimately
   resolve to nothing when membership has been revoked, and that is a valid
   fail-closed state, not a violation of this rule. It surfaces as **Access
   revoked**, never as an empty table.
2. **Every empty state names its company.** The load-bearing rule of the whole
   build; without it, correct and incorrect filtering are indistinguishable.
3. **Switching company never navigates.** The surface stays; the data changes.
4. **Companies cannot be deleted or archived.** The existing hard `DELETE` at
   `src/pages/settings/SettingsPage.tsx:949` is removed as part of this build —
   once companies own bookings, invoices and payroll, it is a financial-records
   wipe two clicks deep. Note the same `ActionsMenu` is shared with the Team
   members tab, so the delete action must be removed per-surface, not globally.
5. **Companies carry a short code.** Two or three characters, author-set at
   creation, unique across companies. The badge displays it. **Do not derive an
   initial** — "Bluestar North", "Bluestar East" and "Bluestar South" all yield
   "B", which conveys nothing and silently defeats the only ambient signal in the
   product. A default may be *suggested* from distinguishing words (BN / BE / BS);
   it must remain editable.
6. **The switcher's count query is exempt from active-company scoping — not from
   tenant scoping.** It reaches across the companies **you are a member of**, and
   no further. The membership predicate lives *inside* the query, never in client
   filtering. It must never return the name, count, or existence of a company the
   requester does not belong to. This applies to Owners identically — the
   Companies *management* list is a separate surface with separate rules
   (Foundation), and does not license an unfiltered read here.
7. **Active company is stored per user, not per tab.** It lives on the profile
   row because RLS must read it server-side. Two consequences, both load-bearing:

   **a. It must be re-verified against membership on every read.** The resolver
   returns the active company **only if the user is currently a member of it**,
   and otherwise resolves to nothing — no data, fail closed. Setting the field is
   not the same as being granted access. `SettingsPage.tsx:243` already
   demonstrates the browser writing directly to this table, so a client that
   writes an arbitrary company id must gain nothing by it. *This restores the
   membership intersection that DEC-6 removed when it collapsed
   `visible_company_ids()` — the simplification was logged as a clean win and was
   not one.*

   **b. Failing closed must not fail silently.** Server-side, (a) is correct: no
   membership, no rows. On the wire that response is **byte-identical to a
   genuinely empty table** — so a revoked user sees "No duties in Bluestar North
   for today" and the security fix reintroduces the exact false-negative Rule 2
   exists to prevent. Membership must therefore be resolved as its **own explicit
   signal**, not inferred from an empty data response. The client asks "am I still
   a member of the active company?" and renders the Access-revoked state on a
   negative answer — it never reasons backwards from row count. Without this the
   Access-revoked state in State Patterns is unbuildable.

   **c. Two tabs cannot hold different companies.** Unavoidable given (a); see
   tab consistency below.
8. **Creating a company auto-joins its creator.** Membership is granted in the
   same transaction that creates the company. This is the single exception to
   "nobody grants themselves access", and it is deliberately the narrowest one:
   it applies only at creation, only to the creator, and only to the company just
   created. Without it, member rule 3 plus Multi-Tenancy Rule 4 deadlock — an
   Owner could create a company and never enter it.

   **Only Owners may create companies.** The Companies surface is Owner-gated;
   an Admin never reaches it, so auto-join is not an escalation path. Stated here
   because this rule grants membership, and a developer implementing the
   Companies surface must not have to infer the gate from elsewhere.
9. **Company names must be unique**, not just short codes. Empty states quote
    the company *name* ("No duties in Bluestar North for today"), so two
    companies sharing a name would make the load-bearing disambiguation rule
    ambiguous — the exact failure Multi-Tenancy Rule 2 exists to prevent.
10. **Switching company must retrigger every fetch on the current surface.**
   Reads are RLS-scoped automatically, but *re-fetching* is a client concern.
   Existing effects key on filters only — `AllDutiesPage.tsx:317` has deps
   `[statusFilter, search, dateRange]` — so without adding the active company to
   those dependencies, a switch leaves the previous company's rows on screen
   under the new company's label. **This is the single most dangerous failure
   mode in the build**, and it means "existing query sites are untouched" is true
   of RLS scoping but false of fetch dependencies.

### Must be removed before any of this holds

Two existing behaviours in `src/pages/settings/SettingsPage.tsx` defeat the rules
above regardless of how carefully the new surfaces are built:

- **Line 216 — the browser self-provisions an Owner.** When no profile row
  exists, the client inserts one with `access_type: 'Owner'`. Rule 3 closes
  self-grant on the checklist; this is an Owner factory one table over, reachable
  by anyone who can reach the app. It must not survive the auth build.
- **Line 243 — the client updates the profile row directly.** Harmless today.
  Once `active_company_id` lives on that row it becomes the write path Rule 7a
  exists to neutralise, which is why 7a is stated as a server-side re-verification
  rather than a client-side discipline.
- **Lines 206–212 — the Account tab loads the first profile row by id.**
  `.order('id').limit(1)` returns the same row to every user. Under Rule 7 that
  means **every user would share one `active_company_id`** — one person switching
  company would move everyone. The Account tab must load the row matching the
  authenticated user, not the first one in the table.

**The first Owner must be seeded server-side.** Removing line 216 deletes the
only mechanism that creates an Owner, while Rule 8 requires an Owner to exist
before any company can be made. Left unaddressed, the bootstrap deadlock simply
moves: no Owner, therefore no company, therefore no membership, therefore nobody
can use the product. The initial Owner is created during deployment — a migration
or an equivalent server-side step — and never by the browser. **Seed two**, since
only an Owner can promote an Owner and a single lost login is unrecoverable.

### Tab consistency

Because rule 7 makes the active company global to the user, switching in one tab
silently re-scopes every other open tab. Hassel leaves tabs open. Untreated, this
delivers H-1's hypothesised wrong-company failure **deterministically** rather
than hypothetically.

Required behaviour: when the active company changes, every other open tab shows a
visible notice — "Switched to Bluestar South in another tab" — and refetches.
Stale rows are never left on screen under a different company's label. The notice
is informational, not a prompt; there is nothing to decide.

### Watch item

**H-1 — wrong-company writes.** Hassel switches fast and writes immediately. The
hypothesis that this causes mis-scoped records is unvalidated and deliberately
not designed for (DEC-5). Signals that would confirm it: records created then
deleted and re-created elsewhere; "where did that booking go?"; any manual data
move between companies. If any appear, revisit ambient identity — three candidate
mechanisms are preserved in `.decision-log.md`.

## Key Flows

### Flow 1 — Hassel's morning (Hassel, Admin, three companies, 8:05am)

1. Hassel opens his laptop and signs in.
2. He lands on All Duties in Bluestar North — where he left off yesterday.
   Skeleton rows resolve into twelve duties.
3. He clicks the badge, which reads **BN**. The popover shows all three companies
   with counts: North 12, East 8, South 15. **His entire morning scan is one
   click.**
4. South has fifteen and a driver called in sick overnight. He picks South; the
   duties table stays put and refetches beneath him. The badge now reads **BS**.
5. He works the list — allotting vehicles and drivers to unalloted duties, fixing
   a timing that moved, opening the allot drawer twice.
6. **Climax:** the sick driver's three duties were already allotted to him. Hassel
   reassigns each and the table reflows. He never left the duties surface and
   never wondered which company he was in — the badge read BS throughout. The
   phone rings; he takes a new booking and creates it in South, where he already
   is.

Failure: a save fails mid-reassignment → error `Toast`, drawer stays open with
his input intact, retry available. He retypes nothing.

### Flow 2 — Hassel accepts an invite (Hassel, newly invited, 8:40am)

1. Hassel receives an email: Yash has invited him to Bluestar.
2. He follows the link to **Set password**, chooses one, and is signed in.
3. **The company chooser appears.** "Welcome, Hassel. Which company are you
   working in?" — three rows, each with a short code and duty count.
4. **Climax:** this screen is the only time Bluestar tells him more than one
   company exists. He picks North, lands on All Duties, and the badge reads BN —
   the same short code he just clicked. When he wants East later he already knows
   where to look. The chooser never appears again.

Failure: the link has expired → "This invite has expired. Ask Yash to send a new
one." No self-service resend; Yash reissues from the member drawer.

### Flow 3 — Yash opens a company (Yash, Owner, 11pm, twice a year)

1. The business opens a fourth operating company. Yash signs in — he has not
   opened Settings in five months and remembers none of it.
2. Settings → Companies. The button says **Add company**, not a `+` icon. He
   fills in name, short code, phone, GSTIN, duty slip terms, signature.
3. Settings → Team members. He opens Hassel's row; the drawer shows name, email,
   role, and a checklist with three of four companies ticked.
4. **Climax:** he ticks the fourth. That is the whole operation — one checkbox,
   in the same drawer holding everything else about Hassel, with no matrix to
   decode and no separate access screen to find.

Failure: he tries to demote himself while sole Owner → blocked with an
explanation.

### Flow 4 — Hassel forgets his password (Hassel, 7:55am, phone already ringing)

1. Hassel mistypes his password twice. Inline: "That email and password don't
   match." The email stays; the password field clears.
2. He clicks **Forgot password?**, enters his email, and gets a confirmation that
   does not reveal whether the account exists.
3. The reset email arrives; he sets a new password and is signed in.
4. **Climax:** he lands on All Duties in the company he was last working in, not
   the chooser — because the chooser is a first-sign-in surface, not a
   first-session-of-the-day surface. Four minutes lost, no state lost, and the
   phone is still ringing.

Failure: the reset link has expired → the same expiry treatment as an invite,
with a path back to request another.
