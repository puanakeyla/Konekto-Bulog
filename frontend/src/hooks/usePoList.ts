import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type PoDetailItem = {
  id: number
  data_pengadaan_id: number
  transaksi_id: string
  kuantum_kontribusi: string
  no_in: string | null
}

export type DataKeuangan = {
  id: number
  data_pengadaan_id: number
  status_bayar: 'belum' | 'dibayarkan'
  tanggal_bayar: string | null
}

export type DataOperasi = {
  id: number
  data_pengadaan_id: number
  no_mo: string
  no_tm: string
  hgl_persen: string | null
  broken_persen: string | null
  menir_persen: string | null
  katul_persen: string | null
  rendemen_persen: string | null
  data_gudang: DataGudang | null
}

export type DataGudang = {
  id: number
  data_operasi_id: number
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string | null
  no_tm: string
}

export type PoItem = {
  id: number
  tanggal_bongkar: string
  id_pemasok: string
  makloon_user_id: number
  total_kuantum: string
  harga: string
  total_harga: string
  no_po: string
  no_spp: string | null
  status: 'proses' | 'lengkap' | 'dibatalkan'
  po_detail: PoDetailItem[]
  data_keuangan: DataKeuangan | null
  data_operasi: DataOperasi | null
}

export function usePoList() {
  return useQuery({
    queryKey: ['po-list'],
    queryFn: async () => {
      const { data } = await api.get<{ data: PoItem[] }>('/api/po')
      return data.data
    },
  })
}
