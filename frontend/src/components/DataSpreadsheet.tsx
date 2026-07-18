import { useMemo, useState } from 'react'
import { downloadCsv, type ExportColumn } from '../lib/exportCsv'

export type SheetColumn<T> = ExportColumn<T> & {
  /** Tampilan sel di layar; default memakai `value`. */
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  /** Ikut dicari saat user mengetik di kotak pencarian. */
  searchable?: boolean
}

type Props<T> = {
  rows: T[]
  columns: SheetColumn<T>[]
  rowKey: (row: T) => string | number
  namaFile: string
  /** Judul kolom pertama yang "dibekukan" saat digulir horizontal. */
  emptyTitle?: string
  emptyCopy?: string
  isLoading?: boolean
}

/**
 * Tabel gaya spreadsheet: header lengket, baris zebra, nomor baris, kolom angka rata kanan,
 * gulir horizontal untuk kolom banyak, pencarian, dan tombol ekspor CSV.
 */
export default function DataSpreadsheet<T>({
  rows,
  columns,
  rowKey,
  namaFile,
  emptyTitle = 'Belum ada data',
  emptyCopy = 'Data akan muncul setelah proses berjalan.',
  isLoading = false,
}: Props<T>) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return rows
    const cols = columns.filter((c) => c.searchable !== false)
    return rows.filter((row) =>
      cols.some((c) => String(c.value(row) ?? '').toLowerCase().includes(key)),
    )
  }, [rows, columns, q])

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Cari di tabel..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="badge shrink-0">{filtered.length} baris</span>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(namaFile, filtered, columns)}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-primary-dark shadow-sm transition-all hover:bg-primary hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3v10m0 0 3.5-3.5M10 13l-3.5-3.5M3.5 15.5h13" />
          </svg>
          Ekspor CSV
        </button>
      </div>

      {isLoading && <div className="panel px-4 py-3 text-sm text-muted">Memuat data...</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">{rows.length === 0 ? emptyTitle : 'Tidak ada baris yang cocok'}</div>
          <p className="empty-copy">{rows.length === 0 ? emptyCopy : 'Coba kata kunci lain atau kosongkan pencarian.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[0.8125rem] whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-primary-tint text-primary-dark">
                <th className="border-b border-r border-border px-3 py-2 text-right font-bold">#</th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`border-b border-r border-border px-3 py-2 font-bold last:border-r-0 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={rowKey(row)} className="odd:bg-white even:bg-surface hover:bg-primary-tint/40">
                  <td className="border-b border-r border-border px-3 py-2 text-right text-muted tabular-nums">{i + 1}</td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`border-b border-r border-border px-3 py-2 last:border-r-0 ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                    >
                      {c.render ? c.render(row) : (c.value(row) ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
