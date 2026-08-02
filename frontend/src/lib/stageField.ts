import { formatDesimal, formatMoney, formatNumber } from './poFormat'

/**
 * Kolom yang tidak perlu dilihat pengguna saat menampilkan data satu tahap.
 *
 * Status/locked_at/submitted_at/catatan_penolakan sengaja ikut disembunyikan: ketiganya adalah
 * metadata alur, BUKAN isi form, dan sudah diceritakan header kartu tahap ("Diterima oleh X - tgl",
 * badge Ditolak, panel Riwayat penolakan). Mencampurnya dengan field inputan membuat pembaca
 * ragu mana yang benar-benar diisi petugas. makloon_user_id juga: yang ditampilkan namanya
 * (nama_makloon_tujuan), bukan angka id-nya.
 */
export const HIDDEN_FIELDS = new Set([
  'id', 'transaksi_id', 'locked_by', 'submitted_by', 'created_at', 'updated_at',
  'status', 'locked_at', 'submitted_at', 'catatan_penolakan', 'makloon_user_id',
])

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
  nama_makloon_tujuan: 'Makloon tujuan',
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

// Field bernilai uang -> Rupiah; kuantum selalu bilangan bulat kg.
const MONEY_FIELDS = new Set(['harga', 'total_harga'])
const KUANTUM_FIELDS = new Set(['kuantum', 'kuantum_bongkar', 'total_kuantum'])
// Nilai pecahan: ditampilkan persis sebanyak desimal yang diisi (2,4 tetap "2,4", bukan "2,40"
// dan bukan dibulatkan jadi "2"). Jarak dulu di-Math.round() -- 2,49 km jadi 2 km, jelas salah.
const JARAK_FIELDS = new Set(['jarak_ke_makloon_km'])
const DESIMAL_FIELDS = new Set(['ka1', 'ka2', 'ka3', 'hampa', 'butir_hijau'])

export function labelOf(key: string) {
  return FIELD_LABELS[key] ?? key.replaceAll('_', ' ')
}

export function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (MONEY_FIELDS.has(key)) return formatMoney(value as string | number)
  if (KUANTUM_FIELDS.has(key)) return `${formatNumber(value as string | number)} kg`
  if (JARAK_FIELDS.has(key)) return `${formatDesimal(value as string | number)} km`
  if (DESIMAL_FIELDS.has(key)) return formatDesimal(value as string | number)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value).toLocaleDateString('id-ID')
  return String(value)
}
