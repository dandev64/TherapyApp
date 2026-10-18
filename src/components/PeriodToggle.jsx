import { ChevronLeft, ChevronRight } from 'lucide-react'

const PERIODS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'Overall' },
]

/** Week | Month | Overall switch with ‹ › stepping through past weeks/months. */
export default function PeriodToggle({ period, onPeriodChange, offset, onOffsetChange, label }) {
  const canStep = period !== 'all'
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="inline-flex p-1 rounded-xl bg-surface-container self-start" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={period === p.key}
            onClick={() => { onPeriodChange(p.key); onOffsetChange(0) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              period === p.key ? 'bg-surface-card text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {canStep && (
          <button
            onClick={() => onOffsetChange(offset - 1)}
            aria-label={`Previous ${period}`}
            className="p-2.5 rounded-full hover:bg-surface-alt cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <span className="text-sm font-semibold text-text-secondary min-w-[9rem] text-center">{label}</span>
        {canStep && (
          <button
            onClick={() => onOffsetChange(offset + 1)}
            disabled={offset >= 0}
            aria-label={`Next ${period}`}
            className="p-2.5 rounded-full hover:bg-surface-alt cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
