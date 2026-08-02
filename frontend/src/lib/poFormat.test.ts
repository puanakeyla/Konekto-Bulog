// Dijalankan dengan runtime bawaan Node (tanpa menambah dependency test ke proyek):
//   npm run test:lib      (lihat package.json)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDesimal, trimDesimal } from './poFormat.ts'

// Kolom decimal(10,2) di DB selalu mengembalikan dua desimal. Yang diketik pengguna "2,4"
// tidak boleh muncul lagi sebagai "2,40" -- baik di input maupun di tampilan.
test('trimDesimal membuang nol ekor tanpa menyentuh nilai non-desimal', () => {
  assert.equal(trimDesimal('2.40'), '2.4')
  assert.equal(trimDesimal('2.49'), '2.49')
  assert.equal(trimDesimal('2.00'), '2')
  assert.equal(trimDesimal('20.00'), '20')
  assert.equal(trimDesimal('10000'), '10000')
  assert.equal(trimDesimal(null), '')
  // Bukan angka desimal -> dibiarkan apa adanya (textField dipakai juga untuk teks bebas).
  assert.equal(trimDesimal('B 1234 XY'), 'B 1234 XY')
  assert.equal(trimDesimal('505374 - CV. CANDRA JAYA'), '505374 - CV. CANDRA JAYA')
})

test('formatDesimal memakai koma id-ID dan tidak membulatkan jarak', () => {
  assert.equal(formatDesimal('2.49'), '2,49')
  assert.equal(formatDesimal('2.40'), '2,4')
  assert.equal(formatDesimal('2.00'), '2')
})
