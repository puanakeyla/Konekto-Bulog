import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type PoFoto = {
  jenis_foto: string
  thumb_url: string
  view_url?: string
  download_url?: string
}

export function usePoFoto(poId: number | undefined) {
  return useQuery({
    queryKey: ['po-foto', poId],
    queryFn: async () => {
      const { data } = await api.get<{ data: PoFoto[] }>(`/api/po/${poId}/foto`)
      return data.data
    },
    enabled: !!poId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}
