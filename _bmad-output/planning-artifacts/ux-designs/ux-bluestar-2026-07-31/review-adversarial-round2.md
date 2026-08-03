# Adversarial Re-review — Bluestar multi-tenancy spines (round 2)

_Re-reviewed 2026-08-03 against the rewritten DESIGN.md and EXPERIENCE.md, `.decision-log.md` DEC-18–24, and the working tree at `76e879c` + uncommitted changes. Round-1 reports: `review-adversarial.md`, `review-rubric.md`._

## Verdict

Better, and still not shippable. Two of four criticals are genuinely closed, one is closed on the point I raised, and the fourth — the one that decides whether tenant isolation exists at all — has been given an address without a lock. Rule 7 now commits `active_company_id` to the profile row and says nothing whatsoever about validating it against membership on write, while the existing code already performs a client-side `update()` on that exact table (`SettingsPage.tsx:243`). Round 1 said "name the storage location **and** require the membership re-check in the same breath." The location got named. The re-check did not get written. The hole is now more concrete, not less.

The bigger problem is that the fixes were written independently of each other and collide. Member rule 3 makes the company checklist read-only on your own row for every role including Owner, and points at the Companies surface as the escape hatch — a surface whose only specified behaviour is "Edit only. No delete, no archive." So an Owner who creates a fourth company, which is literally Flow 3 step 2, has no specified path to ever enter it. Member rule 2 shows an Admin a partial checklist, and nothing anywhere says whether saving writes a delta or replaces the set — replace means a phone-number edit silently revokes a company the editor cannot see. Rule 6 quietly redefines Owner as "membership-limited," which the Foundation role table three sections earlier flatly contradicts.

Every factual claim I was asked to verify is true. The one I would still not sign is DESIGN.md's `brand-* 41` — true as a grep count, and 41 of 41 are token definitions in two CSS files. Actual application usage is zero, which round 1 reported and this table now dilutes.

## Status of round-1 criticals

### Critical 1 — The member drawer is a self-service privilege escalation across tenants — PARTIALLY CLOSED

The specific attack is dead. An Admin opening their own row hits two independent blocks: rule 3 (`EXPERIENCE.md:114-116`, checklist read-only on your own row) and rule 2 (`:112-113`, the checklist only offers companies the actor belongs to, so there is nothing new to tick even if rule 3 were skipped). Defence in depth, correctly ordered. Rule 4 kills the second half of my round-1 high — an Admin can no longer set role to Owner from the drawer.

What is not closed is the case the rules create rather than the one they remove.

**The "Admin edits another Admin who belongs to a company the editor does not" case is named nowhere and has a security consequence in both directions.** Hassel is Admin in {North, East}. Priya is Admin in {North, South}. Rule 1 lets Hassel see her — they share North. Rule 2 renders a checklist of {North, East}; South is absent from the UI and, by rule 2's own logic, must be absent from what the client fetches. Hassel edits her phone number and saves.

The drawer's existing save is a whole-row `update` with every field in one payload (`SettingsPage.tsx:439-452`). If memberships ride that payload as a set, the set Hassel submits is `{North}` and Priya loses South — silently, deterministically, on every save, performed by someone with no visibility into what he destroyed. If instead the save is a delta, nothing breaks. **The spine does not say which.** This is the round-1 medium ("Concurrent edits to one member silently re-grant revoked access") promoted from a race to a certainty by the fix for critical 1, and neither DEC-20 nor the six rules mention write semantics at all.

**Rules 2 and 5 contradict each other on the same drawer.** Rule 5 requires at least one company ticked before saving. Against which set? If it validates the visible subset, Hassel unticking North on Priya is blocked — even though she still holds South and the operation is legal. If it validates the true set, the client must hold South, which rule 2 says it must not show and cannot justify fetching. There is no third option and the spine picks neither.

**Lateral escalation is unrestricted and unacknowledged.** Rule 3 blocks self-grant. It does not block a pair of Admins sharing one company from granting each other the union of their memberships — Priya, holding South, may grant South to Hassel, who shares North with her. That may be intended by the role table's "managing members who share those companies," but it means Admin is functionally Owner across the transitive closure of Admin memberships, and no rule, DEC, or flow says so.

