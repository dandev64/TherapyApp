import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toDateStr } from '../../utils/streak'
import { ChevronLeft, ChevronRight, CheckCircle, MessageSquare, Clock, CheckSquare } from 'lucide-react'
import Modal from '../ui/Modal'
import Badge from '../ui/Badge'

const MOOD_EMOJI = {
  excited: '🤩', happy: '😊', calm: '😌', scared: '😨',
  anxious: '😰', angry: '😠', tired: '😴', sad: '😢',
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function ReadOnlyCalendar({ patientId, therapistId }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [tasks, setTasks] = useState([])
  const [feedbackMap, setFeedbackMap] = useState({})
  const [proofUrls, setProofUrls] = useState({})
  const [remarks, setRemarks] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)

  const todayStr = toDateStr(new Date())
  const { year, month } = currentMonth

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const startOfMonth = toDateStr(new Date(year, month, 1))
      const endOfMonth = toDateStr(new Date(year, month + 1, 0))

      const [tasksRes, remarksRes, feedbackRes] = await Promise.all([
      supabase
        .from('task_assignments')
        .select('*')
        .eq('patient_id', patientId)
        .eq('therapist_id', therapistId)
        .gte('assigned_date', startOfMonth)
        .lte('assigned_date', endOfMonth)
        .order('created_at', { ascending: true }),
      supabase
        .from('daily_remarks')
        .select('date, content')
        .eq('patient_id', patientId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth),
      supabase
        .from('task_feedback')
        .select('task_assignment_id, mood, note, created_at')
        .eq('patient_id', patientId)
        .gte('created_at', new Date(year, month, 1).toISOString())
        .lte('created_at', new Date(year, month + 1, 0, 23, 59, 59).toISOString()),
    ])
      if (cancelled) return
      setTasks(tasksRes.data || [])
      const remarksMap = {}
      ;(remarksRes.data || []).forEach((r) => {
        remarksMap[r.date] = r
      })
      setRemarks(remarksMap)
      const fbMap = {}
      ;(feedbackRes.data || []).forEach((fb) => {
        fbMap[fb.task_assignment_id] = fb
      })
      setFeedbackMap(fbMap)
      setLoading(false)
      
      


    }
    load()
    return () => { cancelled = true }
  }, [patientId, therapistId, year, month])

  useEffect(() => {
    if (!tasks.length) return

    const urls = {}

    Promise.all(
      tasks
        .filter(t => t.proof_url)
        .map(async (t) => {
          try {
            if (t.proof_url.startsWith('http')) {
              urls[t.id] = t.proof_url
              return
            }

            const { data } = await supabase.storage
              .from('task-proofs')
              .createSignedUrl(t.proof_url, 3600)

            if (data?.signedUrl) {
              urls[t.id] = data.signedUrl
            } else {
              const { data: pubData } = supabase.storage
                .from('task-proofs')
                .getPublicUrl(t.proof_url)

              if (pubData?.publicUrl) {
                urls[t.id] = pubData.publicUrl
              }
            }
          } catch (err) {
            console.error('Error generating proof URL:', err)
          }
        })
    ).then(() => {
      setProofUrls(urls)
    })
  }, [tasks])


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

            {selRemark?.content && (
              <div className="mt-5 bg-surface-container-lowest rounded-xl p-3">
                <p className="text-xs font-bold text-outline uppercase tracking-wider mb-1.5">Patient Remark</p>
                <p className="text-sm text-text-primary">{selRemark.content}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      <Modal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.title}
      >
        {selectedTask && (() => {
          const fb = feedbackMap[selectedTask.id]
          return (
            <div className="space-y-4">
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

                  {selectedTask.proof_url && (
                    <div>
                      <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                        Proof Photo
                      </p>

                      {proofUrls[selectedTask.id] ? (
                        <a
                          href={proofUrls[selectedTask.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={proofUrls[selectedTask.id]}
                            alt="Proof"
                            className="w-full max-w-xs rounded-xl border border-border"
                          />
                        </a>
                      ) : (
                        <p className="text-sm text-text-muted">Loading proof image...</p>
                      )}
                    </div>
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
