export function BackButton({
  onClick,
  disabled,
  title,
  label,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  label?: string
}) {
  return (
    <button
      type="button"
      className={label ? 'ghost back-button' : 'ghost icon-ghost'}
      onClick={onClick}
      disabled={disabled}
      title={title ?? 'Back'}
      aria-label={label ? undefined : 'Back'}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M7.2 3.2 3 8l4.2 4.8M3.4 8H13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  )
}
