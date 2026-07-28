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
