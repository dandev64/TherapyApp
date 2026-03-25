import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Bell, CheckCircle, AlertTriangle, MessageSquare, Mail, X, Send } from 'lucide-react'

const TYPE_CONFIG = {
  task_completed: { icon: CheckCircle, color: 'text-success', bg: 'bg-success-bg' },
  task_overdue: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning-bg' },
  task_comment: { icon: MessageSquare, color: 'text-primary', bg: 'bg-primary-container' },
  new_message: { icon: Mail, color: 'text-tertiary', bg: 'bg-tertiary-container' },
  new_task: { icon: Bell, color: 'text-primary', bg: 'bg-primary-container' },
}

export default function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const cacheKey = `${profile?.role}-notifications`
  const [notifications, setNotifications] = useCachedState(cacheKey, [])
  const [loading, setLoading] = useState(() => !hasCache(cacheKey))
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)

  useEffect(() => {
    if (!profile) return

    async function init(){
    // 2. Only run therapist-specific logic if the user IS a therapist
    if (profile.role === 'therapist') {
      await supabase.rpc('check_overdue_tasks', { p_therapist_id: profile.id })
    }
    loadNotifications()
  }
    
    init()
  }, [profile])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data || [])
    setLoading(false)
  }

  async function dismissNotification(id) {
  console.log('🔔 Attempting to dismiss notification:', id);

  // 1. Perform the update
  const { data, error, status } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .select(); // This is crucial to verify if the row was actually touched

  // 2. Log exactly what happened
  if (error) {
    console.error('❌ Database Error:', error.code, error.message);
    console.error('HTTP Status:', status);
    alert(`Failed to dismiss: ${error.message}`);
    return; // Stop here! Don't remove it from the UI.
  }

  if (!data || data.length === 0) {
    console.warn('⚠️ Update ran but 0 rows were affected. This usually means an RLS Policy issue.');
    alert('Dismiss failed: You might not have permission to update this specific notification.');
    return;
  }

  console.log('✅ Successfully updated in DB:', data);

  // 3. Only update local state if the DB part worked
  setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

async function handleReply(notification) {
  if (!replyText.trim()) return;
  setReplySending(true);

  try {
    let recipientId;

    if (profile.role === 'therapist') {
      // 1. Therapist replies to the patient involved in the notification
      recipientId = notification.patient_id;
    } else {
      // 2. Patient replies to the Therapist. 
      // Since your notifications table doesn't have a 'sender_id', 
      // we fetch the sender of the message linked via reference_id.
      const { data: originalMsg, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('id', notification.reference_id)
        .single();

      if (error || !originalMsg) {
        throw new Error("Could not find the original sender.");
      }
      recipientId = originalMsg.sender_id;
    }

    // 3. Insert the new message
    const { error: insertError } = await supabase.from('messages').insert({
      sender_id: profile.id,
      recipient_id: recipientId,
      content: replyText.trim(),
    });

    if (insertError) throw insertError;

    // 4. Cleanup UI state
    setReplyText('');
    setReplyingTo(null);
    
    // 5. Mark notification as read (this removes it from the list)
    await dismissNotification(notification.id);

  } catch (err) {
    console.error('Reply failed:', err);
    alert('Failed to send reply. Please try again.');
  } finally {
    setReplySending(false);
  }
}

  function formatTime(dateStr) {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Notifications</h2>
        <p className="text-text-secondary mt-2">
          {profile?.role === 'therapist' 
            ? "Stay updated on your patients' progress" 
            : "Updates regarding your care plan and messages"}
        </p>
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Bell size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-muted">No notifications yet.</p>
            </div>
          </Card>
        ) : (
          notifications.map((n) => {
            const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.task_completed
            const Icon = config.icon
            return (
              <Card key={n.id}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${config.bg} ${config.color} shrink-0`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{n.content}</p>
                    <p className="text-xs text-text-muted mt-1">{formatTime(n.created_at)}</p>

                    {/* Reply section for task_comment and new_message */}
                    {(n.type === 'task_comment' || n.type === 'new_message') && (
                      <div className="mt-3">
                        {replyingTo === n.id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Write a reply..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleReply(n)
                                }
                              }}
                              className="flex-1 px-3 py-2 rounded-xl border border-border text-sm bg-surface-alt focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => handleReply(n)}
                              disabled={replySending || !replyText.trim()}
                            >
                              <Send size={12} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setReplyingTo(n.id)
                                setReplyText('')
                              }}
                              className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                            >
                              Reply
                            </button>
                            <button
                              onClick={() => {
                                const isTherapist = profile?.role === 'therapist';
                                
                                if (isTherapist) {
                                  // Therapists go to the specific patient's thread
                                  navigate(`/therapist/messages/${n.patient_id}`);
                                } else {
                                  // Patients usually go to a general messages page 
                                  // or a specific thread with their therapist
                                  navigate(`/patient/messages`); 
                                }
                              }}
                              className="text-xs font-semibold text-text-muted hover:text-primary cursor-pointer"
                            >
                              Open thread
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => dismissNotification(n.id)}
                    className="text-text-muted hover:text-danger shrink-0 cursor-pointer"
                    title="Dismiss"
                  >
                    <X size={16} />
                  </button>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
