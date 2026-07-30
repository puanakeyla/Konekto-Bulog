// Dijalankan dengan runtime bawaan Node (tanpa menambah dependency test ke proyek):
//   npm run test:lib      (lihat package.json)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TransaksiListItem } from '../hooks/useTransaksiList'
// Ekstensi .ts eksplisit karena Node ESM tidak menebak ekstensi saat runtime; tsconfig sudah
// allowImportingTsExtensions jadi tsc tetap menerima. Import type di atas tidak perlu -- ia
// terhapus sebelum Node melihatnya.
import { KERJAAN_LABEL, kerjaan } from './kerjaanTransaksi.ts'

function baris(patch: Partial<TransaksiListItem>): TransaksiListItem {
  return {
    id_transaksi: '00001/07/2026/TJP',
    skema: 'TJP',
    current_stage: 'jemput_pangan',
    status_keseluruhan: 'berjalan',
    created_at: '2026-07-01T00:00:00Z',
    nama_maklon: null,
    makloon_kecamatan: null,
    makloon_kabupaten: null,
    ...patch,
  }
}

test('transaksi yang baru masuk ke tahap kita: belum ada datanya sendiri -> perlu diisi', () => {
  assert.equal(kerjaan(baris({ current_stage: 'jemput_pangan' })).id, 'isi')
  assert.equal(kerjaan(baris({ current_stage: 'jemput_pangan' })).label, 'Perlu diisi')
})

test('draft punya kategori sendiri, tidak disembunyikan di balik "Perlu diisi"', () => {
  const row = baris({ current_stage: 'jemput_pangan', data_jemput_pangan: { id_pemasok: 'P1', makloon_user_id: 1, status: 'draft' } })
  assert.equal(kerjaan(row).id, 'draft')
  assert.notEqual(kerjaan(row).id, kerjaan(baris({ current_stage: 'jemput_pangan' })).id)
})

test('label badge selalu sama dengan label chip (satu badge = satu chip)', () => {
  for (const row of [
    baris({ current_stage: 'jemput_pangan' }),
    baris({ current_stage: 'jemput_pangan', data_jemput_pangan: { id_pemasok: 'P1', makloon_user_id: 1, status: 'draft' } }),
    baris({ current_stage: 'keuangan' }),
    baris({ skema: 'MPP', current_stage: 'makloon_terima' }),
  ]) {
    const item = kerjaan(row)
    assert.equal(item.label, KERJAAN_LABEL[item.id])
  }
})

test('data tahap sebelumnya menunggu_review -> perlu diperiksa', () => {
  const row = baris({ current_stage: 'makloon', data_jemput_pangan: { id_pemasok: 'P1', makloon_user_id: 1, status: 'menunggu_review' } })
  assert.equal(kerjaan(row).id, 'periksa')
})

test('setelah diterima, transaksi bertahan di tahap yang sama sebagai perlu diisi', () => {
  const row = baris({ current_stage: 'makloon', data_jemput_pangan: { id_pemasok: 'P1', makloon_user_id: 1, status: 'diterima' } })
  assert.equal(kerjaan(row).id, 'isi')
})

test('makloon_terima masuk kategori periksa, dan menyebut Makloon Kirim sebagai asal datanya', () => {
  const row = baris({ skema: 'MPP', current_stage: 'makloon_terima', data_makloon_mpp: { id_pemasok: 'P1', tanggal_bongkar: '2026-07-02', kuantum: '1000', status: 'menunggu_review' } })
  assert.equal(kerjaan(row).id, 'periksa')
  assert.match(kerjaan(row).judul, /Makloon Kirim/)
})

test('penolakan mengalahkan segalanya, termasuk data yang menunggu review', () => {
  const row = baris({ current_stage: 'makloon', data_jemput_pangan: { id_pemasok: 'P1', makloon_user_id: 1, status: 'ditolak', catatan_penolakan: 'foto buram' } })
  assert.equal(kerjaan(row).id, 'ditolak')
})

test('pengadaan & keuangan bekerja di level PO -> kategori po', () => {
  assert.equal(kerjaan(baris({ current_stage: 'keuangan' })).id, 'po')
  // Pengadaan yang datanya belum ditinjau tetap "perlu diperiksa" dulu.
  assert.equal(kerjaan(baris({ current_stage: 'pengadaan', data_ub_jastasma: { status: 'menunggu_review' } })).id, 'periksa')
  assert.equal(kerjaan(baris({ current_stage: 'pengadaan', data_ub_jastasma: { status: 'diterima' } })).id, 'po')
})

test('MPP di ub_jastasma: data MPP sudah diterima di makloon_terima, jadi bukan periksa', () => {
  const row = baris({ skema: 'MPP', current_stage: 'ub_jastasma', data_makloon_mpp: { id_pemasok: 'P1', tanggal_bongkar: '2026-07-02', kuantum: '1000', status: 'diterima' } })
  assert.equal(kerjaan(row).id, 'isi')
})