Verdict: the escalation I demonstrated is closed. The drawer is still not safe to build from this spec.

### Critical 2 — Rule 7 is written so that the correct-by-the-letter implementation leaks — CLOSED

Rule 6 (`EXPERIENCE.md:215-220`) is tight. "Exempt from active-company scoping — not from tenant scoping," "the membership predicate lives *inside* the query, never in client filtering," "must never return the name, count, or existence of a company the requester does not belong to," and the explicit closing of the Owner loophole that made the leak pass both readings. A developer following the letter cannot produce the `SECURITY DEFINER`-returns-everything implementation. The false "cannot be scoped by RLS, by definition" is gone, and the "single exception" framing that made my round-1 high true three times over is gone with it. This is the one fix I would sign as written.

Two residuals it does not own, tracked below: Settings → Companies still hands the full company roster with tax registrations to Admins (`EXPERIENCE.md:59`, no role note), and Rule 6's redefinition of Owner scope contradicts the Foundation role table.

### Critical 3 — The badge renders "B" for all three Bluestar companies — CLOSED

The badge shows an author-set short code (`EXPERIENCE.md:209-214`, `DESIGN.md:183-187`), the "do not derive an initial" instruction is explicit with the reason attached, Flow 1 now says "the badge read BS throughout" against a badge that actually reads BS, and the Do's/Don'ts row (`DESIGN.md:216`) restates it. The glyph carries bits. Original hole closed.

It closed by introducing a new required field with no rules attached — collision, backfill, edit, requiredness — and by picking a default that collides with what is already rendered 80px away. Both filed below.

### Critical 4 — Nobody specified where the active company id lives, or that it must be re-verified — NOT CLOSED on the half that matters

The tab half is addressed. The security half is not, and the fix made it worse by committing to a location without committing to a guard.

Rule 7 (`EXPERIENCE.md:221-224`) reads in full: "Active company is stored per user, not per tab. It lives on the profile row because RLS must read it server-side. The consequence is unavoidable and must be designed for rather than ignored: two tabs cannot hold different companies." Every word of that is about tabs. **There is not one word about validating the written value against membership.** Round 1's finding was not "you didn't say where it lives" — it was "if `current_company_id()` reads anything the client supplies without an accompanying membership check, any authenticated user reads and writes any tenant's data by setting one value."

The profile row is client-writable today. `SettingsPage.tsx:243` performs `supabase.from('user_profiles').update({...}).eq('id', profile.id)` straight from the browser. Adding `active_company_id` to that row, as Rule 7 now instructs, means the client sets the value that RLS then trusts. Without a `CHECK` that the id appears in the actor's memberships — enforced in a trigger, an RLS `WITH CHECK` clause, or a `SECURITY DEFINER` setter that is the only write path — a user changes one integer and reads every company in the parent org. That is the entire boundary, and the document that was rewritten to fix it does not mention it.

The tab half is partially closed: the divergence is named, it is correctly identified as delivering H-1 deterministically, and a visible notice plus refetch is required. But **the mechanism is hand-waved.** "Every other open tab shows a visible notice and refetches" (`:242`) requires a push — Supabase realtime on the profile row, `BroadcastChannel`, a `storage` event, or polling. None is named, and the choice is not cosmetic: a focus-based revalidation cannot satisfy "every other open tab shows a notice" because a background tab never gets focus. Worse, no mechanism closes the **propagation window**. Between the write in tab A and the notice landing in tab B, the server has re-scoped and tab B still renders the old badge. A write submitted in that window lands in the new company under the old label — H-1, exactly, with a window whose length nobody has bounded. `:243` asserts "stale rows are never left on screen under a different company's label" and supplies nothing that makes it true.

The framing also dodges: "The notice is informational, not a prompt; there is nothing to decide." There is. Hassel was working in North in tab B. He cannot switch back without yanking tab A. Two tabs cannot hold different companies is a hard constraint on the user's workflow, and the one sentence acknowledging it tells him there is nothing to think about.

