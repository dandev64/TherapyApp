import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus'
import { toDateStr } from '../../utils/streak'
import { formatClock } from '../../utils/time'
import { postedOnly } from '../../utils/tasks'
import { ChevronLeft, ChevronRight, CheckCircle, Lock } from 'lucide-react'

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function SchedulePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  // ?date=YYYY-MM-DD opens the schedule on that day (used by notifications)
  const [searchParams] = useSearchParams()
  const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('date') || '') ? searchParams.get('date') : null
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState(dateParam || toDateStr(new Date()))
  const [tasks, setTasks] = useCachedState('patient-schedule-tasks', [])

  // Follow ?date= changes while already on this page
  useEffect(() => {
    if (!dateParam) return
    const d = new Date(dateParam + 'T00:00:00')
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
    setSelectedDate(dateParam)
  }, [dateParam])
  const [loading, setLoading] = useState(() => !hasCache('patient-schedule-tasks'))
  const [error, setError] = useState(null)
  const refreshKey = useRefreshOnFocus()

  const todayStr = toDateStr(new Date())

  // Load tasks for the visible month
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return
    const { year, month } = currentMonth
    const startOfMonth = toDateStr(new Date(year, month, 1))
    const endOfMonth = toDateStr(new Date(year, month + 1, 0))

    supabase
      .from('task_assignments')
      .select('*')
      .eq('patient_id', profile.id)
      .gte('assigned_date', startOfMonth)
      .lte('assigned_date', endOfMonth)
      .order('assigned_time', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) {
          setError('Failed to load schedule. Please try again.')
          setLoading(false)
          return
        }
        setError(null)
        setTasks(postedOnly(data))
        setLoading(false)
      })
  }, [profile, currentMonth, refreshKey])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const grouped = {}
    tasks.forEach((t) => {
      if (!grouped[t.assigned_date]) grouped[t.assigned_date] = []
      grouped[t.assigned_date].push(t)
    })
    return grouped
  }, [tasks])

  const selectedTasks = tasksByDate[selectedDate] || []
  const completedCount = selectedTasks.filter((t) => t.status === 'completed').length

  // Calendar grid calculations
  const { year, month } = currentMonth
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

  function prevMonth() {
    setCurrentMonth((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 }))
  }
  function nextMonth() {
    setCurrentMonth((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 }))
  }
  function goToday() {
    const now = new Date()
    setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() })
    setSelectedDate(toDateStr(now))
  }

  // Parse selected date for display
  const selDateObj = new Date(selectedDate + 'T00:00:00')
  const selDayName = FULL_DAYS[selDateObj.getDay()]
  const selDayNum = selDateObj.getDate()
  // Tasks on future days are view-only
  const isFutureDay = selectedDate > todayStr

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-extrabold text-primary">
            {MONTHS[month]} {year}
          </h2>
          <p className="text-on-surface-variant mt-1">Your therapy schedule</p>
        </div>
        <div className="flex items-center gap-1 bg-surface-container rounded-full px-1.5 py-1">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="p-2.5 rounded-full hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goToday}
            title="Go to today"
            className="px-4 py-2.5 min-w-[4.5rem] text-sm font-semibold text-text-primary hover:bg-surface-alt rounded-full transition-colors cursor-pointer"
          >
            {isCurrentMonth ? 'Today' : MONTHS[month].slice(0, 3)}
          </button>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="p-2.5 rounded-full hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Content: Calendar + Detail Panel */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Calendar Grid */}
        <div className="flex-1 bg-surface-container-low rounded-3xl p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {/* Day headers */}
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-[10px] sm:text-xs font-bold text-outline uppercase tracking-widest text-center py-1.5">
                {d}
              </div>
            ))}

            {/* Empty cells before 1st */}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} className="bg-surface-container/30 rounded-2xl opacity-40 aspect-square" />
            ))}

            {/* Day cells */}
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

        {/* Right Panel — Selected Day Detail */}
        <div className="w-full lg:w-80 lg:shrink-0 bg-surface-container-lowest rounded-3xl p-6 sm:p-8 lg:sticky lg:top-28 shadow-sm self-start">
          <p className="text-xs font-bold text-outline uppercase tracking-[0.2em]">Selected Day</p>
          <h3 className="text-3xl font-extrabold text-text-primary mt-1">
            {selDayName} {selDayNum}
          </h3>
          <p className="text-secondary font-medium text-sm mt-1">
            {completedCount} of {selectedTasks.length} completed
          </p>

          {/* Task Timeline */}
          {selectedTasks.length > 0 && (
            <div className="mt-6 space-y-3">
              {selectedTasks.map((task) => {
                const isDone = task.status === 'completed'
                return (
                  <div
                    key={task.id}
                    className="relative pl-9 cursor-pointer rounded-xl p-3 -ml-3 hover:bg-primary-container/30 transition-colors"
                    onClick={() => navigate(`/patient/task/${task.id}`)}
                  >
                    <div className="absolute left-3 top-4">
                      {isDone ? (
                        <CheckCircle size={16} className="text-secondary" style={{ fill: 'currentColor', stroke: 'var(--color-surface)' }} />
                      ) : isFutureDay ? (
                        <Lock size={14} className="text-text-muted" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-primary/20" />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-bold ${isDone ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                            {task.description}
                          </p>
                        )}
                        <p className="text-sm text-on-surface-variant">
                          {task.assigned_time ? formatClock(task.assigned_time) : '—'}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-text-muted shrink-0" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedTasks.length === 0 && (
            <p className="text-sm text-outline mt-6">No tasks assigned for this day.</p>
          )}

          {isFutureDay && selectedTasks.length > 0 && (
            <p className="mt-6 text-xs text-text-muted flex items-center gap-1.5">
              <Lock size={12} /> These tasks open on their scheduled day.
            </p>
          )}

          {/* Start Tasks Button */}
          {!isFutureDay && selectedTasks.length > 0 && selectedTasks.some((t) => t.status !== 'completed') && (
            <button
              onClick={() => {
                const next = selectedTasks.find((t) => t.status !== 'completed')
                if (next) navigate(`/patient/task/${next.id}`)
              }}
              className="w-full mt-6 bg-primary text-on-primary rounded-full py-3 font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              Start Tasks
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
