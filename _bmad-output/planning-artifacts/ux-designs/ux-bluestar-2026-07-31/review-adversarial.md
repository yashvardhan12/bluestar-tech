# Adversarial Review — Bluestar multi-tenancy spines

_Reviewed 2026-08-03 against DESIGN.md, EXPERIENCE.md, .decision-log.md, and the working tree at `76e879c`._

## Verdict

The state-pattern work is good and the switcher-as-dashboard move is genuinely clever, but the spines do not encode a security boundary — they describe a UI that sits beside one and quietly hands out the credential it enforces. The member drawer's company checklist lets any Admin grant themselves any company, which makes RLS decorative; Rule 7 is written loosely enough that the obvious implementation leaks every company's name and duty volume to a user who belongs to one; and nothing anywhere says where the active company id lives or that it must be re-verified against membership server-side. Separately, DESIGN.md's central claim about the codebase is simply wrong: `brand-*` has zero usages in `src/`, `violet-*` has 172 across 33 files, and the spine scopes that as a two-row table about one page.

## Findings

### critical — The member drawer is a self-service privilege escalation across tenants (EXPERIENCE.md §Component Patterns L98, §Multi-Tenancy role table L33-36, DEC-15)

The role table grants Admin "everything else, within companies they belong to — including member management". Component Patterns puts the **company access checklist** inside the member drawer. Nothing in either spine scopes the checklist to the actor's own memberships, scopes the Team members list to co-members, or forbids an Admin from opening their own row.

So: an Admin in Bluestar North opens Settings → Team members, opens their own row, ticks East and South, saves. They now belong to all three. RLS is untouched and irrelevant — it enforces membership, and the UI just issued one. The boundary is bypassed in two clicks by the exact surface DEC-15 designed, with no error, no confirmation, no audit trail.

DEC-15's rationale ("Yash visits rarely and thinks person-first") is about Yash, an Owner. It was never re-examined for the Admin case, and "within companies they belong to" is doing load-bearing work in a table cell while the drawer that implements it has no such scoping.

Fix: the checklist renders only companies the actor belongs to (Owner sees all); an Admin cannot edit their own memberships or role at all; the Team members list is filtered to people who share at least one company with the actor. All three need to be spine rules, not implementation notes, because a developer reading Component Patterns today will build the unscoped version.

### critical — Rule 7 is written so that the correct-by-the-letter implementation leaks (EXPERIENCE.md §Multi-Tenancy Rules 7, L195-198; DEC-10 implementation note)

Rule 7 says the duty counts are "the one query that crosses companies… The counts cannot be [scoped by RLS], by definition. This is the single exception."

Three problems, compounding:

1. **"Crosses companies" ≠ "crosses the user's companies."** The rule never states the membership predicate must live *inside* the exempted query. A developer given "an aggregate exempt from RLS" writes a `SECURITY DEFINER` function returning `(company_id, name, duty_count)` for all companies and filters in the UI. The response payload then contains the name and operational volume of every company in the parent org, for a user who belongs to one. A user must not learn anything about a company they don't belong to; this leaks existence, name, and business size.
2. **"Cannot be scoped by RLS, by definition" is false**, and the falsehood is what licenses the leak. The counts can be scoped by RLS perfectly well — to the set of companies the user is a member of. It is only the *active-company* predicate that must be relaxed. Saying "cannot be scoped" tells the implementer to turn the policy off rather than to narrow it.
3. **The Owner case actively pushes toward the leak.** The role table says Owner "see all companies"; Component Patterns says the popover "lists every company the user belongs to". One `SECURITY DEFINER` function that satisfies the Owner ("return everything") automatically breaks the Admin. The two rules together make the leaking version the one that passes both readings.

Fix: rewrite Rule 7 to specify the exemption precisely — the function relaxes only the active-company predicate, must itself filter to `company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid())` for non-Owners, and must never return a row the caller could not otherwise reach. Add "the client never filters this result; if a row arrives, the user is entitled to it."

### critical — Nobody specified where the active company id lives, or that it must be re-verified (DEC-6 downstream simplifications, EXPERIENCE.md Rule 1 + Rule 4)

