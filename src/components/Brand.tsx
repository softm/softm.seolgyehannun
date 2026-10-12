import { Link } from "react-router-dom";

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="34" height="34" rx="11" fill="#004541" />
      <path d="M10.5 13.5L18.7 9.5L29.5 14.8V25.8L20.1 30.5L10.5 25.6V13.5Z" fill="#ABEFe8" />
      <path d="M10.5 13.5L20.1 18.2L29.5 14.8M20.1 18.2V30.5" stroke="#004541" strokeWidth="2.1" strokeLinejoin="round" />
      <circle cx="20.1" cy="18.2" r="2.2" fill="#F8F9FF" stroke="#004541" strokeWidth="1.4" />
    </svg>
  );
}

export function Brand({ compact = false, to = "/" }: { compact?: boolean; to?: string }) {
  return (
    <Link className="brand" to={to} aria-label="설계한눈 홈">
      <LogoMark size={compact ? 32 : 38} />
      <span>
        <strong>설계한눈</strong>
        {!compact && <small>인허가 업무관리</small>}
      </span>
    </Link>
  );
}
