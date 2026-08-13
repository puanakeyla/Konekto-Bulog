// Dijalankan dengan runtime bawaan Node (tanpa menambah dependency test ke proyek):
//   npm run test:lib      (lihat package.json)
import assert from 'node:assert/strict'
import { test } from 'node:test'
// Diimpor dari '@tanstack/react-query' (dependency yang tercatat di package.json), bukan
// dari '@tanstack/query-core' yang cuma kebetulan ikut terpasang sebagai dependency turunan.
import { QueryClient } from '@tanstack/react-query'

// Mengunci perilaku TanStack Query yang jadi akar bug "logout lama banget".
// useAuth.logout() dulu memanggil setQueryData(['me'], undefined) dan mengira itu
// mengosongkan sesi. Ternyata tidak: library menganggap undefined sebagai "batalkan
// update", jadi user lama tetap duduk di cache dan ProtectedRoute tidak pernah
// memulangkan pengguna ke /login.
test('setQueryData dengan undefined TIDAK menghapus cache (jebakan yang bikin logout menggantung)', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { username: 'pengadaan01' })

  client.setQueryData(['me'], undefined)

  assert.deepEqual(
    client.getQueryData(['me']),
    { username: 'pengadaan01' },
    'kalau assert ini gagal, library berubah perilaku dan komentar di useAuth.tsx perlu ditinjau',
  )
})

test('clear() benar-benar mengosongkan sesi beserta cache halaman lain', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { username: 'pengadaan01' })
  client.setQueryData(['transaksi-list'], [{ id_transaksi: '00001/08/2026/TJP' }])

  client.clear()

  assert.equal(client.getQueryData(['me']), undefined)
  // Data user sebelumnya tidak boleh tertinggal untuk user berikutnya di browser yang sama.
  assert.equal(client.getQueryData(['transaksi-list']), undefined)
})
