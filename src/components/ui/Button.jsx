const variants = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-light active:bg-primary-dark shadow-sm hover:shadow-md',
  secondary:
    'bg-surface-card text-primary border border-primary/20 hover:bg-surface-alt active:bg-surface',
  ghost:
    'text-text-secondary hover:bg-surface-alt active:bg-surface',
  danger:
    'bg-danger text-white hover:bg-red-600 active:bg-red-700',
}

const sizes = {
  sm: 'px-4 py-2 text-sm rounded-xl',
  md: 'px-5 py-3 text-sm rounded-2xl',
  lg: 'px-6 py-3.5 text-base rounded-full',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-bold
        transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        cursor-pointer active:scale-[0.98]
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
