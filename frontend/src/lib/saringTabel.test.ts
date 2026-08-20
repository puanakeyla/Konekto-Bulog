// Dijalankan dengan runtime bawaan Node (tanpa menambah dependency test ke proyek):
//   npm run test:lib      (lihat package.json)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { saringTabel, type KolomSaring } from './saringTabel.ts'

type Baris = { id: string; skema: string; makloon: string | null; catatan: string }

const BARIS: Baris[] = [
  { id: '00001/08/2026/TJP', skema: 'TJP', makloon: 'CV Candra', catatan: 'rahasia' },
  { id: '00002/08/2026/MPP', skema: 'MPP', makloon: 'CV Candra', catatan: 'biasa' },
  { id: '00003/08/2026/MPP', skema: 'MPP', makloon: null, catatan: 'biasa' },
]

const KOLOM: KolomSaring<Baris>[] = [
  { key: 'id', label: 'ID', value: (r) => r.id },
  { key: 'skema', label: 'Skema', value: (r) => r.skema },
  { key: 'makloon', label: 'Makloon', value: (r) => r.makloon },
  // Kolom yang sengaja tidak ikut dicari -- meniru kolom yang disembunyikan dari pencarian.
  { key: 'catatan', label: 'Catatan', value: (r) => r.catatan, searchable: false },
]

const ids = (rows: Baris[]) => rows.map((r) => r.id)

test('tanpa pencarian & filter mengembalikan baris apa adanya', () => {
  assert.equal(saringTabel(BARIS, KOLOM, '', {}), BARIS)
  // Filter berisi array kosong tidak dihitung aktif.
  assert.equal(saringTabel(BARIS, KOLOM, '   ', { skema: [] }), BARIS)
})

test('pencarian bebas hanya menyentuh kolom searchable', () => {
  assert.deepEqual(ids(saringTabel(BARIS, KOLOM, 'candra', {})), ['00001/08/2026/TJP', '00002/08/2026/MPP'])
  // "rahasia" ada di kolom catatan yang searchable:false -> tidak boleh ketemu.
  assert.deepEqual(saringTabel(BARIS, KOLOM, 'rahasia', {}), [])
})

test('pencarian tidak peduli besar-kecil huruf dan aman terhadap nilai null', () => {
  assert.deepEqual(ids(saringTabel(BARIS, KOLOM, 'CANDRA', {})), ['00001/08/2026/TJP', '00002/08/2026/MPP'])
  // Baris ber-makloon null tidak boleh melempar, dan tidak cocok dengan teks apa pun.
  assert.deepEqual(ids(saringTabel(BARIS, KOLOM, '00003', {})), ['00003/08/2026/MPP'])
})

test('filter satu kolom: OR antar nilai yang dipilih', () => {
  assert.deepEqual(ids(saringTabel(BARIS, KOLOM, '', { skema: ['TJP'] })), ['00001/08/2026/TJP'])
  assert.equal(saringTabel(BARIS, KOLOM, '', { skema: ['TJP', 'MPP'] }).length, 3)
})

test('filter antar kolom digabung AND, lalu di-AND lagi dengan pencarian', () => {
  // MPP + makloon CV Candra -> hanya 00002.
  assert.deepEqual(ids(saringTabel(BARIS, KOLOM, '', { skema: ['MPP'], makloon: ['CV Candra'] })), ['00002/08/2026/MPP'])
  // Filter MPP menyisakan 00002 & 00003; pencarian "candra" memangkasnya jadi 00002 saja.
  assert.deepEqual(ids(saringTabel(BARIS, KOLOM, 'candra', { skema: ['MPP'] })), ['00002/08/2026/MPP'])
})

test('nilai null disamakan dengan string kosong saat difilter', () => {
  assert.deepEqual(ids(saringTabel(BARIS, KOLOM, '', { makloon: [''] })), ['00003/08/2026/MPP'])
})

test('filter atas kolom yang tidak ada diabaikan, bukan mengosongkan tabel', () => {
  // Kolom berubah mengikuti role/skema sementara pilihan user tetap tersimpan -- kalau ini
  // mengembalikan [], tabel tampak kosong tanpa sebab yang terlihat.
  assert.equal(saringTabel(BARIS, KOLOM, '', { kolom_hilang: ['apa pun'] }).length, 3)
})
