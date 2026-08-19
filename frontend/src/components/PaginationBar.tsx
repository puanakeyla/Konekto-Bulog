import type { Dispatch, SetStateAction } from 'react'

export type PaginationBarMeta = {
  current_page: number
  last_page: number
  total: number
  from: number | null
  to: number | null
}

/**
 * Navigasi halaman untuk daftar berhalaman. Diangkat dari KeuanganPage supaya layar Rekap
 * memakai persis kontrol yang sama -- sebelumnya Rekap tidak punya kontrol apa pun dan diam-diam
 * berhenti di halaman pertama.
 *
 * Selalu menyebut "dari {total}", termasuk saat cuma ada satu halaman: angka itulah yang
 * memberi tahu pengguna bahwa yang dilihatnya memang seluruh data.
 */
export default function PaginationBar({
  meta,
  page,
  setPage,
  satuan = 'baris',
}: {
  meta: PaginationBarMeta
  page: number
  setPage: Dispatch<SetStateAction<number>>
  satuan?: string
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} {satuan}</span>
      <div className="flex gap-2">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
        <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
        <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}
