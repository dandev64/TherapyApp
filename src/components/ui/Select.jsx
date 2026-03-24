export default function Select({ label, options, error, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="text-sm font-semibold text-text-secondary">
          {label}
        </label>
      )}
      <select
        className={`
          w-full px-4 py-3 rounded-xl border text-sm
          bg-surface-alt text-text-primary
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white
          ${error ? 'border-danger' : 'border-border'}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
