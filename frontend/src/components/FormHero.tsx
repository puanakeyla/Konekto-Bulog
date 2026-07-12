import { Link } from 'react-router-dom'

type Props = {
  title: string
  subtitle?: string
  badge?: string
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

      <div className={`relative mx-auto ${widthClass} px-6 pb-24 pt-7`}>
        <Link
          to={backTo}
          className="flex w-fit items-center gap-1.5 text-xs font-semibold text-white/70 transition-colors hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">&larr;</span>
          {backLabel}
        </Link>

        {badge && (
          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {badge}
          </span>
        )}
        <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
          {title}
          <span className="text-accent">.</span>
        </h1>
        {subtitle && <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{subtitle}</p>}
      </div>
    </section>
  )
}
