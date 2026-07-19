import { Link } from 'react-router-dom'

type Props = {
  title: string
  subtitle?: string
  badge?: string
  /** Label kecil beraksen emas di atas badge (mis. "Perum Bulog Kanwil Lampung"). */
  eyebrow?: string
  backTo?: string
  backLabel?: string
  /** Lebar konten hero, disesuaikan dengan lebar konten halaman di bawahnya. */
  widthClass?: string
}

// Hero band navy bergaya landing page, dipakai bersama seluruh halaman role.
// Konten halaman biasanya ditarik naik (-mt-16) untuk menimpa bagian bawah hero.
export default function FormHero({
  title,
  subtitle,
  badge,
  eyebrow,
  backTo = '/dashboard',
  backLabel = 'Kembali ke dashboard',
  widthClass = 'max-w-6xl',
}: Props) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#14213f] via-primary-dark to-primary text-white">
      <div
        aria-hidden
        className="absolute inset-0 opacity-50"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-28 bottom-0 h-64 w-64 rounded-full bg-primary/50 blur-3xl" />
      {/* cincin dekoratif + motif bulir padi samar di kanan */}
      <div aria-hidden className="pointer-events-none absolute -right-8 top-2 hidden h-64 w-64 rounded-full border border-white/5 md:block" />
      <div aria-hidden className="pointer-events-none absolute right-10 top-14 hidden h-40 w-40 rounded-full border border-white/5 md:block" />
      <svg aria-hidden viewBox="0 0 64 64" className="pointer-events-none absolute right-12 top-1/2 hidden h-44 w-44 -translate-y-1/2 opacity-[0.09] lg:block">
        <g fill="#D9A441">
          <path d="M32 55 C30.4 43 30.4 28 32 16.5" fill="none" stroke="#D9A441" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M31 43.5 C22 43.5 16.6 48.5 15 55 C23 54 29.6 50.6 32 45.2 Z" />
          <ellipse cx="32" cy="12.6" rx="3" ry="5.4" />
          <ellipse cx="27.4" cy="21" rx="2.9" ry="5.2" transform="rotate(-36 27.4 21)" />
          <ellipse cx="36.6" cy="21" rx="2.9" ry="5.2" transform="rotate(36 36.6 21)" />
          <ellipse cx="27.4" cy="30" rx="2.9" ry="5.2" transform="rotate(-36 27.4 30)" />
          <ellipse cx="36.6" cy="30" rx="2.9" ry="5.2" transform="rotate(36 36.6 30)" />
          <ellipse cx="28.1" cy="39" rx="2.7" ry="4.9" transform="rotate(-36 28.1 39)" />
          <ellipse cx="35.9" cy="39" rx="2.7" ry="4.9" transform="rotate(36 35.9 39)" />
        </g>
      </svg>

      <div className={`relative mx-auto ${widthClass} px-6 pb-24 pt-7`}>
        <Link
          to={backTo}
          className="flex w-fit items-center gap-1.5 text-xs font-semibold text-white/70 transition-colors hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">&larr;</span>
          {backLabel}
        </Link>

        {eyebrow && (
          <p className="mt-6 flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.18em] text-accent">
            <span aria-hidden className="h-px w-7 bg-accent" />
            {eyebrow}
          </p>
        )}
        {badge && (
          <span
            className={`${eyebrow ? 'mt-3' : 'mt-6'} inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white`}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {badge}
          </span>
        )}
        <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
          {title}
          <span className="text-accent">.</span>
        </h1>
        <div aria-hidden className="mt-3.5 h-1 w-14 rounded-full bg-accent" />
        {subtitle && <p className="mt-3.5 max-w-2xl text-sm leading-6 text-white/70">{subtitle}</p>}
      </div>
    </section>
  )
}
