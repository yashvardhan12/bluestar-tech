import React from 'react'
import { Users } from 'lucide-react'

export interface SubPage {
  label: string
  path: string
}

export interface NavSection {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  basePath: string
  horizontalNav?: boolean  // uses tab bar at top instead of left sub-nav panel
  children: SubPage[]
}

function CarIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M5 13H8M2 9L4 10L5.27064 6.18807C5.53292 5.40125 5.66405 5.00784 5.90729 4.71698C6.12208 4.46013 6.39792 4.26132 6.70951 4.13878C7.06236 4 7.47705 4 8.30643 4H15.6936C16.523 4 16.9376 4 17.2905 4.13878C17.6021 4.26132 17.8779 4.46013 18.0927 4.71698C18.3359 5.00784 18.4671 5.40125 18.7294 6.18807L20 10L22 9M16 13H19M6.8 10H17.2C18.8802 10 19.7202 10 20.362 10.327C20.9265 10.6146 21.3854 11.0735 21.673 11.638C22 12.2798 22 13.1198 22 14.8V17.5C22 17.9647 22 18.197 21.9616 18.3902C21.8038 19.1836 21.1836 19.8038 20.3902 19.9616C20.197 20 19.9647 20 19.5 20H19C17.8954 20 17 19.1046 17 18C17 17.7239 16.7761 17.5 16.5 17.5H7.5C7.22386 17.5 7 17.7239 7 18C7 19.1046 6.10457 20 5 20H4.5C4.03534 20 3.80302 20 3.60982 19.9616C2.81644 19.8038 2.19624 19.1836 2.03843 18.3902C2 18.197 2 17.9647 2 17.5V14.8C2 13.1198 2 12.2798 2.32698 11.638C2.6146 11.0735 3.07354 10.6146 3.63803 10.327C4.27976 10 5.11984 10 6.8 10Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function LayersIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2 12.0001L11.6422 16.8212C11.7734 16.8868 11.839 16.9196 11.9078 16.9325C11.9687 16.9439 12.0313 16.9439 12.0922 16.9325C12.161 16.9196 12.2266 16.8868 12.3578 16.8212L22 12.0001M2 17.0001L11.6422 21.8212C11.7734 21.8868 11.839 21.9196 11.9078 21.9325C11.9687 21.9439 12.0313 21.9439 12.0922 21.9325C12.161 21.9196 12.2266 21.8868 12.3578 21.8212L22 17.0001M2 7.00006L11.6422 2.17895C11.7734 2.11336 11.839 2.08056 11.9078 2.06766C11.9687 2.05622 12.0313 2.05622 12.0922 2.06766C12.161 2.08056 12.2266 2.11336 12.3578 2.17895L22 7.00006L12.3578 11.8212C12.2266 11.8868 12.161 11.9196 12.0922 11.9325C12.0313 11.9439 11.9687 11.9439 11.9078 11.9325C11.839 11.9196 11.7734 11.8868 11.6422 11.8212L2 7.00006Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function AvailabilityIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M20.362 10.9468C20.9265 11.2517 21.3854 11.7382 21.673 12.3365C22 13.0168 22 13.9073 22 15.6882V18.5502C22 19.0428 22 19.289 21.9616 19.4938C21.8038 20.3348 21.1836 20.9922 20.3902 21.1595C20.197 21.2002 19.9647 21.2002 19.5 21.2002H19C17.8954 21.2002 17 20.2511 17 19.0802C17 18.7875 16.7761 18.5502 16.5 18.5502H7.5C7.22386 18.5502 7 18.7875 7 19.0802C7 20.2511 6.10457 21.2002 5 21.2002H4.5C4.03534 21.2002 3.80302 21.2002 3.60982 21.1595C2.81644 20.9922 2.19624 20.3348 2.03843 19.4938C2 19.289 2 19.0428 2 18.5502V15.6882C2 13.9073 2 13.0168 2.32698 12.3365C2.6146 11.7382 3.07354 11.2517 3.63803 10.9468M2 9.54023L4 10.6002L5.27064 6.55959C5.53292 5.72556 5.66405 5.30855 5.90729 5.00023C6.12208 4.72798 6.39792 4.51724 6.70951 4.38734C7.06236 4.24023 7.47705 4.24023 8.30643 4.24023H15.6936C16.523 4.24023 16.9376 4.24023 17.2905 4.38734C17.6021 4.51724 17.8779 4.72798 18.0927 5.00023C18.3359 5.30855 18.4671 5.72556 18.7294 6.55959L20 10.6002L22 9.54023" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.25 11.4964L10.5833 13.9698L15.25 10.2598" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function BillingIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M20 12.5V6.8C20 5.11984 20 4.27976 19.673 3.63803C19.3854 3.07354 18.9265 2.6146 18.362 2.32698C17.7202 2 16.8802 2 15.2 2H8.8C7.11984 2 6.27976 2 5.63803 2.32698C5.07354 2.6146 4.6146 3.07354 4.32698 3.63803C4 4.27976 4 5.11984 4 6.8V17.2C4 18.8802 4 19.7202 4.32698 20.362C4.6146 20.9265 5.07354 21.3854 5.63803 21.673C6.27976 22 7.11984 22 8.8 22H14M14 11H8M10 15H8M16 7H8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 16H20M16 17.6667H20M18.8333 22L16 19.3333H17C19.2223 19.3333 19.2223 16 17 16" stroke="currentColor" strokeWidth={strokeWidth * 0.7} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function CarExpenseIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g transform="scale(0.88889)">
        <path d="M5 17H8M2 13L4 14L5.27064 10.1881C5.53292 9.40125 5.66405 9.00784 5.90729 8.71698C6.12208 8.46013 6.39792 8.26132 6.70951 8.13878C7.06236 8 7.47705 8 8.30643 8H15.6936C16.523 8 16.9376 8 17.2905 8.13878C17.6021 8.26132 17.8779 8.46013 18.0927 8.71698C18.3359 9.00784 18.4671 9.40125 18.7294 10.1881L20 14L22 13M16 17H19M6.8 14H17.2C18.8802 14 19.7202 14 20.362 14.327C20.9265 14.6146 21.3854 15.0735 21.673 15.638C22 16.2798 22 17.1198 22 18.8V21.5C22 21.9647 22 22.197 21.9616 22.3902C21.8038 23.1836 21.1836 23.8038 20.3902 23.9616C20.197 24 19.9647 24 19.5 24H19C17.8954 24 17 23.1046 17 22C17 21.7239 16.7761 21.5 16.5 21.5H7.5C7.22386 21.5 7 21.7239 7 22C7 23.1046 6.10457 24 5 24H4.5C4.03534 24 3.80302 24 3.60982 23.9616C2.81644 23.8038 2.19624 23.1836 2.03843 22.3902C2 22.197 2 21.9647 2 21.5V18.8C2 17.1198 2 16.2798 2.32698 15.638C2.6146 15.0735 3.07354 14.6146 3.63803 14.327C4.27976 14 5.11984 14 6.8 14Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="17.5" cy="9.5" r="9.5" fill="white"/>
        <path d="M15.0212 8.08306H19.9795M15.0212 5.604H19.9795M18.917 13.75L15.0212 10.5625L16.0837 10.5623C19.232 10.5623 19.232 5.604 16.0837 5.604M24.5837 9.49984C24.5837 13.4119 21.4123 16.5832 17.5003 16.5832C13.5883 16.5832 10.417 13.4119 10.417 9.49984C10.417 5.58782 13.5883 2.4165 17.5003 2.4165C21.4123 2.4165 24.5837 5.58782 24.5837 9.49984Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </svg>
  )
}

export const NAV: NavSection[] = [
  {
    id: 'bookings',
    label: 'Bookings',
    icon: CarIcon,
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
    icon: LayersIcon,
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
    icon: AvailabilityIcon,
    basePath: '/availability',
    horizontalNav: true,
    children: [
      { label: 'Vehicle availability', path: '/availability/vehicles' },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: BillingIcon,
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
    icon: CarExpenseIcon,
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
