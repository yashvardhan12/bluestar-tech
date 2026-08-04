# Adversarial Re-review — Bluestar multi-tenancy spines (round 3)

_Re-reviewed 2026-08-03 against the rewritten DESIGN.md and EXPERIENCE.md, `.decision-log.md` DEC-25–30, and the working tree at `76e879c` + uncommitted changes. Prior reports: `review-adversarial.md`, `review-adversarial-round2.md`, `review-rubric.md`._

## Verdict

**Not shippable as specified — but for the first time the reason is not the security boundary.**

Round 1's verdict was "the spines do not encode a security boundary." Round 2's was "the address got named, the lock did not." Round 3: the lock exists. Rule 7a is the correct sentence in the correct place, the count query's membership predicate holds, the delta-save rule is semantically coherent under interrogation, and Rule 8 kills the bootstrap deadlock without widening the blast radius. **There are no new criticals.** Anyone who has been reading these reports as escalating alarm should register that as a real signal.

What replaced the criticals is the same failure mode for the third consecutive round, at lower severity: the six round-2 fixes were written independently of each other and of the rules already on the page. The evidence is not interpretive — it is three wrong cross-references, all introduced in this pass. Foundation and member rule 3 both send the reader to "Rule 9" for auto-join; auto-join is Rule 8, and Rule 9 is company-name uniqueness, which landed in the same edit. State Patterns sends the reader to "rule 5 above" for the ≥1-company guard; the delta rule was inserted as member rule 4 and pushed it to 6, so the pointer now lands on "Role changes are Owner-only." Rule 8's own justification cites "rule 3" (member) and "rule 4" (multi-tenancy) in one sentence across two numbering namespaces. Four broken pointers in the block of text written to prove the rules cohere.

The substantive residue is four highs, and all four are one-to-three-sentence fixes:

1. **7a fails closed on the server and silently on the wire.** A membership-revoked read and a genuinely empty read are both `[]` with no error. That makes the brand-new "Access revoked mid-session" row unbuildable as written, and re-opens the four-meanings false-negative through the security fix.
2. **DEC-25 and DEC-30 collide.** Rule 8 lets an Owner bootstrap a company. DEC-30 deletes the browser Owner-factory that is currently the only way an Owner comes into existence, and names no replacement. The deadlock moved from "Owner cannot enter a company" to "no Owner exists."
3. **Who may create a company is not stated where the Companies surface is specified.** With Rule 8 in force, creation now issues membership, so the omission got expensive.
4. **Settings → Companies is still ungated**, and DEC-27 promoted that from an oversight to a structural dependency.

Every factual claim I was asked to verify is true at the line level. One is false as labelled — and it is the violet cell, not the brand cell: the correction fixed one side of the table and broke the other.

## Status of claimed fixes

### Rule 8, auto-join on creation (DEC-25) — PARTIALLY CLOSED

The deadlock is genuinely dead, and the framing is right: creation only, creator only, that company only, chosen over "Owners bypass membership," which would have been the lazy fix and the wrong one. Credit where due.

**Does it create a new escalation path? Only if an Admin can reach create — and the spine never says they cannot, anywhere a developer building that surface would look.** The Owner-only constraint on company creation appears in exactly two places: the Foundation role table's "Can" cell, and the State Patterns *Permission denied* row ("Admins do not see Owner-only controls at all — Companies create, role controls"). Neither is at the Companies surface. The IA row (`:65`, "Create and edit companies") carries no role note. Component Patterns carries one Companies row and it is about the `⋯` menu. DESIGN.md has no Companies entry at all. And **Rule 8 itself — the rule that makes creation grant tenant access — does not say who may create.**

"Admins do not see the control" is a visibility statement, not an authorization statement. The spine nowhere requires a server-side check on company insert. Before Rule 8, an unauthorized insert produced an orphan company; after Rule 8 it produces a company *and* a membership *and*, via Rule 7a, a valid active company. That is self-service tenant creation from a role the spine says cannot create tenants. The blast radius is bounded — a new empty company, not access to an existing one — which is why this is high and not critical. The fix is one clause in Rule 8: *"Only an Owner may create a company, enforced server-side; the auto-join inherits that authorization."*

