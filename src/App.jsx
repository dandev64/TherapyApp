import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import DashboardLayout from './components/layout/DashboardLayout'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'
import TherapistDashboard from './pages/therapist/TherapistDashboard'
import PatientCarryoverPage from './pages/therapist/PatientCarryoverPage'
import PatientDetailPage from './pages/therapist/PatientDetailPage'
import TaskTemplatesPage from './pages/therapist/TaskTemplatesPage'
import TherapistNotesPage from './pages/therapist/TherapistNotesPage'
import NotificationsPage from './pages/therapist/NotificationsPage'
import TherapistProfilePage from './pages/therapist/TherapistProfilePage'
import TherapistMessagesPage from './pages/therapist/TherapistMessagesPage'
import PatientDashboard from './pages/patient/PatientDashboard'
import SchedulePage from './pages/patient/SchedulePage'
import TaskDetailPage from './pages/patient/TaskDetailPage'
import ProgressPage from './pages/patient/ProgressPage'
import PatientProfilePage from './pages/patient/PatientProfilePage'
import MessagesPage from './pages/patient/MessagesPage'
import CaregiverDashboard from './pages/caregiver/CaregiverDashboard'
import CaregiverNotesPage from './pages/caregiver/CaregiverNotesPage'

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
            <Route path="templates" element={<TaskTemplatesPage />} />
            <Route path="notes" element={<TherapistNotesPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<TherapistProfilePage />} />
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
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  )
}