## New problems introduced by the fixes

### critical — An Owner cannot join a company, and Flow 3 demonstrates it (EXPERIENCE.md:114-116, :102, :59; DESIGN.md:203-204; Flow 3 steps 2-4)

Rule 3 makes the checklist read-only on your own row "for every role including Owner," then supplies the escape hatch: "An Owner needing to join a company does it from the Companies surface, which is separately Owner-gated."

That surface does not do that. The IA says "Create and edit companies" (`:59`). Component Patterns says "Company row menu — Edit only. **No delete, no archive.**" (`:102`). `DESIGN.md` Components has no Companies entry at all. No spec anywhere gives the Companies surface a membership control, so the escape hatch is asserted and unspecified.

Now run Flow 3. Yash, sole Owner, opens Bluestar West at 11pm. He cannot tick himself (rule 3). Rule 6 has just redefined his reach as "every company they hold membership in; it does not license an unfiltered read," so West does not appear in his switcher and cannot become his active company. Rule 1 requires exactly one active company at all times, and West can never be it. Rule 6 of member management guarantees a single-Owner deployment is supported, so there is no second Owner to grant it. **Yash creates a company he can never enter, and the flow's own climax is him ticking that company on someone else's row.** The document walks through the deadlock and does not notice.

Same shape at install: the first Owner has no row for anyone to grant from.

Fix: either the Companies surface gains a specified "companies you create, you join" rule, or Owner is exempted from rule 3 with a confirmation, or Owner reach is decoupled from membership — but then Rule 6 has to say so, and the count query has to handle it.

### critical — Rule 2's partial checklist plus a whole-row save silently revokes access the editor cannot see (EXPERIENCE.md:112-113, :119-120; `SettingsPage.tsx:439-452`)

Detailed under Critical 1. Filed separately because it is a *new* defect created by the fix: before rule 2, the checklist showed every company and a full-set overwrite was lossless. Rule 2 makes the checklist a strict subset of the truth without saying what a subset write means, which turns a lossless save into a destructive one on every edit of a member whose memberships exceed the editor's.

### high — Rule 6 redefines Owner scope and contradicts the Foundation role table (EXPERIENCE.md:32 vs :219-220)

Foundation: Owner "see and manage all companies and all members." Rule 6: "For an Owner, 'sees all companies' means every company they hold membership in; it does not license an unfiltered read."

These are different products. Under the first, the switcher lists every company that exists. Under the second, it lists the Owner's memberships. Member rule 2 sides with the first ("Owner sees every company" in the checklist), Rule 6 sides with the second, and both are load-bearing in the same file. Whichever a developer picks, the other reading is a bug against the spec. Combined with the deadlock above, the second reading is also a functional trap.

### high — The short code has no collision rule, no backfill, no edit semantics, and no stated requiredness (EXPERIENCE.md:209-214; DEC-19; `SettingsPage.tsx:745-747`)

"Two or three characters, author-set at creation, unique across companies. ... A default may be *suggested* from distinguishing words (BN / BE / BS); it must remain editable."

Unanswered, all of it load-bearing on the product's only ambient signal:

- **Collision.** Uniqueness is asserted; nothing says what the user sees when it fails. Voice and Tone has no line for it. Today's form validates with toasts (`if (!form.name.trim()) { showToast(...) }` at `:745`) and has no inline error pattern, so the natural implementation is a toast on save — the one place a State Patterns "Save error" row exists but no rule requires field-level treatment. The suggestion itself collides: "Bluestar North" and "Bluestar Northeast" both suggest BN.
- **Backfill.** The three companies that exist today have no such column. DEC-24 requires the badge to render always. A null short code on day one is a blank badge on every pre-existing company, on the surface DEC-24 exists to keep permanently present. No migration is specified.
- **Requiredness.** "author-set at creation" implies required; nothing states it, the existing form requires only name and phone, and "a default *may* be suggested" licenses skipping the suggestion entirely. A blank badge is a legal outcome of following this rule to the letter.
- **Edit.** Companies remain freely editable (rule 4 removed only delete). Renaming the short code mid-session changes the badge under a user who has learned it. Nothing says whether it is immutable after creation, and this is exactly the muscle memory Flow 2's climax is built on.
- **Charset and case.** "BN" vs "bn" — unique under which comparison?

