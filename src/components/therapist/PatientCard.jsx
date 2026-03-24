import { ChevronRight, Flame } from 'lucide-react'
import Card from '../ui/Card'

function getStatusPill(completedToday, totalToday) {
  if (totalToday === 0) {
    return { label: 'No Activity', className: 'bg-danger-bg text-danger' }
  }
  const pct = (completedToday / totalToday) * 100
  if (pct >= 50) {
    return { label: 'On Track', className: 'bg-secondary-container text-secondary' }
  }
  return { label: 'Needs Attention', className: 'bg-amber-100 text-amber-800' }
}

export default function PatientCard({ patient, onClick }) {
  const { label, className } = getStatusPill(patient.completedToday, patient.totalToday)

  return (
    <Card hover onClick={onClick}>
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

          <div className="flex items-center gap-4 mt-2">
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
            <span className="text-xs text-text-secondary">
              <span className="font-bold text-text-primary">{patient.consistency}%</span> consistency
            </span>
          </div>
        </div>

        <ChevronRight size={18} className="text-text-muted shrink-0" />
      </div>
    </Card>
  )
}