DEC-6 records the simplification plainly: `visible_company_ids()` collapses to `company_id = current_company_id()`. Before, the predicate derived from memberships — server-side truth. After, it is a single value that must come from somewhere, and no spine, decision, or note says where. The candidates are a JWT claim, a `set_config` on the request, a column on the user row, or client state. Three of those four are client-influenced.

If `current_company_id()` reads anything the client supplies without an accompanying membership check, then any authenticated user reads and writes any tenant's data by setting one value. That is the entire boundary, gone, and it arrived as a consequence of a decision recorded as a *simplification* with a bulleted list of things it made easier.

The multi-tab variant is worse because it needs no malice. `src/lib/supabase.ts` creates the client with defaults, meaning `persistSession: true` and localStorage — shared across tabs. If active company is stored the same way (the obvious choice), Hassel switching to South in tab A silently re-scopes tab B, which still shows the North badge. His next write in tab B lands in South. That is H-1's hypothesis arriving deterministically through a mechanism nobody hypothesised.

Fix: name the storage location in the spine, require the membership re-check in the same breath, and decide tab scope explicitly (`sessionStorage` per tab, or a visible reconcile on focus). This is not an implementation detail; the UX rule "switching is a data event, not a navigation event" is what makes the tab divergence invisible.

### critical — DESIGN.md's brand claim is false about this codebase, and the cleanup is mis-scoped by ~30x (DESIGN.md §Colors L96-107)

DESIGN.md: "Two rules, both currently violated in `src/pages/settings/SettingsPage.tsx`. That page uses all four."

Measured in `src/`:

- `brand-*` in `.tsx`: **0 occurrences.** The tokens exist in `global.css:36-43` and are used nowhere.
- `violet-*` in `.tsx`: **172 occurrences across 33 files** outside SettingsPage — including `AppShell.tsx:69-72` (the rail avatar the company badge will sit next to), `Toast.tsx`, `ConfirmDeleteModal.tsx`, `DateRangePicker.tsx`, `Field.tsx`, `FileUpload.tsx`, all four layouts, and every operational page.

`violet-600` is not "a de-facto primary on one page". It is the product's actual primary, everywhere, and `brand-600` is aspirational. The consequence: every new multi-tenancy surface built to this spine — login card, company chooser, switcher popover, badge, error blocks, skeletons — will be the only `brand-600` surfaces in a violet app. Flow 2 makes the login page the first thing Hassel sees every morning; it will not match the app behind it. And the intake note "a token cleanup is already scheduled in the same implementation pass" is sized against the two-row table, not against 33 files.

Fix: either state the real scope (33 files, app-wide reskin, its own workstream) or accept `violet-*` as the brand and re-point the tokens. Do not ship new surfaces in a colour nothing else uses.

### high — Rule 7's "single exception" is wrong three times over (EXPERIENCE.md L195-198, §Foundation L27-28, IA table L55)

Three cross-company reads exist besides the counts, and two are broader:

1. **The member drawer checklist** must list every company that exists in order to be tickable. It leaks the full company roster, by name, to any Admin.
2. **Settings → Companies** is listed in the IA with no role restriction. Today `SettingsPage.tsx:1050-1053` renders all three tabs unconditionally and `CompaniesTab` selects `*` from `companies` — name, phone, email, GSTIN, CIN, service tax number. An Admin in one company reads every company's tax registration.
3. **Customers** are declared globally shared (see next finding).

Rule 7 as written tells the implementer that everything except the counts is safely handled by RLS. Two of the three above are Settings surfaces the spine itself introduces or inherits, and neither carries a role gate anywhere in either document.

### high — The "customers are the single shared exception" exemption was never decided (EXPERIENCE.md §Foundation L27-28)

"Every operational record belongs to exactly one company; customers are the single shared exception."

`grep -i customer` across `.decision-log.md` returns one hit, and it is inside DEC-4's narration of Hassel's morning ("customer moved a booking"). There is no DEC for this. It appeared at distillation, in a subordinate clause, with no rationale, no consequence analysis, and no acknowledgement that a shared customer table tells every user which clients every sibling company works with — arguably the most commercially sensitive data in a fleet business.

It may well be the right call (one customer, several companies, one record). But it is the single largest hole in the isolation model and it is currently a clause, not a decision. Fix: make it a DEC, state what is shared (identity only? pricing? contracts? default discounts — `CustomersPage.tsx:31` carries `defaultDiscount`), and state what is not.