**It also collides with DEC-30.** Rule 8 assumes an Owner exists to do the creating. DEC-30 requires removing `SettingsPage.tsx:216`, which is today the only mechanism by which anyone becomes an Owner, and specifies no replacement. Flow 2's invite requires an inviter. The Company chooser is "first sign-in only" and assumes memberships. Filed below as its own high — two round-2 fixes, written in the same pass, that jointly produce a system with no first user.

**And it collides with member rule 3 plus MT rule 4.** Auto-join is irreversible for the sole Owner: he cannot untick his own row (member rule 3, "every role including Owner"), there is no second Owner to do it for him (member rule 6 guarantees single-Owner deployments are supported), and the company cannot be deleted (MT rule 4). Yash's membership set is monotonically increasing and permanently untrimmable, and his switcher popover accumulates every company he ever created. Not a hole; an unnamed one-way ratchet on the protagonist the Settings surfaces exist for.

### Rule 7a, active company re-verified on every read (DEC-26) — PARTIALLY CLOSED

This is the most important sentence added since round 1 and it is correctly stated: the resolver returns the active company *only if the user is currently a member of it*, setting the field is not the same as being granted access, and `SettingsPage.tsx:243` is cited as the reason the check must be server-side rather than a client-side discipline. The DEC-6 post-mortem embedded in the rule ("logged as a clean win and was not one") is the right kind of honesty to leave in a spec.

**Does it actually fail closed?** At the resolver, yes — a SQL function returning NULL makes `company_id = current_company_id()` evaluate NULL for every row, which yields zero rows on SELECT and rejects on INSERT `WITH CHECK`. But **fail-closed is a property of the policies that consume the resolver, and the spine states it only about the resolver.** Nothing says *every policy must treat a null active company as zero rows, never as an absent predicate.* The natural wrong implementation is not exotic: a policy written `company_id = current_company_id() OR current_company_id() IS NULL` reads, in English, as "no company selected means no filter," and a developer who has internalised Rule 1's "no null state" will believe NULL is unreachable and write the permissive branch as a defensive convenience. One sentence closes it.

**Can 7a and Rule 1 both be true? No, and the document now contains three positions on it.** Rule 1: "Exactly one company is active at all times... no null state after first sign-in." Rule 7a: "otherwise resolves to nothing." The Access-revoked state row: describes precisely that nothing, at runtime, after first sign-in. Round 2 raised this against the chooser window; 7a now manufactures nulls in normal operation, so Rule 1's absolute is falsified by two other rules in its own list. Rule 1 needs to be reworded as a *UX* invariant — "the UI never presents an all-companies or unscoped state" — and explicitly cede that the server-side value can resolve to nothing.

**The consequential defect: 7a is silent.** A 7a-nulled read returns `[]` with no error, which is byte-identical to a quiet morning. So the client cannot distinguish "your membership was revoked" from "no duties today," which is exactly what the new Access-revoked row promises it will do. Detailed as a separate high below.

### DEC-27, management visibility ≠ data access — PARTIALLY CLOSED

**Against the switcher popover it survives cleanly.** The popover lists companies the user *belongs to* (Component Patterns `:102`), the count query is membership-scoped with the predicate inside the query, and Rule 6 closes the Owner loophole explicitly ("This applies to Owners identically — the Companies *management* list is a separate surface with separate rules"). Foundation and Rule 6 no longer contradict. The round-2 high on this specific point is closed, and the seam is drawn in the right place.

**Against the Companies management list it does not survive, because that list is still ungated.** The IA row has no role note. The Permission-denied row names *Companies create*, not the Companies list. `CompaniesTab` selects `*` — name, phone, email, GSTIN, CIN, service tax number — and, after Rule 5, the short code. DEC-27 has now made "the management list shows every company" a *designed* property rather than an inherited accident, so an Admin who reaches that tab receives the complete company roster by name and short code: the precise disclosure member rule 2 and MT rule 6 were rewritten to prevent, handed over one tab away. Round 2 filed this; round 3 it is structurally load-bearing.

Second-order, unstated: under DEC-27 an Owner's checklist offers companies the Owner is not a member of (member rule 2, "Owner sees every company"), so an Owner can grant a member access to a tenant whose data the Owner cannot read and whose duties he cannot audit — while member rule 3 forbids him granting it to himself. Coherent with the model, and nowhere acknowledged.

### DEC-28, delta save within the editor's visible set — PARTIALLY CLOSED

**The Owner case is coherent.** Owner's visible set is every company (member rule 2), so the delta degenerates to a full replace with no information loss. No special case needed.