### high — Tab consistency specifies a requirement, not a mechanism, and leaves the propagation window open (EXPERIENCE.md:234-244)

Detailed under Critical 4. Named separately because DEC-22 claims it as a fix and it is a restatement of the problem with a required outcome attached.

### medium — Member rules 2 and 5 cannot both be satisfied (EXPERIENCE.md:112-113 vs :119-120)

Detailed under Critical 1.

### medium — "Admins do not see Owner-only controls at all" contradicts "the role control is disabled for Admins" (EXPERIENCE.md:153 vs :117-118)

The Permission denied state row: "Admins do not see Owner-only controls **at all** — Companies create, role controls." Member rule 4: "The role control is **disabled** for Admins, including on rows they may otherwise edit."

Hidden and disabled are different builds and different information disclosures — a disabled control tells an Admin that roles exist and that someone can change them. Round 1's rubric asked for exactly one posture to be committed ("hide versus disable versus explain"); the rewrite committed to both, in two sections, four dozen lines apart.

Same row also leaves Settings → Companies half-gated: it names *Companies create* as Owner-only, not the Companies list. So the IA row at `:59` still stands unqualified, and an Admin still reads every company's name, phone, email, GSTIN, CIN and service tax number from `CompaniesTab`'s `select('*')` — the roster that member rule 2 was written to withhold from that same Admin, handed over one tab away.

### medium — The 340-vs-41 table is true as a grep and false as a comparison (DESIGN.md:101-104, :210)

| Token family | Usages | Files |
|---|---|---|
| `violet-*` | **340** | 35 |
| `brand-*` | 41 | — |

Measured: `violet-*` is 340 total, of which 24 are the token definitions in `tokens.css`/`global.css` and **316 are real usages across 33 `.tsx` files**. `brand-*` is 41 total, of which **41 are token definitions in those same two CSS files and 0 are usages anywhere in application code**. The "Files: —" cell for brand hides that its two files are the two that define it.

Under a column headed "Usages," 41 reads as "brand is used, just less." It is used zero times. Round 1 reported that number precisely; the rewrite had it and chose a framing that dilutes its own conclusion by an infinite factor. The conclusion (violet is the accent) is right. The evidence as presented is not the evidence.

### medium — `CLAUDE.md` was removed from `sources` while being cited normatively twice (DESIGN.md:7-9, :98, :178-179)

Round 1's rubric verified `../../../../CLAUDE.md` as a declared DESIGN.md source. It is gone from the frontmatter. Meanwhile the rewrite added two normative citations to it: "This supersedes `CLAUDE.md`, which names `brand-600` as the primary" (`:98`) and "`CLAUDE.md` also lists a `ConfirmModal`. **No such component exists**" (`:178-179`). A consumer handed the pair cannot resolve either. `.decision-log.md` remains undeclared in both files while being cited at `EXPERIENCE.md:64`, `:120`, `:253` — the rubric's round-1 medium, unaddressed, now with one more dangling reference.

### low — The suggested short code for Bluestar South is "BS", which the rail already renders (DESIGN.md:183-187; `AppShell.tsx:67-72`)

`AppShell.tsx:71` renders a profile avatar with the hardcoded string **BS** in `text-violet-700` on `bg-violet-100`. The company badge is specified as `violet-50` fill, `violet-700` glyph, in the same 80px rail. DEC-19's suggested default for Bluestar South is **BS**. Two violet tiles, one rail apart, both reading BS, meaning entirely different things — the user's initials and the active company. Round 1 flagged the avatar collision; the fix chose the one default string that makes it literal. Neither spine mentions the avatar exists.

