import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'

// Aksi review PO oleh tahap peninjau (mis. Keuangan meninjau data Pengadaan). Meniru pola
// ReviewActions per-transaksi, tetapi memakai endpoint level PO: POST /api/po/{id}/terima|tolak.
// Terima -> data PO terkunci & alur lanjut. Tolak -> seluruh transaksi anggota kembali ke tahap
// sebelumnya untuk revisi (catatan wajib). Berlaku untuk SEMUA transaksi dalam PO.
export default function PoReviewActions({
  po,
  reviewLabel,
  onChanged,
}: {
  po: PoItem
  reviewLabel: string
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<null | 'terima' | 'tolak'>(null)
  const [catatan, setCatatan] = useState('')

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['po-list'] })
    queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
    onChanged?.()
  }

  const terima = useMutation({
    mutationFn: () => api.post(`/api/po/${po.id}/terima`),
    onSuccess: () => {
      setDialog(null)
      afterChange()
      toast.success(`Data ${reviewLabel} PO ${po.no_po} diterima & dikunci.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menerima data PO.')),
  })

  const tolak = useMutation({
    mutationFn: () => api.post(`/api/po/${po.id}/tolak`, { catatan }),
    onSuccess: () => {
      setDialog(null)
      setCatatan('')
      afterChange()
      toast.success(`PO ${po.no_po} dikembalikan untuk direvisi.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menolak data PO.')),
  })

  const actionError = ((terima.error || tolak.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <div className="mt-4 flex flex-wrap justify-end gap-3 border-t border-border pt-4">
      <button type="button" onClick={() => setDialog('tolak')} className="btn btn-outline-danger">Tolak</button>
      <button type="button" onClick={() => setDialog('terima')} className="btn btn-primary">Terima &amp; Lanjutkan</button>

      <ConfirmDialog
        open={dialog === 'terima'}
        title="Terima data PO ini?"
        description={<>Data <strong>{reviewLabel}</strong> pada PO <strong>{po.no_po}</strong> ({po.po_detail.length} transaksi) akan dikunci dan tidak bisa diubah lagi. Lanjutkan?</>}
        confirmLabel="Terima & Lanjutkan"
        confirmVariant="primary"
        loading={terima.isPending}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={() => terima.mutate()}
      />

      <ConfirmDialog
        open={dialog === 'tolak'}
        title="Tolak data PO ini?"
        description={<>Seluruh <strong>{po.po_detail.length} transaksi</strong> pada PO <strong>{po.no_po}</strong> akan dikembalikan ke tahap sebelumnya untuk direvisi. Lanjutkan?</>}
        confirmLabel="Kirim Penolakan"
        confirmVariant="danger"
        loading={tolak.isPending}
        confirmDisabled={!catatan.trim()}
        error={actionError}
        onCancel={() => { setDialog(null); setCatatan('') }}
        onConfirm={() => tolak.mutate()}
      >
        <textarea className="input mt-3 min-h-24" placeholder="Catatan penolakan (wajib diisi)" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </ConfirmDialog>
    </div>
  )
}