**The zero-visible-companies member is genuinely unreachable, and I could not break it.** Member rule 1 restricts an Admin to members sharing at least one company; that shared company is by construction inside the Admin's visible set (rule 2). The intersection is never empty for a member the Admin can see, so "delta within the visible set" always has something to act on. Owner sees all members and all companies. This case is closed — say so.

**Where it breaks is rule 6, the fix's own companion.** "Validated against the member's **total** memberships, not the editor's visible subset" requires the client to learn something about memberships in companies member rule 2 forbids it from showing and cannot justify fetching. MT rule 6 states the governing principle in absolute terms — "must never return the name, **count**, or existence of a company the requester does not belong to." A validator that fetches the member's membership rows violates it by the letter. This is a third cross-company read that no rule authorizes, introduced by the rule written to close the second one. It is closable — an opaque server-side boolean, *"this member retains access elsewhere,"* discloses no company — but the spine must say that, because the obvious implementation is a `select` that leaks.

**And the blocked-removal message either lies or leaks.** If an Admin unticks a member's last visible company while the member holds another the Admin cannot see, rule 6 correctly allows it. If the member truly has no others, rule 6 blocks — and the Admin cannot be told why without disclosing the invisible set. No Voice and Tone line, no state row, no copy anywhere.

### DEC-29, company names unique (Rule 9) — PARTIALLY CLOSED

The rule is right and the rationale is right — empty states quote the name, so duplicates dissolve the disambiguation rule the whole State Patterns section rests on. What is missing is everything that makes it a fix rather than an intent: no enforcement layer named (DB constraint, trigger, or client check), no collision error state, no backfill for the rows that exist today, no rename semantics against a rule that says the name is quoted in every empty state and every technical-details payload.

These are the **exact five gaps round 2 filed against Rule 5's short code — all five of which are still open, verbatim.** So the pair now carries two uniqueness constraints, zero error treatments, against a form that today validates with `if (!form.name.trim()) { showToast(...) }` at `SettingsPage.tsx:745` and has no inline field-error pattern at all. Rule 5 additionally still has no requiredness statement and no backfill, while Component Patterns requires the badge to render always — a blank badge on every pre-existing company remains a legal outcome of following the spine to the letter.

### DEC-29, error never renders as empty — CLOSED

`EXPERIENCE.md:176-182`. Explicit precedence ("Error state takes precedence over empty state, always"), the rule extended to the case that actually bites ("an unresolved fetch is never treated as an empty one"), and the reasoning tied back to the two-month dead-Settings-page bug. A developer cannot read this and leave `if (error) { console.error(error); setLoading(false); return }` in place. Round-1 medium closed as prose. (`AllDutiesPage.tsx:297` is of course unchanged — that is implementation, not spine.)

It does not cover the third case, which 7a created after this paragraph was written: a read that is neither an error nor a genuine empty. Filed below.

### Access revoked mid-session — NOT CLOSED

Three independent defects in one added row.

1. **No detection mechanism.** Under 7a, revocation makes reads return nothing *silently*. The row asserts "his next request returns nothing. He must **not** see an empty table implying the company went quiet" — and supplies nothing by which the client learns that "nothing" means revoked. This is the round-1 high restated with a required outcome attached, which is the same shape as round 2's complaint about tab consistency. The mechanism exists and is one line away: MT rule 6's count query is membership-scoped and active-company-exempt, so it is the one query that can answer "am I still in this company?" Wire the reconciliation and this closes.
2. **It requires the screen the section below forbids.** "If he holds none, the same screen without the switcher" is a zero-company-access state. Eleven lines later: "**No 'zero company access' state exists, by design**." The round-1 rubric filed this exact contradiction against Flow 2; the round-2 fix reintroduced it in the state table.
3. **Its cross-reference is broken.** "rule 5 above makes it unreachable" now points at "Role changes are Owner-only." The guard is member rule 6, displaced when DEC-28 inserted the delta rule at position 4.

Point 2 is also simply true on the merits: `SettingsPage.tsx:574` still hard-deletes a team member, nothing states what that does to the auth user, so zero-access is reachable and the "by design" paragraph is the sentence that should go.

### DEC-30, two existing behaviours named for removal — PARTIALLY CLOSED

Both line citations verified exact. Naming them in the spine rather than only in the log is right, and the placement (a subsection of Multi-Tenancy Rules titled "Must be removed before any of this holds") is the correct file.

