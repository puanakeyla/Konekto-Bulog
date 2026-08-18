import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { RENDEMEN_ESTIMASI, estimasiGabah } from './estimasiGabah.ts'

test('estimasi gabah = kuantum HGL dibagi rendemen acuan', () => {
  assert.equal(estimasiGabah(2550), 5000)
  assert.equal(estimasiGabah('2550.00'), 5000)
})

test('isian kosong tidak menghasilkan NaN yang bocor ke layar', () => {
  assert.equal(estimasiGabah(null), 0)
  assert.equal(estimasiGabah(''), 0)
  assert.equal(estimasiGabah(undefined), 0)
  assert.equal(estimasiGabah('abc'), 0)
})

/**
 * Dibulatkan ke kilogram utuh DI SINI, supaya penjumlahannya konsisten di seluruh layar:
 * total neraca admin harus sama persis dengan kolom Rekap Pengolahan yang dijumlah tangan.
 */
test('hasilnya kilogram utuh, jadi baris-barisnya boleh dijumlah', () => {
  assert.equal(estimasiGabah(1000), 1961)
  assert.equal(estimasiGabah(2000), 3922)
  assert.equal(estimasiGabah(1000) + estimasiGabah(2000), 5883)
})

/**
 * Penjaga satu-satunya terhadap masalah yang tidak menimbulkan error apa pun: rendemen acuan
 * direvisi di sisi PHP saja, lalu neraca admin dan form Gudang diam-diam memakai angka berbeda.
 * Angkanya memang harus ada di dua bahasa (lihat estimasiGabah.ts), tapi tidak boleh berbeda.
 */
test('rendemen acuan sama persis dengan PengolahanGudang::RENDEMEN_ESTIMASI', () => {
  const model = readFileSync(
    new URL('../../../backend/app/Models/PengolahanGudang.php', import.meta.url),
    'utf8',
  )
  const cocok = model.match(/const RENDEMEN_ESTIMASI\s*=\s*([\d.]+)\s*;/)

  assert.ok(cocok, 'PengolahanGudang::RENDEMEN_ESTIMASI tidak ditemukan -- konstantanya dihapus atau dipindah?')
  assert.equal(Number(cocok[1]), RENDEMEN_ESTIMASI)
})
