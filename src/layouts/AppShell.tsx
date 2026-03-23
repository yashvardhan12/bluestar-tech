import { clsx } from 'clsx'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, Settings, Star } from 'lucide-react'
import { NAV } from '../routes'

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const activeSection = NAV.find(s => location.pathname.startsWith(s.basePath))

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50">

      {/* ── Icon sidebar ── */}
      <aside className="flex flex-col items-center justify-between w-20 h-full bg-white border-r border-gray-200 shrink-0">

        {/* Top: logo + nav */}
        <div className="flex flex-col w-full gap-6 pt-8">

          {/* Logo */}
          <div className="pl-6 pr-5">
            <div className="flex items-center justify-center size-8 rounded-lg bg-violet-600 shadow-sm">
              <Star className="size-4 fill-white text-white" strokeWidth={0} />
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col items-center gap-2 w-full px-4">
            {NAV.map(({ icon: Icon, label, id, children: sub }) => {
              const isActive = activeSection?.id === id
              return (
                <button
                  key={id}
                  title={label}
                  onClick={() => navigate(sub[0].path)}
                  className={clsx(
                    'flex items-center justify-center size-12 rounded-md transition-colors duration-150 cursor-pointer',
                    isActive
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                  )}
                >
                  <Icon className="size-6" strokeWidth={1.75} />
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer: bell, settings, avatar */}
        <div className="flex flex-col items-center gap-2 w-full px-4 pb-6">
          <button
            title="Notifications"
            className="flex items-center justify-center size-12 rounded-md bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <Bell className="size-6" strokeWidth={1.75} />
          </button>
          <button
            title="Settings"
            className="flex items-center justify-center size-12 rounded-md bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <Settings className="size-6" strokeWidth={1.75} />
          </button>
          <button
            title="Profile"
            className="mt-1 size-9 rounded-full overflow-hidden border-2 border-gray-200 hover:border-violet-300 transition-colors cursor-pointer"
          >
            <div className="size-full bg-violet-100 flex items-center justify-center">
              <span className="text-xs font-semibold text-violet-700">BS</span>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Sub-nav panel (hidden for sections using horizontal tab nav) ── */}
      {activeSection && !activeSection.horizontalNav && (
        <aside className="flex flex-col w-52 h-full bg-white border-r border-gray-200 shrink-0 py-8 px-4 gap-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            {activeSection.label}
          </p>
          {activeSection.children.map(({ label, path }) => {
            const isActive = location.pathname === path
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={clsx(
                  'text-left w-full px-3 py-2 rounded-lg text-sm transition-colors duration-150 cursor-pointer',
                  isActive
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                {label}
              </button>
            )
          })}
        </aside>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
