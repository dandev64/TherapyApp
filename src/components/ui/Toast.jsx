import { useNavigate } from 'react-router-dom'
import { X, CheckCircle, AlertTriangle, MessageSquare, Mail, Bell } from 'lucide-react'
import { useNotifications } from '../../contexts/NotificationContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const TYPE_ICONS = {
  task_completed: { icon: CheckCircle, color: 'text-success' },
  task_overdue: { icon: AlertTriangle, color: 'text-warning' },
  task_comment: { icon: MessageSquare, color: 'text-primary' },
  new_message: { icon: Mail, color: 'text-primary' },
  new_task: { icon: Bell, color: 'text-primary' },
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useNotifications()
  const { profile } = useAuth()
  const navigate = useNavigate()

  if (toasts.length === 0) return null

  async function handleClick(toast) {
    const n = toast.notification
    if (!n) return

    const role = profile?.role
    dismissToast(toast.id)

    if (n.type === 'new_message') {
      if (role === 'therapist') {
        navigate(`/therapist/messages/${n.patient_id}`)
      } else {
        // For patients: look up message sender
        if (n.reference_id) {
          const { data: msg } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('id', n.reference_id)
            .single()
          if (msg) {
            navigate(`/patient/messages/${msg.sender_id}`)
            return
          }
        }
        navigate('/patient/notifications')
      }
      return
    }

    // All other notification types → notifications page
    navigate(role === 'therapist' ? '/therapist/notifications' : '/patient/notifications')
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => {
        const config = TYPE_ICONS[toast.type] || TYPE_ICONS.new_task
        const Icon = config.icon
        const hasNotification = !!toast.notification
        return (
          <div
            key={toast.id}
            onClick={() => handleClick(toast)}
            className={`bg-surface-card border border-border-light rounded-2xl shadow-lg px-4 py-3 flex items-start gap-3 animate-toast-in ${hasNotification ? 'cursor-pointer hover:bg-surface-alt transition-colors' : ''}`}
          >
            <Icon size={18} className={`${config.color} shrink-0 mt-0.5`} />
            <p className="text-sm text-text-primary flex-1">{toast.message}</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                dismissToast(toast.id)
              }}
              className="text-text-muted hover:text-text-primary shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
