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
    horizontalNav: true,
    children: [
      { label: 'Vehicle availability', path: '/availability/vehicles' },
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
    id: 'driver-attendance-payroll',
    label: 'Drivers Attendance and Payroll',
    icon: Users,
    basePath: '/driver-attendance-payroll',
    horizontalNav: true,
    children: [
      { label: 'Attendance', path: '/driver-attendance-payroll/attendance' },
      { label: 'Payroll',    path: '/driver-attendance-payroll/payroll' },
    ],
  },
  {
    id: 'vehicle-tracker',
    label: 'Vehicle Tracker',
    icon: Key,
    basePath: '/vehicle-tracker',
    horizontalNav: true,
    children: [
      { label: 'Expense', path: '/vehicle-tracker/expense' },
      { label: 'Fuel',    path: '/vehicle-tracker/fuel' },
      { label: 'Loans',   path: '/vehicle-tracker/loans' },
      { label: 'Average', path: '/vehicle-tracker/average' },
    ],
  },
]
