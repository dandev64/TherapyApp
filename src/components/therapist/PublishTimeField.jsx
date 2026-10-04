import { Send, CalendarClock } from 'lucide-react'
import { defaultPublishValue, toLocalInputValue } from '../../utils/tasks'

/**
 * "When should the patient see this task?" — post now, or schedule for later.
 * `value` is '' (post now) or a datetime-local string.
 */
export default function PublishTimeField({ value, onChange }) {
  const scheduled = value !== ''
  const option = (active) =>
    `flex-1 flex items-center justify-center gap-2 min-h-11 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
      active
        ? 'border-primary bg-primary-container/40 text-primary'
        : 'border-border bg-surface-alt text-text-secondary hover:bg-surface-container'
    }`

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-text-secondary">Post to patient</label>
      <div className="flex gap-2">
        <button type="button" className={option(!scheduled)} onClick={() => onChange('')}>
          <Send size={14} /> Now
        </button>
        <button
          type="button"
          className={option(scheduled)}
          onClick={() => !scheduled && onChange(defaultPublishValue())}
        >
          <CalendarClock size={14} /> Schedule
        </button>
      </div>
      {scheduled && (
        <>
          <input
            type="datetime-local"
            aria-label="Post date and time"
            value={value}
            min={toLocalInputValue(new Date())}
            onChange={(e) => onChange(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-border text-base sm:text-sm bg-surface-alt text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card"
          />
          <p className="text-xs text-text-muted">
            The patient won&apos;t see this task (or get notified) until then.
          </p>
        </>
      )}
    </div>
  )
}
