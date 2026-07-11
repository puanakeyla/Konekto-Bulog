import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

type StageData = Record<string, unknown> & { status: string }

type TransaksiDetail = {
  id_transaksi: string
  skema: 'TJP' | 'MPP'
  current_stage: string
  status_keseluruhan: string
  created_at: string
  data_jemput_pangan: StageData | null
  data_makloon_mpp: StageData | null
  data_makloon_tjp: StageData | null
  data_ub_jastasma: StageData | null
}

const HIDDEN_FIELDS = new Set([
  'id',
  'transaksi_id',
  'locked_by',
  'submitted_by',
  'created_at',
  'updated_at',
])

const STAGE_LABELS: Record<string, string> = {
  data_jemput_pangan: 'Jemput Pangan',
  data_makloon_mpp: 'Makloon',
  data_makloon_tjp: 'Makloon',
  data_ub_jastasma: 'UB Jastasma',
}

export default function TransaksiDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [catatan, setCatatan] = useState('')
  const [showTolak, setShowTolak] = useState(false)

  const { data: transaksi, isLoading } = useQuery({
    queryKey: ['transaksi', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: TransaksiDetail }>(
        `/api/transaksi/${encodeURIComponent(id!)}`,
      )
      return data.data
    },
  })

  const terima = useMutation({
    mutationFn: () => api.post(`/api/transaksi/${encodeURIComponent(id!)}/terima`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['transaksi', id] })
    },
  })

  const tolak = useMutation({
    mutationFn: () =>
      api.post(`/api/transaksi/${encodeURIComponent(id!)}/tolak`, { catatan }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      navigate('/')
    },
  })

  if (isLoading || !transaksi) {
    return <div className="min-h-screen bg-surface p-8">Memuat...</div>
  }

  const stageKeys = [
    'data_jemput_pangan',
    'data_makloon_mpp',
    'data_makloon_tjp',
    'data_ub_jastasma',
  ] as const

  type StageSection = { key: string; label: string; data: StageData }

  const stageSections = stageKeys
    .map((key): StageSection | null => {
      const data = transaksi[key]
      return data ? { key, label: STAGE_LABELS[key], data } : null
    })
    .filter((section): section is StageSection => section !== null)

  const pendingSection = stageSections.find((s) => s.data.status === 'menunggu_review') ?? null

  const canAct = user?.role.nama_role === transaksi.current_stage || user?.role.nama_role === 'admin'
  const hasPendingReview = pendingSection !== null
  const canIsiUbJastasma =
    canAct && !hasPendingReview && transaksi.current_stage === 'ub_jastasma'
  const canIsiMakloon =
    canAct &&
    !hasPendingReview &&
    transaksi.current_stage === 'makloon' &&
    transaksi.skema === 'TJP'

  return (
    <div className="min-h-screen bg-surface p-8 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-medium text-primary mb-6">
          Transaksi {transaksi.id_transaksi}
        </h1>

        <div className="bg-white rounded-lg shadow p-8 space-y-4">
          <div className="text-sm text-gray-500">
            Skema {transaksi.skema} &middot; Tahap saat ini{' '}
            <span className="font-medium text-primary-dark">{transaksi.current_stage}</span>
            {transaksi.status_keseluruhan === 'selesai' && (
              <span className="ml-2 inline-block bg-success-bg text-success text-xs rounded px-2 py-0.5">
                Selesai
              </span>
            )}
          </div>

          {stageSections.map((section) => (
            <div key={section.key} className="border-t border-border pt-4 space-y-2">
              <div className="text-xs font-medium text-primary uppercase tracking-wide">
                {section.label}
              </div>
              {Object.entries(section.data)
                .filter(([key]) => !HIDDEN_FIELDS.has(key))
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-500">{key}</span>
                    <span className="text-primary-dark">{String(value ?? '-')}</span>
                  </div>
                ))}
            </div>
          ))}

          {canIsiMakloon && (
            <div className="border-t border-border pt-4">
              <Link
                to={`/transaksi/${encodeURIComponent(transaksi.id_transaksi)}/makloon`}
                className="inline-block bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark"
              >
                Isi Data Makloon
              </Link>
            </div>
          )}

          {canIsiUbJastasma && (
            <div className="border-t border-border pt-4">
              <Link
                to={`/transaksi/${encodeURIComponent(transaksi.id_transaksi)}/ub-jastasma`}
                className="inline-block bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark"
              >
                Isi Data UB Jastasma
              </Link>
            </div>
          )}

          {canAct && hasPendingReview && (
            <div className="border-t border-border pt-4 space-y-3">
              {!showTolak ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (confirm('Terima data tahap sebelumnya? Aksi ini tidak bisa dibatalkan.')) {
                        terima.mutate()
                      }
                    }}
                    disabled={terima.isPending}
                    className="bg-primary text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                  >
                    Terima & Kirim
                  </button>
                  <button
                    onClick={() => setShowTolak(true)}
                    className="border border-danger text-danger rounded px-4 py-2 text-sm"
                  >
                    Tolak
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    className="input"
                    placeholder="Catatan penolakan"
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => tolak.mutate()}
                      disabled={!catatan || tolak.isPending}
                      className="bg-danger text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                    >
                      Kirim Penolakan
                    </button>
                    <button
                      onClick={() => setShowTolak(false)}
                      className="text-sm text-gray-500"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
