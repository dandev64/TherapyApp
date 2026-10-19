import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import ToastContainer from './components/ui/Toast'
import ProtectedRoute from './components/layout/ProtectedRoute'
import DashboardLayout from './components/layout/DashboardLayout'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'

// Pages load on first visit, so patients never download therapist pages
// (or the charts library) and the first load stays small.
const TherapistDashboard = lazy(() => import('./pages/therapist/TherapistDashboard'))
const PatientCarryoverPage = lazy(() => import('./pages/therapist/PatientCarryoverPage'))
const PatientDetailPage = lazy(() => import('./pages/therapist/PatientDetailPage'))
const TaskAssignmentPage = lazy(() => import('./pages/therapist/TaskAssignmentPage'))
const TherapistNotesPage = lazy(() => import('./pages/therapist/TherapistNotesPage'))
const NotificationsPage = lazy(() => import('./pages/therapist/NotificationsPage'))
const TherapistProfilePage = lazy(() => import('./pages/therapist/TherapistProfilePage'))
const TherapistCalendarPage = lazy(() => import('./pages/therapist/TherapistCalendarPage'))
const TherapistMessagesPage = lazy(() => import('./pages/therapist/TherapistMessagesPage'))
const TherapistMessagesInbox = lazy(() => import('./pages/therapist/TherapistMessagesInbox'))
const TodayTasksPage = lazy(() => import('./pages/therapist/TodayTasksPage'))
const ConsistencyPage = lazy(() => import('./pages/therapist/ConsistencyPage'))
const ClientNotesPage = lazy(() => import('./pages/therapist/ClientNotesPage'))
const PatientDashboard = lazy(() => import('./pages/patient/PatientDashboard'))
const SchedulePage = lazy(() => import('./pages/patient/SchedulePage'))
const TaskDetailPage = lazy(() => import('./pages/patient/TaskDetailPage'))
const ProgressPage = lazy(() => import('./pages/patient/ProgressPage'))
const PatientProfilePage = lazy(() => import('./pages/patient/PatientProfilePage'))
const MessagesPage = lazy(() => import('./pages/patient/MessagesPage'))
const PatientMessagesInbox = lazy(() => import('./pages/patient/PatientMessagesInbox'))
const CaregiverDashboard = lazy(() => import('./pages/caregiver/CaregiverDashboard'))
const CaregiverNotesPage = lazy(() => import('./pages/caregiver/CaregiverNotesPage'))

function RootRedirect() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/login" replace />
  return <Navigate to={`/${profile.role}`} replace />
}

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
      <NotificationProvider>
        <ToastContainer />
        {/* Safety net: pages normally suspend inside DashboardLayout */}
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          {/* Therapist Routes */}
          <Route
            path="/therapist"
            element={
              <ProtectedRoute allowedRoles={['therapist']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<TherapistDashboard />} />
            <Route path="patients" element={<PatientCarryoverPage />} />
            <Route path="patients/:patientId" element={<PatientDetailPage />} />
            <Route path="calendar" element={<TherapistCalendarPage />} />
            <Route path="assignments" element={<TaskAssignmentPage />} />
            <Route path="notes" element={<TherapistNotesPage />} />
            <Route path="today" element={<TodayTasksPage />} />
            <Route path="consistency" element={<ConsistencyPage />} />
            <Route path="client-notes" element={<Navigate to="/therapist/notes" replace />} />
            <Route path="client-notes/recent" element={<ClientNotesPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<TherapistProfilePage />} />
            <Route path="messages" element={<TherapistMessagesInbox />} />
            <Route path="messages/:patientId" element={<TherapistMessagesPage />} />
          </Route>

          {/* Patient Routes */}
          <Route
            path="/patient"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PatientDashboard />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="task/:id" element={<TaskDetailPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<PatientProfilePage />} />
            <Route path="messages" element={<PatientMessagesInbox />} />
            <Route path="messages/:recipientId" element={<MessagesPage />} />
          </Route>

          {/* Caregiver Routes */}
          <Route
            path="/caregiver"
            element={
              <ProtectedRoute allowedRoles={['caregiver']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CaregiverDashboard />} />
            <Route path="notes" element={<CaregiverNotesPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  )
}
