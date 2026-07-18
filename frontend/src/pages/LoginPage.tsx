import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import logoSergab from '../assets/logo-sergab.png'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch {
      setError('Username atau password salah.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-surface md:grid-cols-2">
      {/* Panel kiri -- brand navy dramatis, mengikuti hero landing page. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#14213f] via-primary-dark to-primary text-white md:flex md:flex-col">
        {/* pola titik halus */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        {/* blob cahaya */}
        <div aria-hidden className="pointer-events-none absolute -right-28 -top-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-primary/50 blur-3xl" />
        {/* cincin dekoratif */}
        <div aria-hidden className="pointer-events-none absolute right-10 top-10 h-72 w-72 rounded-full border border-white/5" />
        <div aria-hidden className="pointer-events-none absolute right-24 top-24 h-44 w-44 rounded-full border border-white/5" />

        <div className="relative flex flex-1 flex-col justify-between p-10 lg:p-14">
          <Link to="/" className="flex items-center">
            <img src={logoSergab} alt="SerGab Lampung" className="h-8 w-auto" />
          </Link>

          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Perum Bulog Kanwil Lampung
            </span>
            <h2 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight lg:text-5xl">
              Selamat datang<span className="text-accent">.</span>
            </h2>
            <div className="mt-5 h-1 w-16 rounded-full bg-accent" />
            <p className="mt-6 max-w-md text-sm leading-7 text-white/70">
              Masuk untuk memantau serap gabah dari input awal, review, PO, pembayaran, operasi, sampai penerimaan gudang.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white">TJP</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white">MPP</span>
            </div>
          </div>

          <p className="text-xs text-white/40">2026 Perum BULOG Kanwil Lampung. Seluruh hak cipta dilindungi.</p>
        </div>
      </aside>

      {/* Panel kanan -- form login. */}
      <div className="relative flex flex-col px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-sm items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-primary-dark"
          >
            <span aria-hidden className="text-base leading-none">&larr;</span>
            Kembali ke beranda
          </Link>
          {/* logo ringkas untuk tampilan mobile (panel kiri disembunyikan) */}
          <span className="rounded-lg bg-primary-dark px-2.5 py-1.5 md:hidden">
            <img src={logoSergab} alt="SerGab Lampung" className="h-5 w-auto" />
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <form onSubmit={handleSubmit} className="w-full max-w-sm">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Masuk ke SerGab Lampung</h1>
            <p className="mt-1.5 text-sm text-slate-500">Gunakan akun yang telah terdaftar untuk melanjutkan.</p>

            {error && <p className="alert-danger mt-6">{error}</p>}

            <div className="mt-6">
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="mt-4">
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-7 w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-primary-dark shadow-sm transition-all hover:bg-primary hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
