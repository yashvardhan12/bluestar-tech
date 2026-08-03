# Bluestar UX Gap Backlog
_Captured: 2026-06-09_

## 🔴 Critical — Stubbed Features (No-ops)

| Feature | Location | Notes |
|---|---|---|
| Print Duty Slip | AllDutiesPage, BookingDetailPage, DutyDrawer | Handler is `() => {}` — daily driver op |
| Send to Driver | BookingDetailPage | Handler is `() => {}` — no driver comms |
| Fetch Pricing from Contract | AddBookingDrawer, DutyDrawer | User must manually type pricing every time |
| View Duty Logs | AttendancePage | Handler is `() => {}` — attendance blind without history |
| Edit Duty Slip / Preview Slip | BookingDetailPage | Handlers are `() => {}` |

## 🔴 Critical — Entire Sections Unbuilt

| Section | Status |
|---|---|
| Billing → Invoices | "Coming soon" stub |
| Billing → Receipts | "Coming soon" stub |

## 🔴 Critical — Broken Data

| Issue | Location |
|---|---|
| Hardcoded dates `"12/06/2024 to 18/06/2024"` | BookingDetailPage line 398 |
| Distance column shows `"—"` | VehicleAvailabilityPage, EfficiencyPage |
| Car Avg (km/L) shows `"—"` | VehicleAvailabilityPage, EfficiencyPage |

## 🟡 Important — Incomplete Interaction Loops

| Issue | Location |
|---|---|
| Fuel date locked to today — can't backfill past entries | FuelPage drawer |
| "Repeat expense" checkbox exists but has no logic | PayrollPage + GeneralExpensesPage |
| Loans page is read-only — no way to add a loan | LoansPage |
| Edit button visible with no handler | BookingDetailPage line 410 |
| Invoice generation navigates to detail page instead of generating | AllBookingsPage |

## 🟡 Important — Missing Feedback States

| Issue | Scope |
|---|---|
| No loading skeletons on tables | Most pages |
| No error states or retry patterns | All Supabase fetch points |
| No "no vehicles available" state in AllotDrawer | AllotDrawer |
| Loading state missing during fuel approve action | FuelPage |

## 🟢 Polish — UX Friction

| Issue | Location |
|---|---|
| "Drivers Attendance and Payroll" nav label too long | AppShell sidebar |
| Billing uses left sub-nav; all others use horizontal tabs | AppShell |
| Company accordion resets state on every drawer reopen | SettingsPage |
| View vs Edit drawer modes not visually differentiated | GeneralExpensesPage |

## Prioritisation (suggested)
1. **Billing** — invoices + receipts (unblocks the booking-to-billing loop)
2. **Duty Slip** — print/send (daily driver op, blocks field operations)
3. **Fetch from Contract** — pricing in booking/duty drawer (saves repetitive data entry)
4. **Fuel efficiency calculations** — wire up distance + avg columns (data already exists)
5. **Missing states** — loading skeletons + error/retry patterns (polish pass)
