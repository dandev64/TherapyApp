import { supabase } from '../lib/supabase'

const TASK_TYPES = ['new_task', 'task_due_soon', 'task_overdue']

/** Where clicking a notification (in the list or a pop-up) should take the user. */
export async function getNotificationPath(n, role) {
  if (role === 'therapist') {
    if (n.type === 'new_message') return `/therapist/messages/${n.patient_id}`
    if (n.patient_id) return `/therapist/patients/${n.patient_id}`
    return '/therapist/notifications'
  }

  if (n.type === 'new_message') {
    if (n.reference_id) {
      const { data: msg } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('id', n.reference_id)
        .maybeSingle()
      if (msg) return `/patient/messages/${msg.sender_id}`
    }
    return '/patient/messages'
  }

  if (TASK_TYPES.includes(n.type)) {
    if (n.reference_id) return `/patient/task/${n.reference_id}`
    // Older notifications have no task id; open the schedule on the date in the text
    const date = n.content?.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    return date ? `/patient/schedule?date=${date}` : '/patient/schedule'
  }

  if (n.type === 'new_remark') return '/patient'

  return '/patient/notifications'
}
