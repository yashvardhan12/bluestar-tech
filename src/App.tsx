import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import DatabaseLayout from './layouts/DatabaseLayout'

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

import InvoicesPage            from './pages/billing/InvoicesPage'
import ReceiptsPage            from './pages/billing/ReceiptsPage'

import AttendancePage          from './pages/driver-ops/AttendancePage'
import PayrollPage             from './pages/driver-ops/PayrollPage'

import GeneralExpensesPage     from './pages/vehicle-expenses/GeneralExpensesPage'
import FuelPage                from './pages/vehicle-expenses/FuelPage'
import LoansPage               from './pages/vehicle-expenses/LoansPage'
import EfficiencyPage          from './pages/vehicle-expenses/EfficiencyPage'

import VehicleAvailabilityPage from './pages/availability/VehicleAvailabilityPage'
import DriverAvailabilityPage  from './pages/availability/DriverAvailabilityPage'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route index element={<Navigate to="/database/duty-types" replace />} />

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
          <Route path="/bookings/all"    element={<AllBookingsPage />} />
          <Route path="/bookings/duties" element={<AllDutiesPage />} />

          {/* Billing */}
          <Route path="/billing/invoices" element={<InvoicesPage />} />
          <Route path="/billing/receipts" element={<ReceiptsPage />} />

          {/* Driver Ops */}
          <Route path="/driver-ops/attendance" element={<AttendancePage />} />
          <Route path="/driver-ops/payroll"    element={<PayrollPage />} />

          {/* Vehicle Expenses */}
          <Route path="/vehicle-expenses/general"    element={<GeneralExpensesPage />} />
          <Route path="/vehicle-expenses/fuel"       element={<FuelPage />} />
          <Route path="/vehicle-expenses/loans"      element={<LoansPage />} />
          <Route path="/vehicle-expenses/efficiency" element={<EfficiencyPage />} />

          {/* Availability */}
          <Route path="/availability/vehicles" element={<VehicleAvailabilityPage />} />
          <Route path="/availability/drivers"  element={<DriverAvailabilityPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
