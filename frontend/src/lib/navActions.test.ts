// Dijalankan dengan runtime bawaan Node:
//   npm run test:lib
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildActions } from './navActions.ts'

// Dua menu rekap harus selalu berdampingan di ujung kanan, apa pun rolenya -- itu satu-satunya
// alasan fungsi ini memisahkan `rekap` dari `actions`.
test('menu rekap selalu dua terakhir dan berdampingan', () => {
  for (const role of ['admin', 'ub_jastasma', 'pengadaan']) {
    const labels = buildActions(role).map((item) => item.label)
    assert.deepEqual(labels.slice(-2), ['Rekap Sergab', 'Rekap Pengolahan'], `role ${role}`)
  }
})

// Gudang & Operasi tidak punya tahap di alur SerGab, jadi Rekap Sergab-nya pasti kosong.
test('gudang & operasi hanya dapat Rekap Pengolahan', () => {
  for (const role of ['gudang', 'operasi']) {
    const labels = buildActions(role).map((item) => item.label)
    assert.equal(labels.at(-1), 'Rekap Pengolahan', `role ${role}`)
    assert.ok(!labels.includes('Rekap Sergab'), `role ${role} tidak perlu rekap sergab`)
  }
})

test('role di luar rantai pengolahan hanya dapat Rekap Sergab, tetap paling kanan', () => {
  for (const role of ['jemput_pangan', 'makloon', 'keuangan']) {
    const labels = buildActions(role).map((item) => item.label)
    assert.equal(labels.at(-1), 'Rekap Sergab', `role ${role}`)
    assert.ok(!labels.includes('Rekap Pengolahan'), `role ${role} tidak boleh melihat rekap pengolahan`)
  }
})

test('tidak ada menu ganda walau sebuah role lolos dua cabang', () => {
  // ub_jastasma & pengadaan masuk daftar rekap sergab DAN daftar role pengolahan.
  for (const role of ['ub_jastasma', 'pengadaan']) {
    const tujuan = buildActions(role).map((item) => item.to)
    assert.equal(new Set(tujuan).size, tujuan.length, `role ${role}`)
  }
})
