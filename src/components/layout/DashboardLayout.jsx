import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Sidebar from './Sidebar'

export default function DashboardLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  // Patients get a bottom tab bar on phones (hidden inside a chat thread)
  const hasTabBar = profile?.role === 'patient' && !pathname.startsWith('/patient/messages/')

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main
        className={`flex-1 min-w-0 px-4 sm:px-6 lg:px-12 pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] lg:pt-8 lg:pb-8 ${
          hasTabBar ? 'pb-[calc(5rem+env(safe-area-inset-bottom))]' : 'pb-4'
        }`}
      >
        <div className="max-w-5xl mx-auto">
          {/* Pages are lazy-loaded: keep the sidebar and tab bar while one loads */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