Two shortfalls:

- **Round 2 filed two defects at that site; the spine took one.** The `access_type: 'Owner'` insert is named. The `select('*').order('id').limit(1)` two lines above it — the Account tab loading *the first profile row in the table*, not the signed-in user's — is not named anywhere in either spine. Under Rule 7 that row now carries `active_company_id`, so the naive port gives every user in the deployment one shared active company, read from an arbitrary stranger's profile. That is a tenancy defect hiding in a surface the spine treats as out of scope.
- **Round 2 asked for a rule; the spine gave a to-do.** The requested fix was "`access_type` and `active_company_id` are never client-writable, stated in the same block as the member management rules." What landed is two line numbers and a note that 7a neutralises one of them. 7a covers `active_company_id`. **Nothing covers `access_type`.** Today's update at `:243` happens not to include it; no rule forbids a future one from doing so, and a self-service Owner grant is the same escalation the six member rules exist to prevent, one column over.

### DESIGN.md `brand-*` table — PARTIALLY CLOSED

The brand cell is now correct and the prose is unambiguous: 0 usages, 41 definition lines, "the comparison is 340 to nothing." Verified: `brand-*` appears zero times in any `.tsx`/`.ts` file and 41 times across exactly two files, both of which are `src/styles/`.

The same edit broke the other cell. Under a column headed **"Usages in application code,"** violet is given as "**340**, across 35 files." Measured: 340/35 is the all-file total, of which 24 occurrences in `tokens.css`/`global.css` are definitions. Application-code usage is **316 across 33 files**. The correction fixed the side round 2 complained about and introduced the identical error, mirrored, on the side it did not — in the same table, in the same pass.

And the retracted framing is still in the file: `DESIGN.md:214` reads "Reintroduce `brand-*` — **41 uses** against violet's 340." The Do's and Don'ts row was never updated. The conclusion is right and has been right since round 1; this is the third consecutive round in which the evidence presented for it is wrong.

## New collisions

### high — A revoked membership is indistinguishable from an empty table, and the fix for one created it (EXPERIENCE.md Rule 7a `:249-257`, State Patterns `:173`, `:176-182`, Rule 2 `:225-226`)

7a fails closed by returning nothing. Nothing, on the wire, is `[]` with no error — identical to a quiet morning. "Error never renders as empty" orders two cases; 7a introduced a third that is neither, and it renders as the second.

So Hassel, removed from South at 11pm, opens his overnight tab at 8am and reads **"No duties in Bluestar South for today."** That is the round-1 high verbatim, arriving through the round-2 security fix, on the surface the four-meanings table was written to protect. Rule 2 compounds it: the empty state must name its company, and when 7a fires there is no company to name — the client is holding a stale label for a scope it no longer has.

Fix, one sentence, pick either: the resolver raises a distinguishable error rather than returning null, or every fetch reconciles against the Rule 6 count query, which is already specified as membership-scoped and active-company-exempt and is therefore the one query that still answers correctly after revocation.

### high — Rule 8 needs an Owner; DEC-30 deletes the only way one exists (EXPERIENCE.md Rule 8 `:261-266`, "Must be removed" `:285-288`, Flow 2 step 1, IA `:55`)

Rule 8 closes the bootstrap deadlock by letting an Owner create a company and be joined to it. DEC-30 requires removing `SettingsPage.tsx:216`, the browser-side `access_type: 'Owner'` insert — today the only mechanism by which an Owner comes into existence — and specifies no replacement. Flow 2's invite needs an inviter. The Company chooser is "first sign-in only" and presupposes memberships. Rule 3 forbids self-grant.

Both fixes are individually correct. Together they produce a deployment with no first user. This is the third consecutive round in which a bootstrap gap survives by moving: round 2's was "an Owner cannot enter a company he created," round 3's is "there is no Owner." One sentence closes it — name a seed migration or a documented one-time server-side grant as the install step — but it has to be named, because the spine currently reads as though the removal has no successor.

### high — Only Owners may create companies, and the Companies surface never says so (EXPERIENCE.md `:32`, `:65`, `:108`, `:168`, Rule 8; DESIGN.md Components)

