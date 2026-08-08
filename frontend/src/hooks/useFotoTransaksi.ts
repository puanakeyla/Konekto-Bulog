import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type FotoTersimpan = { jenis_foto: string; role: string; thumb_url: string }

/**
 * Daftar foto yang benar-benar ada untuk transaksi ini, sudah disaring izin peminta di backend.
 * `thumb_url` ikut di response ini, jadi menampilkan galeri cukup SATU request -- sebelumnya
 * tiap kartu menembak endpoint link sendiri (1 + N). staleTime 4 menit: URL bertanda tangan
 * berlaku 5 menit, jadi daftar di-refresh sebelum link di dalamnya kedaluwarsa.
 */
export function useDokumenTransaksi(transaksiId: string | undefined) {
  return useQuery({
    queryKey: ['dokumen-transaksi', transaksiId],
    queryFn: async () => {
      const { data } = await api.get<{ data: FotoTersimpan[] }>(`/api/transaksi/${encodeURIComponent(transaksiId!)}/foto`)
      return data.data
    },
    enabled: !!transaksiId,
    staleTime: 4 * 60 * 1000,
  })
}

/**
 * URL bertanda tangan untuk satu foto. Backend menerbitkannya berumur 5 menit, jadi cache
 * ditahan 4 menit saja -- lebih lama dari itu URL-nya sudah kedaluwarsa dan gambar gagal muat.
 * `enabled` dipakai pemanggil supaya tidak menembak endpoint untuk slot foto yang memang kosong.
 */
export function useFotoUrl(transaksiId: string | undefined, jenisFoto: string, enabled: boolean, conversion?: 'thumb') {
  return useQuery({
    queryKey: ['foto-url', transaksiId, jenisFoto, conversion ?? 'asli'],
    queryFn: async () => {
      const { data } = await api.get<{ url: string }>(
        `/api/transaksi/${encodeURIComponent(transaksiId!)}/foto/${jenisFoto}`,
        { params: conversion ? { conversion } : undefined },
      )
      return data.url
    },
    enabled: enabled && !!transaksiId,
    staleTime: 4 * 60 * 1000,
    retry: false,
  })
}

export function useFotoPengolahanUrl(pengolahanId: string | undefined, jenisFoto: string, enabled: boolean, conversion?: 'thumb') {
  return useQuery({
    queryKey: ['foto-pengolahan-url', pengolahanId, jenisFoto, conversion ?? 'asli'],
    queryFn: async () => {
      const { data } = await api.get<{ url: string }>(
        `/api/pengolahan/${encodeURIComponent(pengolahanId!)}/foto/${jenisFoto}`,
        { params: conversion ? { conversion } : undefined },
      )
      return data.url
    },
    enabled: enabled && !!pengolahanId,
    staleTime: 4 * 60 * 1000,
    retry: false,
  })
}
