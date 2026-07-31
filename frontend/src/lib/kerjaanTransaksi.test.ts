// Dijalankan dengan runtime bawaan Node (tanpa menambah dependency test ke proyek):
//   npm run test:lib      (lihat package.json)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TransaksiListItem } from '../hooks/useTransaksiList'
// Ekstensi .ts eksplisit karena Node ESM tidak menebak ekstensi saat runtime; tsconfig sudah
// allowImportingTsExtensions jadi tsc tetap menerima. Import type di atas tidak perlu -- ia
// terhapus sebelum Node melihatnya.
import { KERJAAN_KETERANGAN, KERJAAN_LABEL, KERJAAN_URUT, kerjaan } from './kerjaanTransaksi.ts'

function baris(patch: Partial<TransaksiListItem>): TransaksiListItem {
  return {
    id_transaksi: '00001/07/2026/TJP',
    skema: 'TJP',
    current_stage: 'jemput_pangan',
    status_keseluruhan: 'berjalan',
    kerjaan: 'isi',
    created_at: '2026-07-01T00:00:00Z',
    nama_maklon: null,
    makloon_kecamatan: null,
    makloon_kabupaten: null,
    ...patch,
  }
}

test('label diambil dari kategori yang dikirim server, bukan dihitung ulang', () => {
  assert.equal(kerjaan(baris({ kerjaan: 'isi' })).label, 'Perlu diisi')
  assert.equal(kerjaan(baris({ kerjaan: 'periksa' })).label, 'Perlu dicek')
  assert.equal(kerjaan(baris({ kerjaan: 'draft' })).label, 'Draft belum dikirim')
  assert.equal(kerjaan(baris({ kerjaan: 'ditolak' })).label, 'Perlu diperbaiki')
})

test('setiap kategori punya label, keterangan, dan urutan chip', () => {
  for (const id of KERJAAN_URUT) {
    assert.ok(KERJAAN_LABEL[id], `label kosong untuk ${id}`)
    assert.ok(KERJAAN_KETERANGAN[id], `keterangan kosong untuk ${id}`)
  }
  assert.equal(KERJAAN_URUT.length, 4)
})

test('kategori po sudah dihapus', () => {
  assert.equal((KERJAAN_LABEL as Record<string, string>).po, undefined)
  assert.ok(!(KERJAAN_URUT as string[]).includes('po'))
})

test('baris ditolak menyebut tahap penolaknya di tooltip bila datanya ada', () => {
  const row = baris({
    kerjaan: 'ditolak',
    current_stage: 'jemput_pangan',
    data_jemput_pangan: { status: 'ditolak', catatan_penolakan: 'Foto buram' },
  } as Partial<TransaksiListItem>)

  assert.match(kerjaan(row).judul, /Jemput Pangan/)
})

test('baris ditolak tanpa detail tahap tetap punya tooltip yang masuk akal', () => {
  assert.equal(kerjaan(baris({ kerjaan: 'ditolak' })).judul, KERJAAN_KETERANGAN.ditolak)
})
