// Format angka/uang/tanggal dipakai bersama komponen PO (Pengadaan/Keuangan) di halaman
// maupun inline timeline, supaya konsisten dan tidak digandakan per file.
export function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export function formatMoney(value: string | number) {
  return Number(value).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('id-ID')
}
