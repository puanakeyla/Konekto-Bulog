import type { PaginationMeta } from '../hooks/useTransaksiList'

type Props = {
  meta?: PaginationMeta
  page: number
  onPage: (page: number) => void
}

/** Kontrol paginasi ringkas untuk daftar terpaginasi (sembunyi bila hanya satu halaman). */
export default function Pagination({ meta, page, onPage }: Props) {
  if (!meta || meta.last_page <= 1) return null

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>Menampilkan {meta.from ?? 0}–{meta.to ?? 0} dari {meta.total}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
        <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
        <button type="button" className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => onPage(page + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}
