import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type PoFotoTersimpan = {
  jenis_foto: string
  thumb_url: string
}

export function usePoFoto(poId: number | undefined) {
  return useQuery({
    queryKey: ['po-foto', poId],
    queryFn: async () => {
      const { data } = await api.get<{ data: PoFotoTersimpan[] }>(`/api/po/${poId}/foto`)
      return data.data
    },
    enabled: !!poId,
    staleTime: 4 * 60 * 1000,
  })
}
