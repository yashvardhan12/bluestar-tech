import { Car, Layers, ClipboardCheck, PieChart, Users, Key } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface SubPage {
  label: string
  path: string
}

export interface NavSection {
  id: string
  label: string
  icon: LucideIcon
  basePath: string
  horizontalNav?: boolean  // uses tab bar at top instead of left sub-nav panel
  children: SubPage[]
}

export const NAV: NavSection[] = [
  {
    id: 'bookings',
    label: 'Bookings',
    icon: Car,
    basePath: '/bookings',
    horizontalNav: true,
    children: [
      { label: 'All bookings', path: '/bookings/all' },
      { label: 'All duties',   path: '/bookings/duties' },
    ],
  },
  {
    id: 'database',
    label: 'Database',
    icon: Layers,
    basePath: '/database',
    horizontalNav: true,
    children: [
      { label: 'Duty types',      path: '/database/duty-types' },
      { label: 'Vehicle groups',  path: '/database/vehicle-groups' },
      { label: 'Customers',       path: '/database/customers' },
      { label: 'Drivers',         path: '/database/drivers' },
      { label: 'Vehicles',        path: '/database/vehicles' },
      { label: 'Bank accounts',   path: '/database/bank-accounts' },
      { label: 'Taxes',           path: '/database/taxes' },
      { label: 'Allowances',      path: '/database/allowances' },
      { label: 'FASTag',          path: '/database/fastag' },
    ],
  },
  {
    id: 'availability',
    label: 'Availability',
    icon: ClipboardCheck,
    basePath: '/availability',
    children: [
      { label: 'Vehicle availability', path: '/availability/vehicles' },
      { label: 'Driver availability',  path: '/availability/drivers' },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: PieChart,
    basePath: '/billing',
    children: [
      { label: 'Invoices', path: '/billing/invoices' },
      { label: 'Receipts', path: '/billing/receipts' },
    ],
  },
  {
    id: 'driver-ops',
    label: 'Driver Ops',
    icon: Users,
    basePath: '/driver-ops',
    children: [
      { label: 'Attendance', path: '/driver-ops/attendance' },
      { label: 'Payroll',    path: '/driver-ops/payroll' },
    ],
  },
  {
    id: 'vehicle-expenses',
    label: 'Vehicle Expenses',
    icon: Key,
    basePath: '/vehicle-expenses',
    children: [
      { label: 'General expenses',    path: '/vehicle-expenses/general' },
      { label: 'Fuel stubs and logs', path: '/vehicle-expenses/fuel' },
      { label: 'Loans',               path: '/vehicle-expenses/loans' },
      { label: 'Efficiency',          path: '/vehicle-expenses/efficiency' },
    ],
  },
]