### high — DEC-17's residual note is false; zero-access is reachable through the UI (DEC-17 [NOTE FOR UX], EXPERIENCE.md L134-137, `SettingsPage.tsx:574`)

DEC-17: "The bad state is unreachable through the UI… zero-access remains reachable by direct database manipulation."

`SettingsPage.tsx:573-577` hard-deletes a team member via the shared `ActionsMenu` Delete item, behind `ConfirmDeleteModal` at 662-666. The spine removes the *company* delete (Rule 5) and says nothing about the member delete. If deleting a member row does not also delete or disable the Supabase auth user, the deleted person still has a valid session and valid credentials and lands in exactly the zero-membership shell DEC-17 declared unreachable — reached by one menu item, in the UI, not by DB manipulation.

The drawer-level "at least one company ticked" rule guards saves. It does not guard deletes, and DEC-17 never noticed the delete path exists on the same rows.

Fix: state what member deletion does to the auth user. Either it is a full deactivation (session revoked, sign-in blocked) or the zero-access state must be built after all.

### high — Access revoked mid-session is unhandled, and Rule 3 specifically fails to cover it (EXPERIENCE.md §State Patterns L121-131, Rule 3)

The state table handles "session expired" and "not signed in". It does not handle "your session is fine but your membership is gone" — the case where Yash removes Hassel from South at 11pm and Hassel's overnight tab refetches at 8am.

What Hassel sees: the badge still says South, and the duties table renders the empty state — "No duties in Bluestar South for today." Rule 3 claims naming the company is what separates correct filtering from incorrect filtering. For this case it does the opposite: it confidently asserts a scope the user no longer has, and Hassel spends his morning believing South had a quiet day. Any write he attempts then fails on RLS with whatever the generic save-error toast says.

Supabase JWTs are valid for their full TTL regardless of membership changes, so this is not exotic — it is the normal consequence of any revocation.

Fix: add a state row. On a query returning a permission error, or on active-company-not-in-memberships, force a re-resolve: drop to the chooser with "Your access to Bluestar South was removed. Pick a company." Also add the equivalent for "your last company was removed" now that the zero-access state is reachable (previous finding).

### high — "Switching never navigates" and "143 query sites untouched" cannot both be true (EXPERIENCE.md Rule 4 + §State Patterns L130; DEC-10 note; intake L36-37)

Verified against the code. `AllDutiesPage.tsx:293-314` fetches through `fetchInitial`, a `useCallback` with deps `[statusFilter, search, dateRange]` and `// eslint-disable-next-line react-hooks/exhaustive-deps` above it, driven by `useEffect(() => { fetchInitial() }, [fetchInitial])` at :341. There are 146 `.from('` call sites across 25 files, matching the intake's "~143".

RLS changes what those queries *return*. It does not make React re-run them. So "the current surface stays mounted and refetches with skeletons" requires one of:

- **(a)** adding `activeCompanyId` to the dependency array of every fetch callback — touching all ~146 sites, which is precisely what the intake and Rule 7 claim the RLS approach avoids; or
- **(b)** remounting the subtree with `key={activeCompanyId}`, which resets local state — `statusFilter`, `search`, `dateRange`, `offsetRef`, scroll position, any open drawer — and contradicts "stays mounted".

Rule 7 calls the counts "the single exception to 'existing query sites are untouched'". It is not; the refetch requirement is a second and much larger one. The spine asserts both halves and never notices they collide.

Fix: pick (b) and say so, accepting that filters reset on switch (arguably correct — a North date filter is meaningless in South), or scope the real cost of (a). Either way, say which, because the two produce visibly different products.

### high — The role model in the spine and the role model in the code disagree, and the gap has permission semantics (EXPERIENCE.md L31-36; `SettingsPage.tsx:15`, `:61-66`, `:508`)

Spine: two roles, Owner and Admin. Code: `type TeamRole = 'Owner' | 'Admin' | 'Manager' | 'Staff'`, with a styled badge per role and a picker at `:508` offering all four, persisted to `team_members.role`. Existing rows will contain Manager and Staff.

Two consequences:

