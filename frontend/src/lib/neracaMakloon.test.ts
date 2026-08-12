import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { hitungTotalNeraca } from './neracaMakloon.ts'
import type { BarisRekapMakloon } from '../hooks/useRekapMakloon.ts'

function baris(isi: Partial<BarisRekapMakloon>): BarisRekapMakloon {
  return {
    makloon_user_id: 1,
    nama_maklon: 'Makloon',
    kecamatan: null,
    kabupaten: null,
    gabah_diterima: 0,
    gabah_sudah_in: 0,
    gabah_belum_in: 0,
    gabah_spp: 0,
    gabah_belum_spp: 0,
    olah_rekap: 0,
    belum_adm_belum_olah: 0,
    olah_selesai: 0,
    stok_real: 0,
    hgl: 0,
    broken: 0,
    menir: 0,
    katul: 0,
    reject: 0,
    rendemen: 0,
    hgl_operasi: 0,
    hgl_belum_adm: 0,
    persentase_olah: 0,
    ...isi,
  }
}

test('kolom kilogram dijumlah apa adanya', () => {
  const total = hitungTotalNeraca([
    baris({ gabah_diterima: 151815, gabah_sudah_in: 141335, katul: 10.5 }),
    baris({ gabah_diterima: 128250, gabah_sudah_in: 108450, katul: 316.92 }),
  ])

  assert.equal(total.gabah_diterima, 280065)
  assert.equal(total.gabah_sudah_in, 249785)
  assert.equal(total.katul, 327.42)
})

test('kolom minus tetap ikut mengurangi total, bukan diabaikan', () => {
  const total = hitungTotalNeraca([
    baris({ hgl_belum_adm: 42950 }),
    baris({ hgl_belum_adm: -123200 }),
  ])

  assert.equal(total.hgl_belum_adm, -80250)
})

/**
 * Inti aturannya: persen TIDAK boleh dirata-rata. Mitra pertama 0% dengan volume besar dan mitra
 * kedua 15,89% dengan volume kecil -- rata-rata dua angka itu 7,94% padahal kenyataannya 6,9%.
 */
test('persen dihitung ulang dari total, bukan dirata-rata antar makloon', () => {
  const total = hitungTotalNeraca([
    baris({ gabah_sudah_in: 141335, olah_selesai: 0, hgl: 0, persentase_olah: 0, rendemen: 0 }),
    baris({ gabah_sudah_in: 108450, olah_selesai: 17231, hgl: 10442, persentase_olah: 15.89, rendemen: 60.6 }),
  ])

  assert.equal(total.persentase_olah, 6.9)
  assert.equal(total.rendemen, 60.6)
})

test('persen dibulatkan 2 desimal supaya file ekspor tidak membocorkan pecahan panjang', () => {
  const total = hitungTotalNeraca([baris({ gabah_sudah_in: 3, olah_selesai: 1, hgl: 1 })])

  assert.equal(total.persentase_olah, 33.33)
  assert.equal(String(total.rendemen), '100')
})

test('penyebut nol menghasilkan 0%, bukan NaN atau Infinity', () => {
  const total = hitungTotalNeraca([baris({ hgl: 5000, olah_selesai: 0, gabah_sudah_in: 0 })])

  assert.equal(total.rendemen, 0)
  assert.equal(total.persentase_olah, 0)
})

test('tanpa baris sama sekali semua total nol', () => {
  const total = hitungTotalNeraca([])

  assert.equal(total.gabah_diterima, 0)
  assert.equal(total.rendemen, 0)
})
