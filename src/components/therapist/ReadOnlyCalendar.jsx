import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ChevronLeft, ChevronRight, CheckCircle, Camera, MessageSquare } from 'lucide-react'

const MOOD_EMOJI = {
  excited: '🤩', happy: '😊', calm: '😌', scared: '😨',
  anxious: '😰', angry: '😠', tired: '😴', sad: '😢',
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
  const [remarks, setRemarks] = useState({})
  const [loading, setLoading] = useState(true)

  const todayStr = toDateStr(new Date())
  const { year, month } = currentMonth

  useEffect(() => {
    if (!patientId) return
    setLoading(true)
    const startOfMonth = toDateStr(new Date(year, month, 1))
    const endOfMonth = toDateStr(new Date(year, month + 1, 0))

    Promise.all([
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
        .eq('therapist_id', therapistId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth),
      supabase
        .from('task_feedback')
        .select('task_assignment_id, mood, note, created_at')
        .eq('patient_id', patientId)
        .gte('created_at', new Date(year, month, 1).toISOString())
        .lte('created_at', new Date(year, month + 1, 0, 23, 59, 59).toISOString()),
    ]).then(([tasksRes, remarksRes, feedbackRes]) => {
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
    })
  }, [patientId, year, month])

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
  const realTasks = selectedTasks.filter((t) => !t.is_rest_day)
  const isRestDay = selectedTasks.some((t) => t.is_rest_day) && realTasks.length === 0
  const completedCount = realTasks.filter((t) => t.status === 'completed').length
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
          <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-surface-alt transition-colors cursor-pointer">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-surface-alt transition-colors cursor-pointer">
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
                const dayRealTasks = dayTasks.filter((t) => !t.is_rest_day)
                const dayIsRest = dayTasks.some((t) => t.is_rest_day) && dayRealTasks.length === 0
                const dayCompleted = dayRealTasks.filter((t) => t.status === 'completed').length
                const dayTotal = dayRealTasks.length
                const allDone = dayTotal > 0 && dayCompleted === dayTotal
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const hasTherapy = dayRealTasks.some((t) => t.therapy_type)

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`rounded-2xl p-1.5 sm:p-3 aspect-square flex flex-col justify-between transition-all cursor-pointer group text-left
                      ${isToday ? 'bg-primary-container ring-2 ring-primary ring-offset-2' : ''}
                      ${isSelected && !isToday ? 'bg-primary/10 ring-2 ring-primary/40' : ''}
                      ${!isToday && !isSelected && allDone ? 'bg-secondary-container/20' : ''}
                      ${!isToday && !isSelected && dayIsRest ? 'bg-surface-container/50' : ''}
                      ${!isToday && !isSelected && !allDone && !dayIsRest ? 'bg-surface-container-lowest hover:bg-primary-container/20' : ''}
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
                      {dayIsRest && (
                        <span className="text-outline text-[10px]">😴</span>
                      )}
                      {hasTherapy && !dayIsRest && (
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
                            {dayRealTasks.slice(0, 4).map((t, i) => (
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
                          {dayRealTasks.map((t, i) => (
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
            {isRestDay ? (
              <p className="text-sm text-outline mt-1">😴 Rest day</p>
            ) : (
              <p className="text-secondary font-medium text-sm mt-1">
                {completedCount} of {realTasks.length} completed
              </p>
            )}

            {realTasks.length > 0 && (
              <div className="mt-5 space-y-3">
                {realTasks.map((task) => {
                  const isDone = task.status === 'completed'
                  const fb = feedbackMap[task.id]
                  return (
                    <div key={task.id} className="relative pl-6">
                      <div className="absolute left-0 top-1">
                        {isDone ? (
                          <CheckCircle size={16} className="text-secondary" style={{ fill: 'currentColor', stroke: 'var(--color-surface)' }} />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-primary/20" />
                        )}
                      </div>
                      <p className={`text-sm font-bold ${isDone ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                        {task.title}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        {task.assigned_time
                          ? new Date(`2000-01-01T${task.assigned_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          : task.assigned_time_of_day}
                      </p>

                      {/* Patient inputs */}
                      {isDone && (
                        <div className="mt-2 space-y-1.5">
                          {fb && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{MOOD_EMOJI[fb.mood] || ''}</span>
                              <span className="text-xs text-text-secondary capitalize">{fb.mood}</span>
                            </div>
                          )}
                          {fb?.note && (
                            <div className="flex items-start gap-1.5">
                              <MessageSquare size={12} className="text-text-muted mt-0.5 shrink-0" />
                              <p className="text-xs text-text-secondary">{fb.note}</p>
                            </div>
                          )}
                          {task.proof_url && (
                            <a href={task.proof_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                              <Camera size={12} />
                              View proof photo
                            </a>
                          )}
                          {task.resource_url && (
                            <p className="text-xs text-text-muted italic truncate">Resources: {task.resource_url}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {realTasks.length === 0 && !isRestDay && (
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
    </div>
  )
}
