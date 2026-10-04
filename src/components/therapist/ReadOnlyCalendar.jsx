import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toDateStr } from '../../utils/streak'
import { ChevronLeft, ChevronRight, CheckCircle, MessageSquare, Clock, CheckSquare } from 'lucide-react'
import Modal from '../ui/Modal'
import Badge from '../ui/Badge'
import ProofPhotos from '../ProofPhotos'

const MOOD_EMOJI = {
  excited: '🤩', happy: '😊', calm: '😌', scared: '😨',
  anxious: '😰', angry: '😠', tired: '😴', sad: '😢',
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Month calendar of a therapist's tasks. With `patientId` it shows one patient and lets the
 * therapist write a remark per day; without it, it shows tasks for all of the therapist's patients.
 */
export default function ReadOnlyCalendar({ patientId, therapistId, refreshKey, onRemarkSaved }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [tasks, setTasks] = useState([])
  const [feedbackMap, setFeedbackMap] = useState({})
  const [remarks, setRemarks] = useState({})
  // Draft + status are tied to the date they were made on, so switching days resets them
  const [remarkDraft, setRemarkDraft] = useState({ date: null, text: '' })
  const [remarkSaving, setRemarkSaving] = useState(false)
  const [remarkStatusState, setRemarkStatus] = useState({ date: null, text: '' })
  const [photoRequest, setPhotoRequest] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)

  const todayStr = toDateStr(new Date())
  const { year, month } = currentMonth

  useEffect(() => {
    if (!therapistId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const startOfMonth = toDateStr(new Date(year, month, 1))
      const endOfMonth = toDateStr(new Date(year, month + 1, 0))

      let tasksQuery = supabase
        .from('task_assignments')
        .select('*, patient:profiles!task_assignments_patient_id_fkey(full_name)')
        .eq('therapist_id', therapistId)
        .gte('assigned_date', startOfMonth)
        .lte('assigned_date', endOfMonth)
        .order('assigned_time', { ascending: true })
      if (patientId) tasksQuery = tasksQuery.eq('patient_id', patientId)

      const [tasksRes, remarksRes] = await Promise.all([
        tasksQuery,
        patientId
          ? supabase
              .from('therapist_remarks')
              .select('id, date, content')
              .eq('patient_id', patientId)
              .eq('therapist_id', therapistId)
              .gte('date', startOfMonth)
              .lte('date', endOfMonth)
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      if (tasksRes.error) console.error('Failed to load calendar tasks:', tasksRes.error.message)
      const monthTasks = tasksRes.data || []

      const completedIds = monthTasks.filter((t) => t.status === 'completed').map((t) => t.id)
      const fbMap = {}
      if (completedIds.length) {
        const { data: fbData } = await supabase
          .from('task_feedback')
          .select('task_assignment_id, mood, note, created_at')
          .in('task_assignment_id', completedIds)
        ;(fbData || []).forEach((fb) => { fbMap[fb.task_assignment_id] = fb })
      }
      if (cancelled) return

      setTasks(monthTasks)
      const remarksMap = {}
      ;(remarksRes.data || []).forEach((r) => {
        remarksMap[r.date] = r
      })
      setRemarks(remarksMap)
      setFeedbackMap(fbMap)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [patientId, therapistId, year, month, refreshKey])

  const remarkText = remarkDraft.date === selectedDate ? remarkDraft.text : remarks[selectedDate]?.content || ''
  const remarkStatus = remarkStatusState.date === selectedDate ? remarkStatusState.text : ''
  function setRemarkText(text) {
    setRemarkDraft({ date: selectedDate, text })
  }

  // Sends the patient a message (which also notifies them) asking them to edit their submission
  async function requestNewPhoto(task) {
    setPhotoRequest('sending')
    const date = new Date(task.assigned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const { error } = await supabase.from('messages').insert({
      sender_id: therapistId,
      recipient_id: task.patient_id,
      content: `Please upload a new, clearer photo for "${task.title}" (${date}). Open the task and tap "Edit submission".`,
    })
    setPhotoRequest(error ? '' : 'sent')
    if (error) console.error('Failed to send photo request:', error.message)
  }

  async function saveRemark() {
    const content = remarkText.trim()
    if (!content || !patientId) return
    setRemarkSaving(true)
    const { data, error } = await supabase
      .from('therapist_remarks')
      .upsert(
        {
          therapist_id: therapistId,
          patient_id: patientId,
          date: selectedDate,
          content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'therapist_id,patient_id,date' }
      )
      .select('id, date, content')
      .single()
    setRemarkSaving(false)
    if (error) {
      console.error('Failed to save remark:', error.message)
      setRemarkStatus({ date: selectedDate, text: 'Failed to save. Please try again.' })
      return
    }
    setRemarks((prev) => ({ ...prev, [selectedDate]: data }))
    setRemarkDraft({ date: null, text: '' })
    setRemarkStatus({ date: selectedDate, text: 'Saved. The patient can see this on their Today page.' })
    onRemarkSaved?.()
  }

  const tasksByDate = useMemo(() => {
    const grouped = {}
    tasks.forEach((t) => {
      if (!grouped[t.assigned_date]) grouped[t.assigned_date] = []
      grouped[t.assigned_date].push(t)
    })
    return grouped
  }, [tasks])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  function prevMonth() {
    setCurrentMonth((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 }))
  }
  function nextMonth() {
    setCurrentMonth((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 }))
  }

  // Selected day detail
  const selectedTasks = tasksByDate[selectedDate] || []
  const completedCount = selectedTasks.filter((t) => t.status === 'completed').length
  const selDateObj = new Date(selectedDate + 'T00:00:00')
  const selDayName = FULL_DAYS[selDateObj.getDay()]
  const selDayNum = selDateObj.getDate()
  const selRemark = remarks[selectedDate]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-bold text-text-primary">
          {MONTHS[month]} {year}
        </h4>
        <div className="flex items-center gap-1 bg-surface-container rounded-full px-1.5 py-1">
          <button onClick={prevMonth} aria-label="Previous month" className="p-1.5 rounded-full hover:bg-surface-alt transition-colors cursor-pointer">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMonth} aria-label="Next month" className="p-1.5 rounded-full hover:bg-surface-alt transition-colors cursor-pointer">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Calendar Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {DAY_HEADERS.map((d) => (
                <div key={d} className="text-[10px] sm:text-xs font-bold text-outline uppercase tracking-widest text-center py-1.5">
                  {d}
                </div>
              ))}
              {Array.from({ length: firstDay }, (_, i) => (
                <div key={`empty-${i}`} className="bg-surface-container/30 rounded-2xl opacity-40 aspect-square" />
              ))}
              {days.map((day) => {
                const dateStr = toDateStr(new Date(year, month, day))
                const dayTasks = tasksByDate[dateStr] || []
                const dayCompleted = dayTasks.filter((t) => t.status === 'completed').length
                const dayTotal = dayTasks.length
                const allDone = dayTotal > 0 && dayCompleted === dayTotal
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const hasTherapy = dayTasks.some((t) => t.therapy_type)

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    aria-label={`${MONTHS[month]} ${day}, ${dayTotal} task${dayTotal !== 1 ? 's' : ''}${isToday ? ', today' : ''}`}
                    aria-pressed={isSelected}
                    className={`rounded-2xl p-1.5 sm:p-3 aspect-square flex flex-col justify-between transition-all cursor-pointer group text-left
                      ${isToday ? 'bg-primary-container ring-2 ring-primary ring-offset-2' : ''}
                      ${isSelected && !isToday ? 'bg-primary/10 ring-2 ring-primary/40' : ''}
                      ${!isToday && !isSelected && allDone ? 'bg-secondary-container/20' : ''}
                      ${!isToday && !isSelected && !allDone ? 'bg-surface-container-lowest hover:bg-primary-container/20' : ''}
                    `}
                  >
                    <div>
                      <span className={`text-xs sm:text-sm font-bold ${isToday ? 'text-primary' : 'text-text-primary'}`}>
                        {day}
                      </span>
                      {isToday && (
                        <span className="block text-[8px] sm:text-[10px] font-bold text-primary">Today</span>
                      )}
                    </div>
                    <div>
                      {hasTherapy && (
                        <span className="inline-block px-1 sm:px-1.5 py-0.5 bg-primary/10 text-primary text-[8px] sm:text-[10px] font-bold rounded-full">
                          therapy
                        </span>
                      )}
                      {dayTotal > 0 && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <span className="text-[10px] text-outline group-hover:text-primary hidden sm:inline">
                            {dayTotal} task{dayTotal !== 1 ? 's' : ''}
                          </span>
                          <div className="flex gap-0.5 sm:hidden">
                            {dayTasks.slice(0, 4).map((t, i) => (
                              <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${t.status === 'completed' ? 'bg-secondary' : 'bg-secondary-container'}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {dayTotal > 0 && (
                        <div className="hidden sm:flex gap-0.5 mt-0.5">
                          {dayTasks.map((t, i) => (
                            <div
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full ${t.status === 'completed' ? 'bg-secondary' : 'bg-secondary-container'}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected Day Detail Panel */}
          <div className="w-full lg:w-72 lg:shrink-0 bg-surface-container-low rounded-2xl p-5 lg:sticky lg:top-28 self-start">
            <p className="text-xs font-bold text-outline uppercase tracking-[0.2em]">Selected Day</p>
            <h3 className="text-2xl font-extrabold text-text-primary mt-1">
              {selDayName} {selDayNum}
            </h3>
            <p className="text-secondary font-medium text-sm mt-1">
              {completedCount} of {selectedTasks.length} completed
            </p>

            {selectedTasks.length > 0 && (
              <div className="mt-5 space-y-3">
                {selectedTasks.map((task) => {
                  const isDone = task.status === 'completed'
                  const fb = feedbackMap[task.id]
                  return (
                    <div
                      key={task.id}
                      className="relative pl-6 cursor-pointer rounded-xl p-2 -ml-2 hover:bg-primary-container/20 transition-colors"
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="absolute left-0 top-3">
                        {isDone ? (
                          <CheckCircle size={16} className="text-secondary" style={{ fill: 'currentColor', stroke: 'var(--color-surface)' }} />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-primary/20" />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-bold ${isDone ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                            {task.title}
                          </p>
                          {!patientId && task.patient?.full_name && (
                            <p className="text-xs font-semibold text-primary">{task.patient.full_name}</p>
                          )}
                          <p className="text-sm text-on-surface-variant">
                            {task.assigned_time
                              ? new Date(`2000-01-01T${task.assigned_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                              : '—'}
                          </p>
                          {isDone && fb && (
                            <span className="text-xs text-text-secondary">{MOOD_EMOJI[fb.mood] || ''} {fb.mood}</span>
                          )}
                        </div>
                        <ChevronRight size={14} className="text-text-muted shrink-0" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {selectedTasks.length === 0 && (
              <p className="text-sm text-outline mt-5">No tasks assigned for this day.</p>
            )}

            {patientId && (
              <div className="mt-5 bg-surface-container-lowest rounded-xl p-3">
                <p className="text-xs font-bold text-outline uppercase tracking-wider mb-1.5">
                  Remarks for patient
                </p>
                <textarea
                  className="w-full text-sm text-text-primary bg-transparent resize-none focus:outline-none placeholder:text-text-muted"
                  rows={3}
                  placeholder="Feedback on the patient's performance this day..."
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  maxLength={2000}
                />
                <div className="flex items-center justify-between gap-2 mt-1">
                  <button
                    onClick={saveRemark}
                    disabled={remarkSaving || !remarkText.trim() || remarkText.trim() === (selRemark?.content || '')}
                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {remarkSaving ? 'Saving...' : selRemark ? 'Update' : 'Save'}
                  </button>
                  {remarkStatus && <span className="text-[11px] text-text-muted text-right">{remarkStatus}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      <Modal
        isOpen={!!selectedTask}
        onClose={() => { setSelectedTask(null); setPhotoRequest('') }}
        title={selectedTask?.title}
      >
        {selectedTask && (() => {
          const fb = feedbackMap[selectedTask.id]
          return (
            <div className="space-y-4">
              {!patientId && selectedTask.patient?.full_name && (
                <p className="text-sm font-semibold text-primary">{selectedTask.patient.full_name}</p>
              )}
              <div className="flex items-center gap-2">
                <Badge color={selectedTask.status}>{selectedTask.status.replace('_', ' ')}</Badge>
                {selectedTask.requires_proof && (
                  <span className="flex items-center gap-1 text-xs text-primary font-medium">
                    <CheckSquare size={12} /> Proof required
                  </span>
                )}
              </div>

              {selectedTask.assigned_time && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Clock size={14} />
                  {new Date(`2000-01-01T${selectedTask.assigned_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              )}

              {selectedTask.description && (
                <div>
                  <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-text-primary">{selectedTask.description}</p>
                </div>
              )}

              {selectedTask.resource_url && (
                <div>
                  <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Resources</p>
                  <p className="text-sm text-text-secondary break-all">{selectedTask.resource_url}</p>
                </div>
              )}

              {/* Patient completion data */}
              {selectedTask.status === 'completed' && (
                <div className="border-t border-border pt-4 space-y-3">
                  <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Patient Response</p>

                  {fb ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{MOOD_EMOJI[fb.mood] || ''}</span>
                        <span className="text-sm font-semibold text-text-primary capitalize">{fb.mood}</span>
                      </div>
                      {fb.note && (
                        <div className="flex items-start gap-2">
                          <MessageSquare size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <p className="text-sm text-text-secondary">{fb.note}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-text-muted italic">No feedback submitted</p>
                  )}

                  <ProofPhotos task={selectedTask} />
                  {selectedTask.requires_proof && (
                    <button
                      onClick={() => requestNewPhoto(selectedTask)}
                      disabled={photoRequest === 'sending'}
                      className="text-xs font-semibold text-primary hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {photoRequest === 'sent' ? 'Request sent ✓' : photoRequest === 'sending' ? 'Sending...' : 'Ask patient for a new photo'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
