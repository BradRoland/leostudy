import './AcademyBrand.css'

export function AcademyLogo({ className = '', label = '180 Academy' }: { className?: string; label?: string }) {
  return <span className={`academy-logo ${className}`} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} />
}

export function AcademyBrand({ className = '', compact = false, caption }: { className?: string; compact?: boolean; caption?: string }) {
  return <span className={`academy-brand-lockup ${className}`}>
    <AcademyLogo label={compact ? '180 Academy' : ''} />
    {!compact ? <span className="academy-brand-wordmark"><strong>180 <span>Academy</span></strong>{caption ? <small>{caption}</small> : null}</span> : null}
  </span>
}
