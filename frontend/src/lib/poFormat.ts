// Format angka/uang/tanggal dipakai bersama komponen PO (Pengadaan/Keuangan) di halaman
// maupun inline timeline, supaya konsisten dan tidak digandakan per file.
// Semua pemakai formatNumber adalah kuantum kg, dan kuantum selalu bilangan bulat --
// kolom DB decimal(x,2) bikin nilainya terbawa sebagai "1234.00"/"1234.99", jadi
// pembulatan dilakukan di sini, satu tempat, bukan di tiap pemanggil.
export function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 0 })
}

export function formatMoney(value: string | number) {
  return Number(value).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('id-ID')
}

// Kolom decimal(x,2) di DB selalu kembali dengan dua desimal ("2.40"), padahal yang diketik
// pengguna cuma "2,4". Dua helper di bawah membuang nol ekor itu -- yang pertama untuk NILAI
// input (tetap pakai titik supaya <input type="number"> menerimanya), yang kedua untuk TAMPILAN.
export function trimDesimal(value: string | number | null | undefined) {
  const teks = value === null || value === undefined ? '' : String(value)
  return /^-?\d+\.\d+$/.test(teks) ? teks.replace(/0+$/, '').replace(/\.$/, '') : teks
}

export function formatDesimal(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}
