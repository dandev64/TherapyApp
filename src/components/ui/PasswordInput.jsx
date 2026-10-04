import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Password field with a show/hide toggle. Same props as Input. */
export default function PasswordInput({ label, error, className = '', ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="text-sm font-semibold text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          className={`
            w-full pl-4 pr-12 py-3 rounded-xl border text-sm
            bg-surface-alt text-text-primary placeholder:text-text-muted
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card
            ${error ? 'border-danger' : 'border-border'}
          `}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-text-muted hover:text-text-primary cursor-pointer"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
