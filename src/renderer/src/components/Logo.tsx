export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#3ee0a2" />
      <path d="M7 17 V8" stroke="#06281c" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 12 C11 12 11 7.5 15 7.5 H18" stroke="#06281c" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="7" cy="17" r="2" fill="#06281c" />
      <circle cx="7" cy="8" r="2" fill="#06281c" />
      <circle cx="18" cy="7.5" r="2" fill="#06281c" />
    </svg>
  )
}
