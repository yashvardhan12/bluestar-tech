import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import { AuthProvider, useAuth } from './lib/auth'
import { isDriverSession } from './lib/driver'
import LoginPage from './pages/auth/LoginPage'
import DriverLoginPage from './pages/driver/DriverLoginPage'
import DriverApp from './pages/driver/DriverApp'
import DatabaseLayout from './layouts/DatabaseLayout'
import VehicleTrackerLayout from './layouts/VehicleTrackerLayout'
import DriverAttendanceLayout from './layouts/DriverAttendanceLayout'
import BillingLayout from './layouts/BillingLayout'
import { ToastProvider } from './components/ui/Toast'

import DutyTypesPage           from './pages/database/DutyTypesPage'
import VehicleGroupsPage       from './pages/database/VehicleGroupsPage'
import CustomersPage           from './pages/database/CustomersPage'
import DriversPage             from './pages/database/DriversPage'
import VehiclesPage            from './pages/database/VehiclesPage'
import BankAccountsPage        from './pages/database/BankAccountsPage'
import TaxesPage               from './pages/database/TaxesPage'
import AllowancesPage          from './pages/database/AllowancesPage'
import FastagPage              from './pages/database/FastagPage'

import AllBookingsPage         from './pages/bookings/AllBookingsPage'
import AllDutiesPage           from './pages/bookings/AllDutiesPage'
import BookingDetailPage       from './pages/bookings/BookingDetailPage'
import DutySlipPrintPage       from './pages/bookings/DutySlipPrintPage'

import InvoicesPage            from './pages/billing/InvoicesPage'
import CreateInvoicePage       from './pages/billing/CreateInvoicePage'
import ReceiptsPage            from './pages/billing/ReceiptsPage'

import AttendancePage          from './pages/driver-ops/AttendancePage'
import PayrollPage             from './pages/driver-ops/PayrollPage'

import ExpensePage             from './pages/vehicle-expenses/GeneralExpensesPage'
import FuelPage                from './pages/vehicle-expenses/FuelPage'
import LoansPage               from './pages/vehicle-expenses/LoansPage'
import AveragePage             from './pages/vehicle-expenses/EfficiencyPage'

import VehicleAvailabilityPage from './pages/availability/VehicleAvailabilityPage'
import SettingsPage             from './pages/settings/SettingsPage'

function Loading() {
  return <div className="flex items-center justify-center h-screen text-sm text-gray-400">Loading…</div>
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  // The operator shell must not render for a driver session. A driver does get
  // a `profiles` row, but never a `company_members` one, so `current_company_id()`
  // is null and every company-scoped policy returns zero rows — the operator
  // pages would load empty and look broken rather than forbidden.
  if (isDriverSession(session)) return <Navigate to="/driver" replace />
  return <>{children}</>
}

/** …and the reverse: an operator who lands on /driver has no driver record,
 *  so every list would be empty for reasons the screen cannot explain. */
function RequireDriver({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <Loading />
  if (!session) return <DriverLoginPage />
  if (!isDriverSession(session)) return <Navigate to="/" replace />
  return <>{children}</>
}

function AuthedApp() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<Navigate to="/bookings/duties" replace />} />

          {/* Database — nested layout with horizontal tab bar */}
          <Route path="/database" element={<DatabaseLayout />}>
            <Route index element={<Navigate to="duty-types" replace />} />
            <Route path="duty-types"     element={<DutyTypesPage />} />
            <Route path="vehicle-groups" element={<VehicleGroupsPage />} />
            <Route path="customers"      element={<CustomersPage />} />
            <Route path="drivers"        element={<DriversPage />} />
            <Route path="vehicles"       element={<VehiclesPage />} />
            <Route path="bank-accounts"  element={<BankAccountsPage />} />
            <Route path="taxes"          element={<TaxesPage />} />
            <Route path="allowances"     element={<AllowancesPage />} />
            <Route path="fastag"         element={<FastagPage />} />
          </Route>

          {/* Bookings */}
          <Route path="/bookings/all"         element={<AllBookingsPage />} />
          <Route path="/bookings/duties"      element={<AllDutiesPage />} />
          <Route path="/bookings/:bookingId"  element={<BookingDetailPage />} />

          {/* Billing — nested layout with horizontal tab bar. Create invoice
              sits outside it: that page carries its own full-width header. */}
          <Route path="/billing" element={<BillingLayout />}>
            <Route index element={<Navigate to="invoices" replace />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="receipts" element={<ReceiptsPage />} />
          </Route>
          <Route path="/billing/invoices/create"           element={<CreateInvoicePage />} />
          <Route path="/billing/invoices/:invoiceId"       element={<CreateInvoicePage />} />
          <Route path="/billing/invoices/:invoiceId/edit"  element={<CreateInvoicePage />} />

          {/* Drivers Attendance and Payroll — nested layout with horizontal tab bar */}
          <Route path="/driver-attendance-payroll" element={<DriverAttendanceLayout />}>
            <Route index element={<Navigate to="attendance" replace />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="payroll"    element={<PayrollPage />} />
          </Route>

          {/* Vehicle Tracker — nested layout with horizontal tab bar */}
          <Route path="/vehicle-tracker" element={<VehicleTrackerLayout />}>
            <Route index element={<Navigate to="expense" replace />} />
            <Route path="expense" element={<ExpensePage />} />
            <Route path="fuel"    element={<FuelPage />} />
            <Route path="loans"   element={<LoansPage />} />
            <Route path="average" element={<AveragePage />} />
          </Route>

          {/* Availability */}
          <Route path="/availability/vehicles" element={<VehicleAvailabilityPage />} />

        {/* Settings */}
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <ToastProvider>
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* One route tree, one Supabase client, one deploy — not a second app.
            The two shells never render together. */}
        <Route path="/driver/*" element={<RequireDriver><DriverApp /></RequireDriver>} />
        {/* The printed slip renders outside AppShell: it is a document, and a
            sidebar has no business on one. Still behind RequireAuth — RLS
            scopes it, but an anonymous URL should not reach a customer's slip. */}
        <Route path="/duties/:dutyId/slip"      element={<RequireAuth><DutySlipPrintPage /></RequireAuth>} />
        <Route path="/bookings/:bookingId/slips" element={<RequireAuth><DutySlipPrintPage /></RequireAuth>} />
        <Route path="/*" element={<RequireAuth><AuthedApp /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
    </ToastProvider>
  )
}
