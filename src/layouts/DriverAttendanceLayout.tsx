import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { NAV } from '../routes'

const section = NAV.find(s => s.id === 'driver-attendance-payroll')!

export default function DriverAttendanceLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Page header */}
      <div className="px-10 pt-8">
        <h1 className="text-[30px] font-semibold leading-[38px] text-gray-900">Drivers Attendance and Payroll</h1>
        <p className="mt-1 text-base font-normal text-gray-500">
          Manage your drivers attendance and payrolls here
        </p>
      </div>

      {/* Horizontal tab bar */}
      <div className="px-10 pt-5">
        <div className="flex items-center gap-1">
          {section.children.map(({ label, path }) => {
            const isActive = location.pathname === path
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={clsx(
                  'px-3 py-2 rounded-md text-base font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer',
                  isActive
                    ? 'bg-violet-50 text-violet-700'
                    : 'bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="mt-5 h-px bg-gray-200" />
      </div>

      {/* Sub-page content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
