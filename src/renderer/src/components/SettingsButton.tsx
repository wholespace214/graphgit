export function SettingsButton({ onClick, disabled, active }: { onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      className={active ? 'ghost icon-ghost on' : 'ghost icon-ghost'}
      onClick={onClick}
      disabled={disabled}
      title="Settings"
      aria-label="Settings"
      aria-pressed={active}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          d="M19.4 13.2a7.6 7.6 0 0 0 .1-1.2 7.6 7.6 0 0 0-.1-1.2l1.8-1.4-1.8-3.1-2.2.9a7.2 7.2 0 0 0-2.1-1.2L14.6 3h-5.2l-.5 2.2a7.2 7.2 0 0 0-2.1 1.2l-2.2-.9-1.8 3.1 1.8 1.4a7.6 7.6 0 0 0-.1 1.2 7.6 7.6 0 0 0 .1 1.2l-1.8 1.4 1.8 3.1 2.2-.9a7.2 7.2 0 0 0 2.1 1.2l.5 2.2h5.2l.5-2.2a7.2 7.2 0 0 0 2.1-1.2l2.2.9 1.8-3.1-1.8-1.4z"
        />
      </svg>
    </button>
  )
}
