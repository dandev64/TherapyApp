import { useNavigate } from 'react-router-dom'
import { X, CheckCircle, AlertTriangle, MessageSquare, Mail, Bell, Clock, StickyNote } from 'lucide-react'
import { useNotifications } from '../../contexts/NotificationContext'
import { useAuth } from '../../contexts/AuthContext'
import { getNotificationPath } from '../../utils/notificationNav'

const TYPE_ICONS = {
  task_completed: { icon: CheckCircle, color: 'text-success' },
  task_overdue: { icon: AlertTriangle, color: 'text-warning' },
  task_comment: { icon: MessageSquare, color: 'text-primary' },
  new_message: { icon: Mail, color: 'text-primary' },
  new_task: { icon: Bell, color: 'text-primary' },
  task_due_soon: { icon: Clock, color: 'text-warning' },
  new_remark: { icon: StickyNote, color: 'text-primary' },
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useNotifications()
  const { profile } = useAuth()
  const navigate = useNavigate()

  if (toasts.length === 0) return null

  async function handleClick(toast) {
    const n = toast.notification
    if (!n) return
    dismissToast(toast.id)
    navigate(await getNotificationPath(n, profile?.role))
  }

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 space-y-2 sm:max-w-sm">
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