Detailed under Rule 8. Filed separately because it is a *placement* defect with a security consequence: the constraint exists in two locations, neither of which is the Companies surface spec, and the rule that makes creation grant tenant access does not restate it. "Admins do not see the control" is a hide instruction, not an authorization requirement, and the spine nowhere requires a server-side check on company insert.

### high — Settings → Companies is still ungated, and DEC-27 made it structural (EXPERIENCE.md `:65`, `:168`; member rule 2 `:117-118`; Rule 6 `:239-245`)

Third round, unchanged. The IA row carries no role note; the Permission-denied row gates *Companies create*, not the Companies list; `CompaniesTab` still `select('*')`. An Admin reading that tab receives every company's name, short code, phone, email, GSTIN, CIN and service tax number — the roster member rule 2 and MT rule 6 were both rewritten to withhold from that same Admin.

Round 2 filed it as a residual. DEC-27 has since made "the management list shows every company" a designed property of the model, which means the isolation story now *depends* on that surface being Owner-gated, and it still is not — in the IA table a consumer builds from.

### medium — The zero-company-access state is required and forbidden eleven lines apart (EXPERIENCE.md `:173` vs `:184-185`; DEC-17; `SettingsPage.tsx:574`)

The new Access-revoked row specifies the screen ("if he holds none, the same screen without the switcher"). The paragraph below says it does not exist by design. Member rule 6 and DEC-17 side with the paragraph; `SettingsPage.tsx:574`'s hard member delete, with nothing stated about the auth user, sides with the row.

