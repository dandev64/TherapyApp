import { NavLink, useNavigate } from 'react-router-dom'
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

const navItems = {
  therapist: [
    { to: '/therapist', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/therapist/patients', icon: Users, label: 'Patients' },
    { to: '/therapist/assignments', icon: ClipboardList, label: 'Task Assignment' },
    { to: '/therapist/notes', icon: FileText, label: 'Caregiver Notes' },
    { to: '/therapist/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/therapist/notifications', icon: Bell, label: 'Notifications' },
    { to: '/therapist/profile', icon: User, label: 'Profile' },
  ],
  patient: [
    { to: '/patient', icon: LayoutDashboard, label: 'Home' },
    { to: '/patient/schedule', icon: CalendarDays, label: 'Schedule' },
    { to: '/patient/progress', icon: TrendingUp, label: 'Progress' },
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
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const items = navItems[profile?.role] || []

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
          <img src="/habitot-icon.png" alt="HabitOT" className="w-10 h-10 rounded-xl object-contain" />
          <div>
            <h1 className="text-base font-extrabold text-text-primary leading-tight tracking-tight">
              HabitOT
            </h1>
            <p className="text-xs text-text-muted capitalize">{profile?.role} Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
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
            {label === 'Notifications' && unreadCount > 0 && (
              <span className="ml-auto bg-danger text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
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
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-surface-card rounded-xl shadow-md cursor-pointer"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

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
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-surface-card border-r border-border-light
          shadow-[20px_0_40px_rgba(44,52,54,0.04)]
          flex flex-col h-screen
          transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
