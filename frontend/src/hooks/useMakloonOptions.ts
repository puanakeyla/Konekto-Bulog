import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type MakloonOption = {
  id: number
  nama_maklon: string
  kecamatan: string | null
  kabupaten: string | null
}

export function useMakloonOptions() {
  return useQuery({
    queryKey: ['makloon-options'],
    queryFn: async () => {
      const { data } = await api.get<{ data: MakloonOption[] }>('/api/makloon-options')
      return data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}
