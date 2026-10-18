import { ChevronRight, Flame, AlertTriangle, CalendarOff } from 'lucide-react'
import Card from '../ui/Card'

function getStatusPill(patient) {
  if (patient.archived) return { label: 'Archived', className: 'bg-surface-container text-text-muted' }
  if (patient.restDayToday) return { label: 'Rest Day', className: 'bg-primary-container text-primary' }
  if (patient.totalToday === 0) return { label: 'No Activity', className: 'bg-danger-bg text-danger' }
  const pct = (patient.completedToday / patient.totalToday) * 100
  if (pct >= 50) return { label: 'On Track', className: 'bg-secondary-container text-secondary' }
  return { label: 'Needs Attention', className: 'bg-amber-100 text-amber-800' }
}

export default function PatientCard({ patient, onClick, onRestDay, restDayBusy = false }) {
  const { label, className } = getStatusPill(patient)
  const noTasks = !patient.archived && patient.totalToday === 0 && !patient.restDayToday

  function stop(fn) {
    return (e) => { e.stopPropagation(); fn() }
  }

  return (
    <Card hover onClick={onClick} className={noTasks ? '!border-red-300 !bg-red-50/30' : ''}>
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {patient.full_name?.charAt(0)?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-text-primary truncate">
              {patient.full_name}
            </p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${className}`}>
              {label}
            </span>
          </div>
          {patient.condition && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{patient.condition}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            <span className="text-xs text-text-secondary">
              <span className="font-bold text-text-primary">{patient.completedToday}</span>
              /{patient.totalToday} today
            </span>
            {patient.streak > 0 && (
              <span className="text-xs text-text-secondary flex items-center gap-0.5">
                <Flame size={12} className="text-warning" />
                <span className="font-bold text-text-primary">{patient.streak}</span>
              </span>
            )}
            <span className="text-xs text-text-secondary" title="Whole course of therapy">
              <span className="font-bold text-text-primary">{patient.consistency}%</span> consistency
            </span>
            {patient.missed > 0 && (
              <span className="text-xs text-red-600" title="This week (Sun–Sat)">
                <span className="font-bold">{patient.missed}</span> missed this week
              </span>
            )}
          </div>

          {noTasks && (
            <div className="flex items-center gap-1.5 mt-2">
              <AlertTriangle size={12} className="text-red-500 shrink-0" />
              <span className="text-xs font-semibold text-red-600">No tasks assigned this day</span>
            </div>
          )}
          {patient.restDayToday && !patient.archived && (
            <div className="flex items-center gap-1.5 mt-2">
              <CalendarOff size={12} className="text-primary shrink-0" />
              <span className="text-xs font-semibold text-primary">No tasks for today</span>
              {onRestDay && (
                <button
                  onClick={stop(() => onRestDay(false))}
                  disabled={restDayBusy}
                  className="ml-1 py-1 text-xs font-semibold text-text-muted underline hover:text-text-primary cursor-pointer disabled:opacity-50"
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </div>

        {noTasks && onRestDay && (
          <button
            onClick={stop(() => onRestDay(true))}
            disabled={restDayBusy}
            className="hidden sm:inline-flex shrink-0 px-4 py-2.5 rounded-xl bg-surface-container text-sm font-semibold text-text-primary hover:bg-primary-container hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            No tasks for today
          </button>
        )}
        <ChevronRight size={18} className="text-text-muted shrink-0" />
      </div>
      {noTasks && onRestDay && (
        <button
          onClick={stop(() => onRestDay(true))}
          disabled={restDayBusy}
          className="sm:hidden mt-3 w-full px-4 py-2.5 rounded-xl bg-surface-container text-sm font-semibold text-text-primary hover:bg-primary-container cursor-pointer disabled:opacity-50"
        >
          No tasks for today
        </button>
      )}
    </Card>
  )
}
