import { useMemo, useState } from 'react'
import { downloadCsv, type ExportColumn } from '../lib/exportCsv'

export type SheetColumn<T> = ExportColumn<T> & {
  /** Tampilan sel di layar; default memakai `value`. */
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  /** Ikut dicari saat user mengetik di kotak pencarian. */
  searchable?: boolean
  /** Beri dropdown filter berisi nilai unik kolom ini. */
  filterable?: boolean
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
  // key kolom -> daftar nilai yang dipilih. Kolom tanpa entri berarti tidak difilter.
  const [filters, setFilters] = useState<Record<string, string[]>>({})

  const kolomFilter = useMemo(() => columns.filter((c) => c.filterable), [columns])

  /** Nilai unik per kolom filter, diambil dari data mentah supaya pilihan tidak ikut menyusut. */
  const opsiFilter = useMemo(() => {
    const hasil: Record<string, string[]> = {}
    for (const c of kolomFilter) {
      const nilai = new Set<string>()
      for (const row of rows) {
        const v = c.value(row)
        if (v !== null && v !== undefined && v !== '') nilai.add(String(v))
      }
      hasil[c.key] = [...nilai].sort((a, b) => a.localeCompare(b, 'id-ID'))
    }
    return hasil
  }, [rows, kolomFilter])

  /**
   * Filter efektif: irisan antara pilihan user (`filters`) dan nilai yang sekarang benar-benar
   * ada di data (`opsiFilter`). Ini sengaja dihitung sebagai turunan, bukan disinkron lewat
   * useEffect — kalau `rows` berganti (misalnya setelah refetch) dan satu nilai yang tadinya
   * dipilih user sudah tidak ada lagi, nilai itu otomatis tidak ikut menyaring tanpa kita harus
   * menghapusnya dari `filters`. Pilihan asli user tetap tersimpan apa adanya, jadi kalau nilai
   * itu muncul lagi di refetch berikutnya, filternya otomatis aktif lagi tanpa user pilih ulang.
   * JANGAN "disederhanakan" jadi langsung memakai `filters` — itu membuat filter "hantu" yang
   * tetap menyaring baris walau checkbox-nya sudah tidak tampak di dropdown.
   */
  const efektifFilters = useMemo(() => {
    const hasil: Record<string, string[]> = {}
    for (const c of kolomFilter) {
      const dipilih = filters[c.key] ?? []
      const tersedia = opsiFilter[c.key] ?? []
      hasil[c.key] = dipilih.filter((v) => tersedia.includes(v))
    }
    return hasil
  }, [filters, opsiFilter, kolomFilter])

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    const cariCols = columns.filter((c) => c.searchable !== false)
    const aktif = Object.entries(efektifFilters).filter(([, v]) => v.length > 0)

    return rows.filter((row) => {
      // Filter kolom digabung dengan AND antar kolom, OR antar nilai dalam satu kolom.
      for (const [colKey, dipilih] of aktif) {
        const col = columns.find((c) => c.key === colKey)
        if (!col) continue
        if (!dipilih.includes(String(col.value(row) ?? ''))) return false
      }
      if (!key) return true
      return cariCols.some((c) => String(c.value(row) ?? '').toLowerCase().includes(key))
    })
  }, [rows, columns, q, efektifFilters])

  function toggleFilter(colKey: string, nilai: string) {
    setFilters((prev) => {
      const sekarang = prev[colKey] ?? []
      const berikutnya = sekarang.includes(nilai)
        ? sekarang.filter((v) => v !== nilai)
        : [...sekarang, nilai]
      return { ...prev, [colKey]: berikutnya }
    })
  }

  const adaFilterAktif = Object.values(efektifFilters).some((v) => v.length > 0)

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

      {kolomFilter.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {kolomFilter.map((c) => {
            const dipilih = efektifFilters[c.key] ?? []
            return (
              <details key={c.key} className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary-tint/40">
                  {c.label}
                  {dipilih.length > 0 && ` (${dipilih.length})`}
                </summary>
                <div className="absolute z-20 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-border bg-white p-2 shadow-lg">
                  {opsiFilter[c.key]?.length === 0 && (
                    <div className="px-2 py-1 text-xs text-muted">Tidak ada nilai</div>
                  )}
                  {opsiFilter[c.key]?.map((nilai) => (
                    <label key={nilai} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-primary-tint/40">
                      <input
                        type="checkbox"
                        checked={dipilih.includes(nilai)}
                        onChange={() => toggleFilter(c.key, nilai)}
                      />
                      <span className="truncate">{nilai}</span>
                    </label>
                  ))}
                </div>
              </details>
            )
          })}

          {adaFilterAktif && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-muted underline hover:text-primary-dark"
            >
              Bersihkan filter
            </button>
          )}
        </div>
      )}

      {isLoading && <div className="panel px-4 py-3 text-sm text-muted">Memuat data...</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">{rows.length === 0 ? emptyTitle : 'Tidak ada baris yang cocok'}</div>
          <p className="empty-copy">
            {rows.length === 0 ? emptyCopy : 'Coba kata kunci lain, atau longgarkan filter kolom.'}
          </p>
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
