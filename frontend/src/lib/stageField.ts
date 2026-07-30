import { formatMoney, formatNumber } from './poFormat'

/** Kolom teknis yang tidak perlu dilihat pengguna saat menampilkan data satu tahap. */
export const HIDDEN_FIELDS = new Set(['id', 'transaksi_id', 'locked_by', 'submitted_by', 'created_at', 'updated_at'])

export const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  catatan_penolakan: 'Catatan penolakan',
  locked_at: 'Diterima pada',
  submitted_at: 'Dikirim pada',
  id_pemasok: 'ID pemasok',
  supir: 'Supir',
  plat_mobil: 'Plat mobil',
  nama_poktan_gapoktan: 'Poktan/Gapoktan',
  desa: 'Desa',
  kecamatan: 'Kecamatan',
  kabupaten: 'Kabupaten',
  makloon_user_id: 'Makloon tujuan',
  tanggal_kirim: 'Tanggal kirim',
  tanggal_bongkar: 'Tanggal bongkar',
  kuantum: 'Kuantum',
  kuantum_bongkar: 'Kuantum bongkar',
  jarak_ke_makloon_km: 'Jarak ke makloon',
  ka1: 'KA1',
  ka2: 'KA2',
  ka3: 'KA3',
  hampa: 'Hampa',
  butir_hijau: 'Butir hijau',
  no_po: 'No. PO',
  no_spp: 'No. SPP',
  status_po: 'Status PO',
  total_kuantum: 'Total kuantum',
  harga: 'Harga',
  total_harga: 'Total harga',
  status_bayar: 'Status bayar',
  tanggal_bayar: 'Tanggal bayar',
}

// Field bernilai uang -> Rupiah; field kuantum (kg) -> pemisah ribuan tanpa desimal paksa.
const MONEY_FIELDS = new Set(['harga', 'total_harga'])
const KUANTUM_FIELDS = new Set(['kuantum', 'kuantum_bongkar', 'total_kuantum'])

export function labelOf(key: string) {
  return FIELD_LABELS[key] ?? key.replaceAll('_', ' ')
}

export function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (MONEY_FIELDS.has(key)) return formatMoney(value as string | number)
  if (KUANTUM_FIELDS.has(key)) return `${formatNumber(value as string | number)} kg`
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value).toLocaleDateString('id-ID')
  return String(value)
}
