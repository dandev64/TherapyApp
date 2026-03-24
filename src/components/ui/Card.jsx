export default function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`
        bg-surface-card rounded-2xl border border-border-light p-6
        shadow-[0_20px_40px_rgba(44,52,54,0.04)]
        ${hover ? 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}