## Surviving round-1 findings

| Original title | Status |
|---|---|
| **critical** — The member drawer is a self-service privilege escalation across tenants | Partially closed — see above |
| **critical** — Rule 7 is written so that the correct-by-the-letter implementation leaks | **Closed** |
| **critical** — Nobody specified where the active company id lives, or that it must be re-verified | Not closed on the security half; tab half partial |
| **critical** — DESIGN.md's brand claim is false about this codebase, and the cleanup is mis-scoped by ~30x | **Closed** (DEC-18 accepts violet), with the presentation defect filed above |
| **high** — Rule 7's "single exception" is wrong three times over | Partially closed. Member-checklist leak fixed by member rule 2; "single exception" phrasing removed. **Settings → Companies still ungated in the IA and still leaks every company's tax registration to Admins.** Customers still shared. |
| **high** — The "customers are the single shared exception" exemption was never decided | **Survives untouched.** `EXPERIENCE.md:24-25` verbatim. `grep -i customer` over `.decision-log.md` returns exactly one hit, line 127, still inside DEC-4's narration. No DEC in the post-review block covers it. Largest hole in the isolation model, still a subordinate clause. |
| **high** — DEC-17's residual note is false; zero-access is reachable through the UI | **Survives.** `SettingsPage.tsx:574` still hard-deletes a team member via the shared `ActionsMenu`. Member rule 6 protects only the last Owner. Nothing states what member deletion does to the auth user, so a deleted member keeps a valid JWT and lands in the shell that "does not exist, by design" (`:160-161`). |
| **high** — Access revoked mid-session is unhandled, and Rule 3 specifically fails to cover it | **Survives.** The new Permission denied row is about Owner-gated *surfaces*, not about a membership revoked under a live session. No state exists for "your active company is no longer one of your memberships," and Rule 1's "no null state" makes it unrepresentable. Supabase JWTs remain valid for their full TTL. |
| **high** — "Switching never navigates" and "143 query sites untouched" cannot both be true | **Closed as a contradiction** by Rule 8, which names it as the build's most dangerous failure mode. Cost still unscoped: 146 `.from('` sites across 24 files, 7 `exhaustive-deps` suppressions, and Rule 8 names only `AllDutiesPage.tsx:317` while `fetchMore` at `:333` carries the same deps and `offsetRef`/`hasMore` need resetting on switch. See new findings. |
| **high** — The role model in the spine and the role model in the code disagree | Partially closed. Foundation now carries the delta note; rule 4 makes role Owner-only. **No migration for existing Manager/Staff rows** ("are cut" is not a migration), and the note says "its `CHECK` constraint" singular against two TeamRole columns. See new findings. |
| **high** — Rule 3 is load-bearing and rests on a non-unique free-text field | **Survives.** The short code is unique; the company **name** is not — `SettingsPage.tsx:745` still validates only `!form.name.trim()`. Every empty state, every error-block payload, and every Voice and Tone example quotes the *name*, not the code. Two "Bluestar North"s still make the load-bearing rule carry nothing. Rename still unguarded. |
| **medium** — Concurrent edits to one member silently re-grant revoked access | **Survives, promoted.** No longer a race — deterministic on every save. Filed as a new critical. |
| **medium** — The company badge cannot distinguish the companies in the spine's own examples | Closed on the glyph. Rail-avatar collision survives and is now literal. |
| **medium** — WCAG 2.2 AA is asserted while the primary form surface is declared untouchable | **Survives untouched.** `Drawer.tsx` unchanged: no focus trap, no initial focus, no focus return, no `role="dialog"`/`aria-modal`, and a bare `document.addEventListener('keydown')` at `:19-25` that makes `EXPERIENCE.md:190`'s "Esc closes the **topmost** drawer or popover" unimplementable. `DESIGN.md:173-176` still lists `Drawer` under do-not-restyle. The new popover gets specified focus return (`:96`) that the existing drawer is forbidden from having, in the same document. |
| **medium** — Error and empty are not ordered, and the existing code defaults to the wrong one | **Survives.** State table still lists "Empty — no data" and "Fetch error" as peers with no precedence rule. `AllDutiesPage.tsx:297` still `if (error) { console.error(error); setLoading(false); return }`, which renders the empty branch on failure. |
| **medium** — Rule 5 cites the wrong line and describes only a third of the removal | **Closed.** Line corrected to 949; the shared-`ActionsMenu` consequence is now stated (`:204-208`) and is accurate — `ActionsMenu` at `:96` takes a required `onDelete` and is used at `:645` and `:1020`. |
| **medium** — The invite has no state model, and DEC-17's guard is attached to the wrong object | Partially closed. Set password and Reset password IA rows, an invite-expiry state, and Flows 2/4 are real additions. Still: **no pending/accepted state** on the Team members list, no mapping between `team_members` / `user_profiles` / `auth.users` / memberships, and `team_members.email` is still `string \| null` with no "required" statement anywhere despite being the identity. |
| **medium** — H-1 is deferred without instrumentation | **Survives.** Watch item (`:246-253`) carries the same three unperformable signals; no audit trail, soft delete, or `created_by` is requested anywhere. Now internally inconsistent: Tab consistency states two sections earlier that this failure arrives *deterministically*, while the Watch item still calls it an unvalidated hypothesis not designed for. |
| **low** — The switcher popover has no states | **Survives.** No loading or failure treatment for the counts. "Fetch error — Any surface" does not reach a component the IA does not list as a surface, and the popover's Component Patterns row (`:96`) says nothing. Zeroes are still indistinguishable from a quiet morning, on the product's designated dashboard. Rubric flagged this independently. |
| **low** — Duty count semantics contradict themselves | **Survives.** Still "total duty count" (`:96`) against Flow 1's morning-scan numbers and now also against Flow 2's chooser, where an all-time total for a brand-new user is meaningless. No window defined. |
| **low** — Settings sub-surfaces are component state, not routes | **Survives.** `useState<Tab>('account')` at `SettingsPage.tsx:1057`. "Preserving the intended destination for post-login return" (`:158`) still cannot restore a tab. |

Rubric findings still open, spot-checked: `typography.page-title` still mints `fontSize: 30px` against `--font-size-display-sm` at `tokens.css:410` (the `rounded` aliases *were* fixed to token names — inconsistent discipline in one frontmatter block); `company-switcher-popover.background` moved from `'#ffffff'` to the bare string `white`, which is unresolvable and not enumerated, joining `gray-100` and `gray-50` in the same block; no contrast target exists anywhere in DESIGN.md; Foundation still claims "desktop-first responsive" with no breakpoint or minimum width; Rule 2 ("every empty state names its company") is still absolute against Settings surfaces that are not company-scoped; Billing is still an unqualified IA row against `ux-backlog.md:18-19` "Coming soon" stubs.

## New findings

### critical — The app self-provisions an Owner, and neither spine knows (`SettingsPage.tsx:205-220`)

```
let { data } = await supabase.from('user_profiles').select('*').order('id').limit(1).maybeSingle()
if (!data) {
  const { data: inserted } = await supabase.from('user_profiles')
    .insert({ first_name: '', last_name: '', email: '', role: '', access_type: 'Owner' })
```

Two defects, both inherited into the multi-tenant build unexamined:

1. The Account tab loads **the first profile row in the table**, ordered by id, not the signed-in user's. Under multi-tenancy this hands one arbitrary person's profile to everyone until it is rewritten, and nothing in either spine says it must be.
2. If no row exists, the client **inserts one with `access_type: 'Owner'`**. Whatever RLS policy allows a user to create their own profile row on first sign-in — and one must, for invite acceptance to work — permits `access_type` in the client payload. That is a self-service Owner grant, from the browser, in the same product where six new rules exist to stop a self-service *company* grant. Critical 1 was closed on the checklist and left wide open one table over.

Fix: `access_type` (and `active_company_id`, per Rule 7) are never client-writable. State it as a rule, in the same block as the member management rules, because a developer reading those six rules today will secure the checklist and leave this insert alone.

### high — Two identity tables and three role columns; the migration note covers one (`SettingsPage.tsx:15`, `:18-25`, `:27-35`; EXPERIENCE.md:35-37)

The delta note says "`TeamRole` ... currently declares four roles ... The type and its `CHECK` constraint narrow to two." Singular. In fact:

- `user_profiles.access_type: TeamRole` — the signed-in user's role
- `team_members.role: TeamRole` — everyone else's role
- `user_profiles.role: string` — free text, a job title, same word, different meaning

Two tables model people and neither spine says which one a member *is*, which one the invite creates, which one memberships hang off, or how `team_members` rows relate to `auth.users`. The IA describes Settings → Account as "Your own profile" and Team members as "People and their company access" as though the mapping is self-evident. It is two tables with overlapping columns and no foreign key mentioned anywhere. This is the concrete form of the round-1 medium about DEC-17's guard being attached to the wrong object, and it now blocks Rule 7 too — "the profile row" is ambiguous between them.

Also: the member drawer's default is `role: 'Staff'` (`:386`) — the new-member default is a role the spine deletes.

### medium — Rule 8 names one dependency array; the same page has two (`AllDutiesPage.tsx:317` and `:333`)

Verified: `fetchInitial` deps are `[statusFilter, search, dateRange]` at line 317, exactly as claimed. `fetchMore` at line 333 carries `[loading, loadingMore, hasMore, statusFilter, search, dateRange]` — the same omission, on the pagination path, on the same page, sixteen lines down. Both sit under `eslint-disable-next-line react-hooks/exhaustive-deps`, and there are 7 such suppressions across `src/`.

Rule 8 also stops at dependencies. Switching company must additionally reset `offsetRef.current`, `hasMore`, and the sentinel observer, or the new company's first page appends beneath the old company's offset. Naming one line teaches an incomplete lesson on the rule the spine itself calls "the single most dangerous failure mode in the build."

### medium — Active company is null during the chooser, which Rule 1 forbids (EXPERIENCE.md:200-201, Flow 2 steps 2-3)

Rule 1: "Exactly one company is active at all times. No 'all companies' state, and **no null state after first sign-in**." Flow 2: he sets a password, "is signed in," *then* the chooser appears. Between those two events the active company is null, and that window is after first sign-in by the rule's own wording.

It is not pedantic — it decides what RLS does during the chooser. Every company-scoped read returns zero rows while `active_company_id` is null, so the chooser must be built entirely on the Rule 6 count query and nothing else. That happens to work. Nobody stated it, and a developer who puts any scoped read on that screen gets a blank chooser with no error.

### medium — Flow 2's failure path points at a control no component spec defines (EXPERIENCE.md:289-290 vs :101-122)

"No self-service resend; Yash reissues from the member drawer." The Member drawer row lists name, email, role, checklist. The six member management rules cover visibility, scoping, self-grant, role, minimum companies, last Owner. **No resend control exists in any spec.** This is the same defect the rubric flagged in round 1 for the zero-access screen — a flow's failure path instructing a consumer to build something no other section carries — reintroduced in the section written to fix invites.

### medium — The closed Drawer stays in the DOM and in tab order (`Drawer.tsx:27-51`)

The root is always rendered; `open` toggles `pointer-events-none` on the container and `translate-x-full` on the panel. Neither removes the panel's inputs and buttons from the tab sequence. Every mounted-but-closed drawer on a page — SettingsPage mounts several — is a run of focusable, invisible, off-screen controls a keyboard user tabs through. Against `EXPERIENCE.md:190` ("`Tab` order matches reading order") and a stated WCAG 2.2 AA floor, on the component `DESIGN.md:173-176` forbids touching.

### low — The popover's active row is a dot, with no announced equivalent (DESIGN.md:188-191; EXPERIENCE.md:96, :184-185)

The accessibility floor commits the *badge* to text-not-colour-alone. The popover's active row is indicated by "a leading `violet-600` dot" and nothing else. The row is keyboard-navigable per `:96`, but no `aria-current`, no text marker, and no announcement is specified for which of three rows is the one you are in — on the surface that exists to answer that question. (The dot itself computes 5.8:1 against white, so the contrast is fine; the semantics are missing.)

### low — Login still has no behavioural row (DESIGN.md:199-200; EXPERIENCE.md Component Patterns)

The Invalid credentials state row is a real addition and closes the rubric's high on that specific point. But `DESIGN.md:199-200` still specifies "one text link" without naming it — Flow 4 reveals it is "Forgot password?" — and Component Patterns still carries no Login row: no submit behaviour, no email retention across sessions, no rate-limit or lockout treatment. Hassel's daily first surface, specified visually and behaviourally only through a state row and a flow.

## Factual verification

Every claim I was asked to check, measured against the working tree on 2026-08-03.

| Claim | Verdict |
|---|---|
| `violet-*`: 340 uses across 35 files | **True as stated.** 340 occurrences, 35 files. Composition: 316 in 33 `.tsx`/`.ts` files, 24 in `tokens.css`/`global.css`. |
| `brand-*`: 41 uses | **True as a count, misleading as a comparison.** All 41 are token definitions in `tokens.css` (21) and `global.css` (12 lines / balance). **0 occurrences in any `.tsx`/`.ts` file.** Presented under a "Usages" column beside violet's 340. |
| Violet scale registered at `tokens.css:146` | **True.** `--color-violet-25` at 146, under the `/* Violet */` comment at 145; scale runs to `violet-950`. |
| `AllDutiesPage.tsx:317` deps `[statusFilter, search, dateRange]` | **True**, exactly. Under an `exhaustive-deps` suppression at 316. `fetchMore` at 333 repeats the omission — not mentioned. |
| Company hard `DELETE` at `SettingsPage.tsx:949` | **True.** `supabase.from('companies').delete()` at 949, inside `handleDelete` at 947-954. The 946 error from round 1 is corrected. |
| `ActionsMenu` is shared with the Team members tab | **True.** Defined `:96`, required `onDelete` prop, used at `:645` (team) and `:1020` (companies). |
| `ConfirmModal` does not exist | **True.** `src/components/ui/` contains ClearAllotmentModal, ConfirmDeleteModal, DateRangePicker, Drawer, Field, FileUpload, RestoreDutyModal, StatusBadge, Toast. |
| `#e4e7ec` is not a token | **True.** Zero hits in `src/styles/`. 8 occurrences in `src/`, all in SettingsPage. |
| `gray-200` is `#eaecf0` | **True.** `tokens.css:23`. |
| `#98a2b3` is exactly `gray-400` | **True.** `tokens.css:25`. 2 occurrences in `src/` (DESIGN.md's Uses cell says "—"). |
| `radius-lg` is 10px | **True.** `--radius-lg: 0.625rem /* 10px */`, `tokens.css:470`. |
| `rounded-lg` used 266 times | **True.** 266. (`rounded-xl` 60, `rounded-md` 28.) |
| `TeamRole` declares four roles | **True.** `SettingsPage.tsx:15`, `'Owner' \| 'Admin' \| 'Manager' \| 'Staff'`; picker offers all four at `:508`; new-member default is `'Staff'` at `:386`. |
| `ux-backlog.md` lines 43 / 44 | **True.** 43 "No loading skeletons on tables", 44 "No error states or retry patterns". |
| Commit `76e879c` portal precedent | **True.** "fix: render row action menus in a portal so they aren't clipped". |
| All 17 frontmatter hexes | **True.** violet-25/50/100/500/600/700/800, gray-200/400, error-50/500/600/700, warning-50/500, success-50/600 all match `tokens.css`. |
| Company badge contrast (`violet-700` on `violet-50`) | **Passes** at ~6.6:1 — but computed here, not stated anywhere in the pair, and DESIGN.md still carries no contrast target. |
| `.from('` call sites | 146 across 24 files (round 1: 146/25; a file moved in the working tree). Rule 8 scopes none of them. |
