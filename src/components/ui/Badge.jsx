const colorMap = {
  speech: 'bg-speech-bg text-speech',
  occupational: 'bg-occupational-bg text-occupational',
  physical: 'bg-physical-bg text-physical',
  pending: 'bg-warning-bg text-warning',
  in_progress: 'bg-blue-50 text-blue-600',
  completed: 'bg-success-bg text-success',
  therapist: 'bg-primary/10 text-primary',
  caregiver: 'bg-secondary/10 text-secondary',
  patient: 'bg-tertiary/10 text-tertiary',
  morning: 'bg-amber-50 text-amber-600',
  afternoon: 'bg-sky-50 text-sky-600',
  evening: 'bg-indigo-50 text-indigo-600',
}

export default function Badge({ children, color = 'primary', className = '' }) {
  const colorClass = colorMap[color] || 'bg-surface-alt text-text-secondary'

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full
        text-xs font-semibold tracking-wide capitalize
        ${colorClass} ${className}
      `}
    >
      {children}
    </span>
  )
}
