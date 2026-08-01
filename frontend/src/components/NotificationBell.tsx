import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarkAllNotifikasiRead, useMarkNotifikasiRead, useNotifikasi, type NotifikasiItem } from '../hooks/useNotifikasi'

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M10 2a5 5 0 0 0-5 5v2.64c0 .64-.2 1.26-.57 1.78l-.9 1.26A1.45 1.45 0 0 0 4.7 15h10.6a1.45 1.45 0 0 0 1.18-2.32l-.9-1.26A3.04 3.04 0 0 1 15 9.64V7a5 5 0 0 0-5-5Zm0 16a2.6 2.6 0 0 0 2.45-1.75h-4.9A2.6 2.6 0 0 0 10 18Z" />
    </svg>
  )
}

function tone(tipe: string) {
  if (tipe === 'ditolak') return 'bg-danger-bg text-danger'
  if (tipe === 'diterima') return 'bg-success-bg text-success'
  return 'bg-warning-bg text-warning'
}

function label(tipe: string) {
  if (tipe === 'ditolak') return 'Ditolak'
  if (tipe === 'diterima') return 'Diterima'
  if (tipe === 'dikirim') return 'Dikirim'
  return tipe.replaceAll('_', ' ')
}

function waktu(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useNotifikasi(enabled)
  const markRead = useMarkNotifikasiRead()
  const markAllRead = useMarkAllNotifikasiRead()

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const items = data?.data ?? []
  const unread = data?.unread_count ?? 0

  const readThenClose = (item: NotifikasiItem) => {
    if (!item.read_at) markRead.mutate(item.id)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition-colors hover:border-accent hover:bg-white/10 hover:text-white"
        aria-label="Notifikasi"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-[0.62rem] font-black leading-4 text-primary-dark shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-white text-slate-700 shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
            <div>
              <div className="text-sm font-bold text-primary-dark">Notifikasi</div>
              <div className="text-xs text-muted">Dikirim, diterima, dan ditolak</div>
            </div>
            <button type="button" onClick={() => markAllRead.mutate()} disabled={unread === 0 || markAllRead.isPending} className="text-xs font-bold text-primary disabled:text-muted">
              Tandai dibaca
            </button>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {isLoading && <div className="px-4 py-5 text-sm text-muted">Memuat notifikasi...</div>}
            {!isLoading && items.length === 0 && <div className="px-4 py-5 text-sm text-muted">Belum ada notifikasi.</div>}
            {!isLoading && items.map((item) => (
              <div key={item.id} className={`border-b border-border px-4 py-3 last:border-b-0 ${item.read_at ? 'bg-white' : 'bg-primary-tint/35'}`}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className={`rounded px-2 py-0.5 text-[0.65rem] font-black uppercase ${tone(item.tipe)}`}>{label(item.tipe)}</span>
                  <span className="shrink-0 text-[0.68rem] font-semibold text-muted">{waktu(item.created_at)}</span>
                </div>
                <div className="text-sm font-bold text-primary-dark">{item.judul}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.pesan}</p>
                {item.transaksi_id && (
                  <Link to={`/transaksi/${encodeURIComponent(item.transaksi_id)}`} onClick={() => readThenClose(item)} className="mt-2 inline-flex text-xs font-bold text-primary hover:underline">
                    Buka transaksi
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
