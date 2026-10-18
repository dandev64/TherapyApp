import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Input from '../ui/Input'

const inputClass = 'flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card'

/** Editable list of resource links (one per row). */
export function LinkListField({ links, onChange }) {
  const rows = links.length ? links : ['']
  function update(i, value) {
    const next = [...rows]
    next[i] = value
    onChange(next)
  }
  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-text-secondary">Resources (links or instructions)</span>
      {rows.map((link, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            inputMode="url"
            value={link}
            onChange={(e) => update(i, e.target.value)}
            placeholder="https://..."
            maxLength={500}
            aria-label={`Resource ${i + 1}`}
            className={inputClass}
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              aria-label={`Remove resource ${i + 1}`}
              className="p-2.5 rounded-xl text-text-muted hover:text-red-500 hover:bg-surface-alt cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      {rows.length < 10 && (
        <button
          type="button"
          onClick={() => onChange([...rows, ''])}
          className="inline-flex items-center gap-1.5 py-1.5 text-sm font-semibold text-primary hover:underline cursor-pointer"
        >
          <Plus size={14} /> Add link
        </button>
      )}
    </div>
  )
}

const chipDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Pick one or more dates; each date becomes its own task. */
export function DateListField({ dates, onChange }) {
  const [draft, setDraft] = useState('')
  function add(value) {
    if (!value || dates.includes(value)) return
    onChange([...dates, value].sort())
    setDraft('')
  }
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <Input
            label={dates.length > 1 ? `Dates (${dates.length})` : 'Date'}
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border border-border text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer disabled:opacity-40 disabled:cursor-default"
        >
          <Plus size={14} /> Add date
        </button>
      </div>
      {dates.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {dates.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-primary-container text-xs font-semibold text-primary">
              {chipDate(d)}
              <button
                type="button"
                onClick={() => onChange(dates.filter((x) => x !== d))}
                aria-label={`Remove ${chipDate(d)}`}
                className="p-1 rounded-full hover:bg-primary/10 cursor-pointer"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-600">Add at least one date.</p>
      )}
    </div>
  )
}