1. **Undefined roles get undefined permissions.** Whatever RLS policy implements the two-role model will have an implicit else-branch for Manager and Staff. Nobody has decided whether that branch denies or falls through, and the spine gives the implementer no reason to think it exists.
2. **The role dropdown lives in the drawer Admins own.** The spine gives role changes to Owner ("Owner: … change roles") but gives member management to Admin, and DEC-15 puts role in the same drawer as everything else about a person. An Admin opening any member drawer can set role to Owner. The spine's own role table forbids this; the spine's own component design permits it.

Fix: state the migration for Manager/Staff rows, and split role out of the Admin-editable surface (render it read-only when the actor is not an Owner). Both are spine decisions, not implementation choices.

### high — Rule 3 is load-bearing and rests on a non-unique free-text field (EXPERIENCE.md Rule 3, DEC-9; `SettingsPage.tsx:745`)

"Every empty state names its company. This is the load-bearing rule of the whole build; without it, correct and incorrect filtering are indistinguishable."

Company name validation today is `if (!form.name.trim())`. Nothing enforces uniqueness, in the form or (as far as the spine says) in the schema. Two companies can be named "Bluestar North". At that point "No duties in Bluestar North for today" is ambiguous across two tenants, the switcher popover shows two identical rows, and the load-bearing rule carries nothing. Companies also remain freely renameable — Rule 5 removed delete and archive but left edit — so a rename mid-session desyncs the badge, the empty states, and the technical-details payload against what Hassel remembers choosing.

Fix: unique constraint on company name, stated in the spine as a UX requirement because the UX depends on it. Consider whether rename should require confirmation given how much text now quotes the name.

### medium — Concurrent edits to one member silently re-grant revoked access (`SettingsPage.tsx:454-456`, DEC-15)

The member drawer saves the whole person in one `update` — every field in one payload. Adding the company checklist to that payload means memberships are written as part of a full-row overwrite.

Two Admins, one member. Admin A opens Hassel's drawer at 09:00. Admin B revokes Hassel from South at 09:02. Admin A changes Hassel's phone number and saves at 09:05. Hassel is back in South, and nobody knows. The revoke leaves no trace and no error.

This is a direct cost of "one surface holds everything about a person" that DEC-15 never priced. Fix: write memberships as their own operation (add/remove deltas), not as part of the row overwrite. Or version the row and reject stale saves.

### medium — The company badge cannot distinguish the companies in the spine's own examples (DESIGN.md §Components L159-161; EXPERIENCE.md Flow 1 step 6; `AppShell.tsx:67-74`)

DESIGN.md specifies the badge as "showing the active company's **initial**". Flow 1's climax reads: "never wondered which company he was in — the badge said South the whole time."

The badge does not say South. It says **B**, and it says B for Bluestar North, Bluestar East and Bluestar South alike. The one persistent company signal in the entire app (Rule 2) is constant across every company in every example either document uses. Rule 2, DEC-5's "ship the simple version", and H-1's "watch for wrong-company writes" all rest on a glyph that carries zero bits.

It also collides with what is already in the rail: `AppShell.tsx:67-74` renders a profile avatar showing initials "BS" on `bg-violet-100`. Two initial-glyph tiles, 80px apart, one of them violet.

The accessibility clause ("conveyed by text, never colour alone — the badge carries an initial and an accessible label") is technically satisfied and practically hollow: the accessible label is only reachable by screen reader or hover, so sighted mouse users — i.e. Hassel, explicitly (§Interaction Primitives, "mouse-first") — get nothing.

Fix: the badge shows a distinguishing string, not an initial. Two or three characters derived from the distinguishing part of the name ("NTH"/"EST"/"STH"), or an always-visible short label under the icon. The 80px rail has 48px of usable width (`w-20` minus `px-4`) which fits three characters at `text-xs`. This does not reopen DEC-5 — it is still one badge in the rail, still no colour, still no banner.

### medium — WCAG 2.2 AA is asserted while the primary form surface is declared untouchable (EXPERIENCE.md §Accessibility Floor L160-168; DESIGN.md §Components L153-155; `Drawer.tsx`)

DESIGN.md: "Inherited from the existing system, unchanged — do not restyle these: `Drawer`…". EXPERIENCE.md: "WCAG 2.2 AA… the floor is not negotiable", "`Tab` order matches reading order", "`Esc` closes the topmost drawer or popover".