This is the round-1 rubric high (Flow 2's failure path versus DEC-17), closed in round 2 by deleting the flow line, reintroduced in round 3 by the state row. Same contradiction, third location.

### medium — Four broken cross-references, all introduced by this pass (EXPERIENCE.md `:39`, `:122`, `:184`, `:265`)

| Pointer | Lands on | Should be |
|---|---|---|
| Foundation `:39` — "Creating a company grants that membership automatically — see Multi-Tenancy Rule 9" | Rule 9, company-name uniqueness | Rule 8 |
| Member rule 3 `:122` — "create a company, which auto-joins you (Rule 9)" | Rule 9 | Rule 8 |
| State Patterns `:184` — "rule 5 above makes it unreachable" | Member rule 5, "Role changes are Owner-only" | Member rule 6 |
| Rule 8 `:265` — "rule 3 plus Companies-is-edit-only (rule 4)" | mixes member-rule and MT-rule namespaces in one sentence | disambiguate |

Individually trivial. Collectively they are the direct evidence for this round's thesis: DEC-25 and DEC-29 were written without reading each other, and DEC-28's renumbering was applied without grepping for the numbers it moved.

### medium — Auto-join is irreversible for a sole Owner (Rule 8 `:261-266` + member rule 3 `:120-122` + MT rule 4 `:227-232` + member rule 7 `:136-137`)

Yash creates a company and is joined to it. He cannot untick his own row (rule 3, "every role including Owner"). There is no second Owner (member rule 6 supports single-Owner deployments; DEC-12 makes Yash the sole Owner). The company cannot be deleted (rule 4). His membership set only grows, forever, and his switcher popover — the product's designated dashboard — accumulates every company he has ever opened. Not a hole, but a permanent one-way ratchet on the protagonist Settings is designed for, and nobody has said it out loud.

### medium — An Owner can grant access he cannot audit (Foundation `:35-39` + member rule 2 `:117-118` + Rule 6 `:239-245`)

Under DEC-27, an Owner's membership set is a strict subset of all companies while his checklist offers all of them. So he may grant Hassel access to a company whose duties he cannot read, whose empty states he will never see, and which does not appear in his own switcher — and rule 3 forbids him from granting it to himself to check. Internally consistent with DEC-27; unacknowledged anywhere; and it means "Owner" no longer implies "can verify the consequences of an Owner action."

### low — The violet cell is now wrong in the direction the brand cell used to be (DESIGN.md `:101-108`, `:214`)

Detailed above. 340/35 under a column headed "Usages in application code"; the real figure is 316/33. And `:214` still carries "41 uses against violet's 340," the framing `.decision-log.md`'s own correction block retracts.

## Surviving findings from rounds 1–2

| Finding | Status at round 3 |
|---|---|
| **critical (r1)** — Member drawer self-service escalation | **Closed.** Rules 1–7 hold under interrogation; the delta rule closes the last remnant. Residual leaks are in rule 6's validator and the Companies tab, filed above. |
| **critical (r1)** — Rule 7 count-query leak | **Closed** since round 2. Unchanged and still tight. |
| **critical (r1)** — Where the active company lives / re-verification | **Closed on the security half** by 7a. Two residuals: the null-vs-Rule-1 contradiction, and 7a's silence. |
| **critical (r1)** — Badge renders "B" | **Closed** since round 2. |
| **critical (r1)** — brand claim false | **Closed** on substance; presentation defect mirrored onto violet. |
| **critical (r2)** — Owner cannot join a company | **Closed** by Rule 8, and replaced by "no Owner exists" (new high). |
| **critical (r2)** — Partial checklist + whole-row save revokes silently | **Closed** by member rule 4. |
| **critical (r2)** — Browser self-provisions an Owner | **Partially closed.** The insert is named; the `order('id').limit(1)` profile read at the same site is not, and no rule makes `access_type` non-client-writable. |
| **high (r1)** — Customers are "the single shared exception" | **Survives untouched, third round.** `EXPERIENCE.md:25` verbatim. `grep -i customer` over `.decision-log.md` returns exactly one hit — line 127, inside DEC-4's narration of Hassel's morning. Still no DEC, no rationale, no statement of what is shared. This is now the oldest open finding in the pair and the largest remaining hole in the isolation model. |
| **high (r1)** — Member delete → live JWT, zero access | **Survives.** `SettingsPage.tsx:574` unchanged; nothing states what deletion does to the auth user. Now also contradicts the new Access-revoked row. |
| **high (r1)** — Access revoked mid-session | **Not closed.** Row added; unimplementable, self-contradicting, broken pointer. See above. |
| **high (r1)** — Switching never navigates vs 143 untouched sites | Closed as a contradiction by Rule 10. **Cost still unscoped:** 146 `.from('` sites across 24 files verified; `AllDutiesPage.tsx:317` named, `:333` (`fetchMore`, same omission, 16 lines down) still unnamed; `offsetRef.current` / `hasMore` / the sentinel observer still unmentioned. |
| **high (r1)** — Role model disagrees with code | **Survives.** "Manager and Staff are cut" is still not a migration. The delta note still says "its `CHECK` constraint" singular against three role columns (`user_profiles.access_type`, `team_members.role`, and the free-text `user_profiles.role`). New-member default is still `role: 'Staff'` at `:386`. |
| **high (r1)** — Rule 3 rests on a non-unique free-text field | **Partially closed** by Rule 9. Enforcement, collision copy, backfill and rename semantics all unspecified. |
| **high (r2)** — Short code has no collision/backfill/requiredness/edit/case rules | **Survives untouched.** All five gaps verbatim, and Rule 9 now replicates them. |
| **high (r2)** — Tab consistency is a requirement, not a mechanism | **Survives untouched.** `:294-304` unchanged. No push mechanism named (realtime / `BroadcastChannel` / `storage` / polling), and the propagation window between the write in tab A and the notice in tab B is still unbounded while `:304` asserts stale rows never appear under a new label. |
| **high (r2)** — Rule 6 redefines Owner scope vs Foundation | **Closed** by DEC-27, cleanly. |
| **medium (r1)** — Concurrent member edits re-grant access | **Closed** by member rule 4. |
| **medium (r1)** — Drawer a11y vs WCAG 2.2 AA | **Survives untouched.** `Drawer.tsx` re-read at round 3: no focus trap, no initial focus, no focus return, no `role="dialog"`/`aria-modal`, root always mounted so closed drawers keep their controls in tab order, and a bare `document.addEventListener('keydown')` at `:19-25` that makes `EXPERIENCE.md:214`'s "Esc closes the **topmost** drawer or popover" unimplementable. `DESIGN.md:177` still lists it do-not-restyle. |
| **medium (r1)** — Error and empty are unordered | **Closed** in prose (DEC-29). |
| **medium (r1)** — Rule 5 delete instruction | **Closed** since round 2. |
| **medium (r1)** — Invite has no state model | **Survives.** No pending/accepted/expired state on the Team members list; no mapping between `team_members`, `user_profiles`, `auth.users` and memberships; `team_members.email` still `string \| null` (`:20`) with no "required" statement, while being the identity. |
| **medium (r1)** — H-1 deferred without instrumentation | **Survives.** `:306-313` identical; the three signals are still unperformable with hard deletes and no `created_by`. Still internally inconsistent — Tab consistency says this failure arrives *deterministically* seven lines above the Watch item calling it an unvalidated hypothesis not designed for. |
| **medium (r2)** — Hidden vs disabled | **Survives.** `:168` "do not see Owner-only controls **at all**" vs member rule 5 "the role control is **disabled** for Admins." Two postures, still both committed. |
| **medium (r2)** — Active company null during the chooser | **Survives, compounded.** Rule 1 unchanged; 7a now produces the same null in normal operation. |
| **medium (r2)** — Flow 2 points at a resend control no spec defines | **Survives.** `:350` "Yash reissues from the member drawer"; the member drawer row lists name, email, role, checklist, and the seven rules cover no resend. |
| **medium (r2)** — `.decision-log.md` / `CLAUDE.md` undeclared as sources | **Survives.** Neither appears in either `sources:` block. `CLAUDE.md` is cited four times in DESIGN.md including two normative supersessions; DEC numbers are cited five times in EXPERIENCE.md, one of them a hard dependency (`:313`, "three candidate mechanisms are preserved in `.decision-log.md`"). |
| **low (r1)** — Switcher popover has no states | **Survives.** No loading, no failure treatment for the counts. Zeroes still read as a quiet morning on the product's designated dashboard. |
| **low (r1)** — Duty count window undefined | **Survives.** "total duty count" (`:102`) against Flow 1's morning-scan numbers and Flow 2's brand-new user. |
| **low (r1)** — Settings sub-surfaces are component state | **Survives.** `useState<Tab>('account')` at `:1057`; `:174`'s "preserving the intended destination" still cannot restore a tab. |
| **low (r2)** — "BS" collides with the rail avatar | **Survives.** `AppShell.tsx:72` renders the literal string `BS` in `text-violet-700` on `bg-violet-100`; the badge is specified `violet-700` on `violet-50` in the same 80px rail; DEC-19's suggested default for Bluestar South is `BS`. Neither spine mentions the avatar exists. |
| **low (r2)** — Popover active row is a dot with no announced equivalent | **Survives.** No `aria-current`, no text marker. |
| **low (r2)** — Login has no behavioural row | **Survives.** Component Patterns carries eight rows and none is Login. |
| **rubric** — `rounded` block mints pixels | **Closed.** Now references `radius-lg`/`radius-xl` by token name. |
| **rubric** — `typography.page-title` mints 30px | **Survives.** Still `fontSize: 30px` against `--font-size-display-sm` at `tokens.css:410`, two lines under a comment reading "No overrides." |
| **rubric** — no contrast target in DESIGN.md | **Survives.** Zero occurrences of "contrast" or "WCAG" in the file, while `EXPERIENCE.md:205` points at it for exactly that. |
| **rubric** — unresolvable bare strings in `components` | **Survives.** `background: white`, `gray-100`, `gray-50`. |
| **rubric** — "desktop-first responsive" with no breakpoint | **Survives.** `:19`, no minimum width anywhere against a fixed 80px + 208px shell. |
| **rubric** — Rule 2 absolute vs non-company-scoped Settings surfaces | **Survives.** "Every empty state names its company," unqualified, against Settings → Companies and Team members. |
| **rubric** — Billing IA row unqualified | **Survives.** `ux-backlog.md` lists Billing → Invoices and Receipts as "Coming soon" stubs under "Entire Sections Unbuilt"; the IA lists them as live surfaces. |

## Factual verification

Measured against the working tree on 2026-08-03.

| Claim | Verdict |
|---|---|
| `SettingsPage.tsx:216` inserts `access_type: 'Owner'` from the browser | **True**, exactly line 216 |
| `SettingsPage.tsx:243` updates the profile row client-side | **True**, exactly line 243 (`.from('user_profiles')` at 242) |
| The Account tab loads the *first* profile row by id, not the signed-in user's | **True** — `.select('*').order('id').limit(1).maybeSingle()` at 207-211. **Named in neither spine.** |
| `brand-*`: 0 usages in application code, 41 definition lines | **True.** 0 in any `.tsx`/`.ts`; 41 across exactly `src/styles/tokens.css` and `src/styles/global.css` |
| `violet-*`: "**340**, across 35 files" under "Usages in application code" | **False as labelled.** 340/35 is the all-file total. Application code is **316 across 33 files**; the other 24 are definitions in those same two CSS files |
| `DESIGN.md:214` still reads "41 uses against violet's 340" | **True** — the retracted framing survives in Do's and Don'ts |
| `AllDutiesPage.tsx:317` deps `[statusFilter, search, dateRange]` | **True**, exactly. `fetchMore` at `:333` carries `[loading, loadingMore, hasMore, statusFilter, search, dateRange]` — same omission, still unnamed |
| Company hard `DELETE` at `SettingsPage.tsx:949` | **True** |
| Member hard `DELETE` at `SettingsPage.tsx:574` | **True** |
| Company name validated only by `!form.name.trim()` at `:745` | **True** (member name likewise at `:429`) — toast-based, no inline field error anywhere |
| `TeamRole` declares four roles at `:15`; new-member default `'Staff'` at `:386` | **True** |
| `team_members.email` is `string \| null` at `:20` | **True** |
| Settings tabs are `useState<Tab>('account')` at `:1057` | **True** |
| `Drawer.tsx` has no focus trap, no `role="dialog"`, root always mounted | **True** — file unchanged since round 1 |
| `AppShell.tsx:72` renders `BS` in `text-violet-700` on `bg-violet-100` | **True** |
| 146 `.from('` call sites across 24 files | **True** |
| Foundation `:39` and member rule 3 `:122` cite "Rule 9" for auto-join | **False** — auto-join is Rule 8; Rule 9 is name uniqueness |
| State Patterns `:184` cites "rule 5 above" for the ≥1-company guard | **False** — that is member rule 6; rule 5 is "Role changes are Owner-only" |
| A decision exists for customers-as-shared-exception | **False** — one `customer` hit in the entire log, line 127, inside DEC-4's narration |
| DESIGN.md states a contrast target | **False** — zero "contrast"/"WCAG" content |
| `.decision-log.md` or `CLAUDE.md` declared in either `sources:` block | **False** — neither, in either file, while cited 5 and 4 times respectively |
| `ux-backlog.md` lists Billing → Invoices/Receipts as "Coming soon" stubs | **True** |

## Bottom line

**More prose is the right tool for exactly four things, and then it stops being the right tool.**

The tenancy boundary as specified is now sound. I attacked Rule 7a, Rule 8, the delta rule and DEC-27 from every angle the brief named and could not find a path by which a user reads or writes a tenant they do not belong to — which is a sentence I could not write after round 1 or round 2. The remaining highs are not boundary failures; they are a missing authorization clause, a missing bootstrap step, a surface that was never gated, and a silent failure mode. All four fit in about fifteen lines:

1. Rule 8 gains "only an Owner may create a company, enforced server-side."
2. The Companies IA row and the Permission-denied row gate the **list**, not just create.
3. The Access-revoked row names its detection mechanism — reconcile against the Rule 6 count query — and the "no zero-access state exists" paragraph is deleted, because member delete makes it reachable.
4. DEC-30 names what replaces the Owner factory it removes.

Plus the cheap hygiene: three renumbered cross-references, Rule 1 reworded as a UX invariant that cedes the server-side null, member rule 6's validator specified as an opaque boolean, the violet cell corrected, and `:214` brought in line with its own correction.

**Everything else on the surviving list should stop being reviewed and start being tested.** The propagation window, 146 fetch sites plus `offsetRef`/`hasMore` reset, `Drawer`'s focus management, the `team_members` ↔ `user_profiles` ↔ `auth.users` mapping, the Manager/Staff migration, short-code backfill, H-1 instrumentation — three rounds of prose have not closed any of them, and a fourth will not, because none of them is a specification ambiguity. They are implementation decisions with correct answers that a test can assert and a paragraph cannot. Concretely, the tests that matter more than any further revision:

- a null `current_company_id()` returns zero rows under **every** policy, not just the one the developer was thinking about;
- `insert into companies` as an Admin is rejected server-side, not merely hidden;
- a delta save by an Admin preserves a membership in a company the Admin cannot see;
- a revoked membership produces a signal the client can distinguish from an empty result set;
- writing `access_type` or `active_company_id` from a browser payload changes nothing.

The honest summary: this went from "the spine describes a UI beside a security boundary" to "the spine describes the boundary correctly and has four gaps in the fence around it." Close those four, fix the cross-references, and hand it to implementation. A round 4 of the same kind would be reviewing prose about problems that only code can answer, and would find less than this one did.
