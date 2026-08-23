---
name: Close Duty
description: Visual specification for operator-side duty closure. Inherits the Bluestar identity wholesale; records only the delta this surface introduces — the locked-field treatment that separates driver-captured evidence from operator-entered figures.
status: final
updated: 2026-08-23
inherits: ../ux-bluestar-2026-07-31/DESIGN.md (Untitled UI via src/styles/tokens.css)
sources:
  - ../../prds/prd-bluestar-2026-08-04/prd.md
  - ./mockups/close-duty-wireframe.html
colors:
  # Nothing new. Named here only because this surface leans on three tokens
  # in ways the parent spine does not describe.
  accent: violet-600 (#7839ee)     # primary action, evidence chips, Correct links
  locked-ground: gray-25 (#fcfcfd) # driver-captured block — see Shapes
  caution: warning-500 (#f79009)   # base-rate close, backwards-reading field
typography:
  # Inherited unchanged. Inter throughout; JetBrains Mono is not used here.
  figures: tabular-nums            # every odometer reading, time and computed total
rounded:
  card: 12px                       # locked block, consequence panel
  input: 8px
  chip: 6px
components:
  - locked-field-block             # NEW — the only component this surface adds
  - consequence-panel              # NEW — live computed preview
  - modal                          # 640px centred, inherited shell
---

# Close Duty — Design Delta

This surface introduces no colours, no type scale and no spacing values. It inherits
the Bluestar spine entirely. Two components are new, and both exist to make one
distinction visible at a glance: **what the driver captured, versus what the operator
typed.**

## Shapes

**The locked block is a different material, not a disabled form.** Driver-captured
figures sit on `gray-25` inside a `gray-200` border with a `gray-50` header, with no
input chrome at all — no field borders, no shadows, nothing that suggests a cursor.
A greyed-out input reads as *temporarily unavailable*; a distinct surface reads as
*belongs to someone else*. That is the intended message, and it is the whole reason
the component exists rather than reusing a disabled `Field`.

Operator-entry fields keep the standard Untitled UI input treatment — white ground,
`gray-300` border, the `0 1px 2px` shadow — so the eye separates the two regions
before reading a word.

## Elevation & Depth

The modal takes the inherited `0 18px 44px -14px rgba(16,24,40,.34)`. Nothing inside
it is elevated. The locked block sits *lower* than the page ground rather than
raised — recessed, finished, not awaiting input.

## Do's and Don'ts

- **Do** use `tabular-nums` on every figure. Odometer readings are compared against
  each other constantly; proportional digits make 45,120 and 45,090 hard to scan.
- **Do** keep the evidence chip beside the figure it belongs to, never in a separate
  column. A photograph is only meaningful as a property of a specific reading.
- **Don't** show rupee amounts on this surface. The consequence panel reports
  distance, duration and allowance quantities — never money. Pricing belongs on the
  duty slip and the invoice; putting it here turns transcription into negotiation.
- **Don't** use `error-*` for the base-rate close. It is a specified, legitimate
  outcome (FR-59), so it takes `warning-*`. Red would tell the operator they had done
  something wrong when they had done the only correct thing available.
