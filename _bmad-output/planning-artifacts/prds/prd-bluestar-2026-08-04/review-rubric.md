# PRD Quality Review — Blue Star Driver PWA

Rubric walk against `assets/prd-validation-checklist.md`. Stakes treated as
**launch / chain-top** (feeds architecture → epics), brownfield, multi-stakeholder.

## Overall verdict

The PRD has a genuine thesis — *"the duty slip stops being paper"* — and the
features follow from it rather than sitting beside it. The NFRs are unusually
product-specific (gloves, sunlight, the 5:30am spinner) and §8's brownfield
consequences give architecture a real starting point. It is weakest where
downstream work will lean hardest: roughly a dozen FRs use unbounded language
that story creation will have to invent thresholds for, and there is no Glossary
despite this being a jargon-dense domain feeding two downstream workflows.

## Decision-readiness — adequate

§9 states decisions as decisions and attaches revisit triggers, which is better
than most PRDs manage. The PIN trade is named honestly: a weak keyspace accepted
*in exchange for* one-handed sign-in in a parking garage. §10's six questions are
genuinely open — none has its answer hiding in the next sentence.

The gap is that the PRD's sharpest internal tension never appears in the PRD.
FR-16 (drivers never see rates) and FR-34 (drivers write expenses) collide,
because `base_rate` sits on the same `duties` row as the operational fields a
driver needs. That tension is discussed in `addendum.md` but a reader of
`prd.md` alone would not know the two requirements pull against each other.

### Findings
- **high** Unflagged requirement tension (§6 F2/F4) — FR-16 and FR-34 conflict at the data layer; nothing in `prd.md` says so. *Fix:* add a `[NOTE FOR PM]` at FR-16 naming the tension and pointing at the addendum.

## Substance over theater — strong

No persona section, and rightly — persona context rides inline in the UJs where
it does work. The Vision could not be swapped into another PRD: "the duty slip
stops being paper" is this product and no other. NFRs name real conditions
rather than reciting "scalable, secure, reliable."

### Findings
- **low** Accessibility paragraph partly generic (§7) — "Text scales with system settings. Contrast meets AA" is boilerplate; the colour-alone clause is not. *Fix:* keep the specific clause, bound the rest or cut it.

## Strategic coherence — adequate

The thesis holds and the metrics validate it rather than measuring activity.
Counter-metrics are pointed — "support calls from drivers" is the right thing to
watch, because it catches the failure mode where the app ships and drivers keep
phoning anyway.

What's missing is priority. Sixty-five FRs arrive flat. If the build runs long,
nothing in this document says what gets cut, and the answer is not obvious:
fuel entries (FR-39) and the offline queue (FR-45–52) are wildly different in
both cost and consequence, and nothing ranks them.

### Findings
- **high** No prioritisation within v1 (§6) — 65 FRs, no ordering, no must/should split. *Fix:* mark the spine that makes the loop work at all versus what can follow; F6 and F4's fuel half are the obvious candidates to sequence.

## Done-ness clarity — thin

This is the weakest dimension and the one story creation will lean on hardest.
Many FRs are properly testable — FR-29 (end must exceed start), FR-19 (both
reading and photo required), FR-21 (marks attendance `P`), FR-31 (one signature,
one pair). But a significant minority state an intention without a bound, and an
engineer would have to invent the number.

### Findings
- **critical** Unbounded thresholds across F1/F3/F6 — FR-3 "long-lived" (how long?), FR-5 "rate-limited" (how many, what window?), FR-32 "far ahead of its reporting time" (how far?), FR-52 "surfaced" (how?). *Fix:* supply a concrete value for each, even if provisional.
- **high** Untestable phrasing (§6 F2, F7) — FR-17 "treated as a first-class design" and FR-58 "can see which duties are missing driver data" have no verifiable condition. *Fix:* restate as observable behaviour.
- **medium** Unbounded NFRs (§7) — "enough resolution for a disputed reading to be settled" and "renders from cache immediately" need numbers. *Fix:* give a minimum resolution and a millisecond target.

## Scope honesty — adequate

§4 splits in and out explicitly, §11 defers, §9 records what was knowingly
accepted. Omissions are stated, not left to inference.

One inference is unmarked. FR-23 requires a reason on no-show; the user never
asked for that and the Figma has the button with no follow-through. It was
raised in conversation but carries no tag in the document, so a reader cannot
tell it apart from a confirmed requirement.

Open-items density is moderate — six OQs against a green-light PRD is
acceptable, but OQ-1 is a genuine phase-blocker and should not ride into
architecture unanswered.

### Findings
- **high** Unmarked inference (§6 F3) — FR-23's reason requirement was never confirmed. *Fix:* tag `[ASSUMPTION]` and add an Assumptions Index.
- **medium** OQ-1 is a blocker in a flat list (§10) — abandoned-duty reconciliation is load-bearing for FR-54 and reads as one of six equals. *Fix:* mark it blocking.

## Downstream usability — thin

FR IDs run FR-1 to FR-65 with no gaps or duplicates; UJ-1 to UJ-5 each carry
Ramesh as protagonist; OQ-1 to OQ-6 resolve. Sections stand alone reasonably
well.

The absence of a Glossary is the problem. This PRD feeds both architecture and
epics, and the domain is dense with terms that are not self-evident: *duty*
versus *booking*, *allotment*, *duty slip*, *reporting time*, *garage start*,
*outstation*, *P2P* and *GTG*. A downstream agent extracting from this will
guess, and "duty" versus "booking" is exactly the pair it will get wrong.

### Findings
- **high** No Glossary (document-wide) — jargon-dense brownfield domain feeding two downstream workflows. *Fix:* add a Glossary; define duty, booking, allotment, duty slip, reporting time, garage start, outstation at minimum.

## Shape fit — strong

Correctly shaped. Multi-stakeholder with meaningful UX, so UJs are load-bearing
and present. Brownfield handled well: §8 states consequences for existing code
rather than pretending a greenfield, and the code references
(`invoice.ts` summing `base_rate`, `bookingStatus.ts` inferring from the clock,
`duties` scoped through `bookings`) match the verified schema facts in
`project-context.md`. Not over-formalised — no UJ padding, no ceremonial
sections.

## Mechanical notes

- **Glossary:** absent. See Downstream usability.
- **ID continuity:** FR-1–65 contiguous and unique; group sizes 7/11/15/7/4/8/6/7 reconcile. UJ and OQ sequences clean.
- **Assumptions Index:** absent, and needed once FR-23 is tagged.
- **UJ protagonists:** consistent — Ramesh carries all five, context inline.
- **Cross-references:** §8 and §9 refer to FRs by number and all resolve.
- **Terminology drift:** "duty slip" appears in §1 and the addendum but never in the FRs, where the same artifact is described in parts. Minor, but a Glossary entry would bind it.