`Drawer.tsx` has no focus trap, no initial focus, and no focus return on close. Tab from an open drawer walks into the content behind the backdrop. Its Esc handler is a bare `document.addEventListener('keydown')` registered whenever `open` — so with a popover open over a drawer, both handlers fire on the same keypress and both close. "Topmost" is not implementable without changing the component the design spine forbids changing.

The member drawer makes this worse than a compliance note: with the "at least one company" rule and a retained-on-error form (§State Patterns L128), a user who hits Esc after a save-error toast loses everything they typed, because `onClose` fires unconditionally with no dirty-state guard.

Fix: allow `Drawer` to change. "Do not restyle" and "do not fix" are different instructions and the spine currently reads as both.

### medium — Error and empty are not ordered, and the existing code defaults to the wrong one (EXPERIENCE.md §State Patterns L125-127; `AllDutiesPage.tsx:296`)

The state table lists "Empty — no data" and "Fetch error" as peers with no precedence rule. The current code shape is `if (error) { console.error(error); setLoading(false); return }` — the error is swallowed, `rows` stays empty, and the table renders its empty branch.

A developer adding skeletons and error blocks to that shape, one page at a time, will very plausibly leave the early-return intact and mount the empty state on top of it. The result is the app confidently telling Hassel "No duties in Bluestar North for today" when the fetch failed — which is precisely the failure mode the four-meanings table (L110-116) exists to prevent, arriving through the fix rather than despite it.

Fix: one explicit rule. An error never renders as empty; the empty state may only render on a successful zero-row response.

### medium — Rule 5 cites the wrong line and describes only a third of the removal (EXPERIENCE.md Rule 5; `SettingsPage.tsx:947-954`, `:96-160`, `:1037-1041`)

"The existing hard `DELETE` on `SettingsPage.tsx:946` is removed as part of this build."

The `supabase.from('companies').delete()` is at **:949**, inside `handleDelete` spanning :947-954. Removing that one line leaves:

- `ActionsMenu` (`:96-160`), which is **shared with the Team members tab** and unconditionally renders a Delete item — so the company row menu still offers Delete;
- `ConfirmDeleteModal` wired at `:1037-1041`;
- `setCompanies(prev => prev.filter(...))` at **:951**, which runs after the delete call and would still remove the row from local state.

Delete only the network call and you get a company that vanishes from the table, shows a "Company removed" toast, and reappears on refresh. Rule 5's intent is right; its instruction is precise enough to be followed wrongly.

Fix: state the removal as "the Delete item is removed from the company row menu" and note that `ActionsMenu` needs an optional `onDelete`, since it is shared.

### medium — The invite has no state model, and DEC-17's guard is attached to the wrong object (EXPERIENCE.md Flow 2 steps 1-2, IA L54; DEC-17; `SettingsPage.tsx:17-35`, `:428-440`)

`team_members` today is a CRM table with no link to an auth user, and **email is optional** — the interface types it `string | null` and the drawer's Email `FormField` carries no `required`. "Invite team member" is a plain `INSERT`; no email is sent, no auth user is created.

The spine's Flow 2 opens with "Hassel gets an email: Yash has invited him", and DEC-17 prevents zero-access by validating that drawer. But the drawer validates a row in a directory table. The thing that actually determines whether a person can sign in and what they can reach is the auth user and its memberships, and neither spine mentions either.

Also missing: any notion of invite state. The Team members table will list people who have never signed in beside people who use the app daily, indistinguishable. There is no pending state, no expiry, no resend, no revoke-a-pending-invite. Flow 3's "he opens Hassel's row" assumes Hassel exists as an account; nothing says how he became one.

Fix: model the invite (pending / accepted / expired) in the Team members list, and state the mapping between `team_members`, `auth.users`, and memberships. Make email required, since it is the identity.

### medium — H-1 is deferred without instrumentation, which makes it undetectable rather than deferred (DEC-5, H-1, Rule 6)

"Not designed for. Watch for it instead." The three named signals:

1. "Records created then deleted shortly after in one company and re-created in another" — requires an audit trail with cross-company correlation. The app hard-deletes everywhere (`.delete()` at `SettingsPage.tsx:574`, `:949`, and throughout), and neither spine requests audit logging, soft deletes, or a created-by column. A mis-scoped booking that gets deleted leaves nothing behind. This signal cannot fire.
2. "Hassel asking 'where did that booking go?'" — requires Hassel to notice a record in a company he is not currently looking at. Rule 3 forbids cross-company hints in empty states and Rule 2 forbids ambient identity, so the product is specifically built not to show him.
3. "Any manual data move between companies" — fires only after Yash has already been called, i.e. after the damage.

Deciding not to mitigate an unvalidated risk is defensible; DEC-5's reasoning is sound and Sally recording it "without reservation" is fine. Declaring a watch you cannot perform is not. As written, H-1 is "hope someone complains loudly enough", which is materially different from what the log claims.

Fix, and it is cheap: a `created_by` and `company_id` on operational writes plus soft-delete on bookings/duties would make signal 1 a query. That is the whole cost of making the deferral honest. Note also that the multi-tab vector in finding 3 above is a mechanism for exactly this failure that no one hypothesised, and it does not need Hassel to be careless.

### low — The switcher popover has no states, despite being the product's dashboard (EXPERIENCE.md §Component Patterns L93, §State Patterns table; DEC-3)

DEC-3 makes the popover carry Hassel's entire morning scan and explicitly declines to build a dashboard because the popover answers the question. The state table then covers "any table" and "any surface" and never mentions the popover. There is no specification for the counts loading, the counts failing, or the counts being stale after a background change.

The first click of Hassel's morning opens a popover that, if the aggregate errors, will show either nothing, zeros, or three blank rows — and zeros are indistinguishable from a quiet morning. This is the same four-meanings problem the spine solved for tables and skipped for the one surface it made load-bearing.

### low — Duty count semantics contradict themselves (DESIGN.md L164, EXPERIENCE.md L93, DEC-10, Flow 1 step 3)

Three places say "**total** duty count" and DEC-10 explicitly rejects filtering ("Hassel asked for how many duties there are, not how many are unalloted"). Flow 1 then shows "North 12, East 8, South 15" in a scene about this morning's work — numbers that only make sense as today's, since a genuine all-time total would grow without bound and answer nothing.

Related: `AllDutiesPage` has no count at all — it paginates with `BATCH_SIZE`/`offsetRef`/`hasMore` (`:59`, `:234`, `:322-331`) and the log already noted this at "Surface closure — FAILS". So the aggregate is entirely new, which makes getting its definition right cheap now and annoying later. Pick a window and say it: today, or today plus unstarted future.

### low — Settings sub-surfaces are component state, not routes (`SettingsPage.tsx:14`, `:1057`, `:1050-1053`; EXPERIENCE.md IA L53-55, §State Patterns L131)

The IA lists Settings → Account, Team members and Companies as three surfaces reached from the rail footer. In code they are `useState<Tab>('account')` inside one `/settings` route. Consequences: "redirect to Login, preserving the intended destination for post-login return" cannot restore which tab Yash was on; nothing is linkable; browser Back does not work inside Settings. Minor today, but Flow 3 is built entirely around Yash finding two of these tabs after five months away, and the spine's answer to "he remembers none of it" is currently "he clicks around".

## What holds up

- **The four-meanings analysis** (§State Patterns L108-119) is the best thing in either document. It correctly identifies that multi-tenancy weaponises an existing gap rather than creating one, and it is the right reason to prioritise this work.
- **Two-tier error blocks** (DEC-8) genuinely serve both audiences from one component, and closing `ux-backlog.md:44` at every fetch point is the right scope.
- **Skeletons everywhere over skeletons-where-slow** (DEC-11) — correct, and the rejection rationale (two patterns is the drift that created the backlog item) is honest.
- **Portal-rendering floating surfaces** is real and precedented: `ActionsMenu` already uses `createPortal` with `useMenuFlip` after commit `76e879c`. The switcher popover has a working pattern to copy.
- **The 80px rail geometry** is fine dimensionally: `w-20` with `px-4` leaves 48px, and existing nav buttons are already `size-12`. The badge fits; only its contents are wrong (see the badge finding).
- **No dashboard** (DEC-3) is a defensible cut, well-reasoned from the protagonist narration.
- **DEC-14 removing company deletion** is right, and the asymmetry argument (low cost of a stray company, unbounded cost of a stray deletion) is the correct frame. Only the instruction for carrying it out is imprecise.
