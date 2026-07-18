// Ekspor data tabel ke CSV yang ramah Excel/Google Sheets.
// Pakai BOM UTF-8 supaya karakter Indonesia tidak rusak saat dibuka di Excel,
// dan pemisah titik koma (;) mengikuti locale ID yang memakai koma sebagai desimal.

export type ExportColumn<T> = {
  key: string
  label: string
  /** Nilai mentah untuk file ekspor (tanpa format tampilan). */
  value: (row: T) => string | number | null | undefined
}

function escapeCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Bungkus dengan kutip bila mengandung pemisah, kutip, atau baris baru.
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]) {
  const header = columns.map((c) => escapeCell(c.label)).join(';')
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(';'))
  return [header, ...body].join('\r\n')
}

/** Unduh data sebagai file .csv. Nama file otomatis diberi stempel tanggal. */
export function downloadCsv<T>(namaFile: string, rows: T[], columns: ExportColumn<T>[]) {
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${namaFile}-${stamp}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
