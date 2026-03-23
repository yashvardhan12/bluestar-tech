import { clsx } from 'clsx'
import {
  Home,
  LayoutGrid,
  Bell,
  Settings,
} from 'lucide-react'

const TOP_NAV = [
  { icon: Home,        label: 'Home',     id: 'home' },
  { icon: LayoutGrid,  label: 'Dashboard', id: 'dashboard' },
]

interface AppShellProps {
  activeNav?: string
  children: React.ReactNode
}

export default function AppShell({ activeNav = 'home', children }: AppShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex flex-col items-center justify-between w-20 h-full bg-white border-r border-gray-200 shrink-0 py-8">
        {/* Top: logo + nav */}
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo */}
          <div className="flex items-center justify-center mb-2">
            <div className="size-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm">
              <div className="size-5 rounded bg-white/20 flex items-center justify-center">
                <div className="size-2.5 rounded-sm bg-white" />
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col items-center gap-1 w-full px-4">
            {TOP_NAV.map(({ icon: Icon, label, id }) => {
              const isActive = activeNav === id
              return (
                <button
                  key={id}
                  title={label}
                  className={clsx(
                    'flex items-center justify-center size-12 rounded-lg transition-colors duration-150',
                    isActive
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                  )}
                >
                  <Icon className="size-5" strokeWidth={isActive ? 2 : 1.75} />
                </button>
              )
            })}
          </nav>
        </div>

        {/* Bottom: bell, settings, avatar */}
        <div className="flex flex-col items-center gap-1 w-full px-4">
          <button
            title="Notifications"
            className="flex items-center justify-center size-12 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <Bell className="size-5" strokeWidth={1.75} />
          </button>
          <button
            title="Settings"
            className="flex items-center justify-center size-12 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <Settings className="size-5" strokeWidth={1.75} />
          </button>
          {/* Avatar */}
          <button
            title="Profile"
            className="mt-2 size-9 rounded-full overflow-hidden border-2 border-gray-200 hover:border-violet-300 transition-colors"
          >
            <div className="size-full bg-violet-100 flex items-center justify-center">
              <span className="text-xs font-semibold text-violet-700">BS</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
