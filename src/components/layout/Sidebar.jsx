import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useNotifications } from '../../contexts/NotificationContext'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileText,
  LogOut,
  Menu,
  X,
  Bell,
  User,
  CalendarDays,
  TrendingUp,
  MessageSquare,
  Sun,
  Moon,
} from 'lucide-react'
import { useState, useEffect } from 'react'

// Bottom tabs for patients on phones; Profile, dark mode and sign out stay in the menu
const PATIENT_TABS = [
  { to: '/patient', icon: LayoutDashboard, label: 'Today' },
  { to: '/patient/schedule', icon: CalendarDays, label: 'Schedule' },
  { to: '/patient/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/patient/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/patient/notifications', icon: Bell, label: 'Alerts' },
]

const navItems = {
  therapist: [
    { to: '/therapist', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/therapist/patients', icon: Users, label: 'Patients' },
    { to: '/therapist/calendar', icon: CalendarDays, label: 'Calendar' },
    { to: '/therapist/assignments', icon: ClipboardList, label: 'Task Assignment' },
    { to: '/therapist/notes', icon: FileText, label: 'Client Notes' },
    { to: '/therapist/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/therapist/notifications', icon: Bell, label: 'Notifications' },
    { to: '/therapist/profile', icon: User, label: 'Profile' },
  ],
  patient: [
    { to: '/patient', icon: LayoutDashboard, label: 'Today' },
    { to: '/patient/schedule', icon: CalendarDays, label: 'Schedule' },
    { to: '/patient/progress', icon: TrendingUp, label: 'Weekly Progress' },
    { to: '/patient/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/patient/notifications', icon: Bell, label: 'Notifications' },
    { to: '/patient/profile', icon: User, label: 'Profile' },
  ],
  caregiver: [
    { to: '/caregiver', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/caregiver/notes', icon: FileText, label: 'My Notes' },
  ],
}

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const { dark, toggleDark } = useTheme()
  const { unreadCount, unreadMessages } = useNotifications()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const items = navItems[profile?.role] || []
  const isPatient = profile?.role === 'patient'

  useEffect(() => {
    if (!mobileOpen) return
    function handleKey(e) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mobileOpen])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const sidebarContent = (
    <>
      <div className="px-6 py-6 border-b border-border-light">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="lg:hidden order-last ml-auto p-2.5 -mr-2 rounded-xl text-text-muted hover:bg-surface-alt cursor-pointer"
          >
            <X size={20} />
          </button>
          <img src="/habitot-icon.png" alt="HabitOT" className="w-14 h-14 rounded-xl object-contain bg-white" />
          <div>
            <h1 className="text-base font-extrabold text-text-primary leading-tight tracking-tight">
              HabitOT
            </h1>
            <p className="text-xs text-text-muted capitalize">{profile?.role} Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {/* eslint-disable-next-line no-unused-vars */}
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === `/${profile?.role}`}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-primary-container/40 text-primary'
                  : 'text-text-secondary hover:bg-surface-alt hover:text-text-primary hover:translate-x-0.5'
              }`
            }
          >
            <Icon size={18} />
            {label}
            {(() => {
              const badge = label === 'Notifications' ? unreadCount : label === 'Messages' ? unreadMessages : 0
              if (badge <= 0) return null
              return (
                <span className="ml-auto bg-danger text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                  {badge > 99 ? '99+' : badge}
                </span>
              )
            })()}
          </NavLink>
        ))}
      </nav>

      <button
          onClick={toggleDark}
          className="flex items-center gap-3 w-full px-4 py-3 mb-2 rounded-xl text-sm font-semibold text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-all duration-200 cursor-pointer"
        >
          {dark ? (
            <>
              <Sun size={18} className="text-yellow-500" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon size={18} className="text-indigo-400" />
              <span>Dark Mode</span>
            </>
          )}
        </button>

      <div className="px-3 py-4 border-t border-border-light">
        <div className="px-4 py-3 mb-2">
          <p className="text-sm font-bold text-text-primary truncate">
            {profile?.full_name}
          </p>
          <p className="text-xs text-text-muted truncate">{profile?.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold text-text-secondary hover:bg-danger-bg hover:text-danger transition-all duration-200 cursor-pointer"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile app bar */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 bg-surface-card/95 backdrop-blur border-b border-border-light pt-[env(safe-area-inset-top)]">
        <div className="h-14 px-2 flex items-center gap-1">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="relative p-3 rounded-xl text-text-primary hover:bg-surface-alt cursor-pointer"
          >
            <Menu size={22} />
            {!isPatient && unreadCount + unreadMessages > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-danger border-2 border-surface-card" />
            )}
          </button>
          <Link to={`/${profile?.role}`} className="flex items-center gap-2 min-w-0">
            <img src="/habitot-icon.png" alt="" className="w-8 h-8 rounded-lg object-contain bg-white" />
            <span className="text-base font-extrabold text-text-primary tracking-tight">HabitOT</span>
          </Link>
          <Link
            to={`/${profile?.role}/notifications`}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            className="relative ml-auto p-3 rounded-xl text-text-secondary hover:bg-surface-alt"
          >
            <Bell size={22} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 bg-danger text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Patient bottom tab bar (phones) */}
      {isPatient && !pathname.startsWith('/patient/messages/') && (
        <nav
          aria-label="Main"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-card/95 backdrop-blur border-t border-border-light pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-5">
            {/* eslint-disable-next-line no-unused-vars */}
            {PATIENT_TABS.map(({ to, icon: Icon, label }) => {
              const badge = label === 'Messages' ? unreadMessages : label === 'Alerts' ? unreadCount : 0
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/patient'}
                  className={({ isActive }) =>
                    `relative flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-semibold transition-colors ${
                      isActive ? 'text-primary' : 'text-text-muted'
                    }`
                  }
                >
                  <span className="relative">
                    <Icon size={22} />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 bg-danger text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 border-2 border-surface-card">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  {label}
                </NavLink>
              )
            })}
          </div>
        </nav>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky lg:top-0 lg:self-start inset-y-0 left-0 z-50 lg:z-40 shrink-0
          w-72 max-w-[85vw] lg:w-64 bg-surface-card border-r border-border-light
          shadow-[20px_0_40px_rgba(44,52,54,0.04)]
          flex flex-col h-dvh lg:h-screen pt-[env(safe-area-inset-top)] lg:pt-0
          transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
