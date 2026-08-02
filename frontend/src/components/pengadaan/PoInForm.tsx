import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import PoProgressInfo from './PoProgressInfo'

export default function PoInForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>(() => Object.fromEntries(po.po_detail.map((detail) => [detail.id, detail.no_in ?? ''])))
  const [confirmIn, setConfirmIn] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['po-list'] })
    queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
    queryClient.invalidateQueries({ queryKey: ['antrean-transaksi'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-ringkasan'] })
    onChanged?.()
  }

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}/in`, {
      items: po.po_detail
        .map((detail) => ({ po_detail_id: detail.id, no_in: (values[detail.id] ?? detail.no_in ?? '').trim() }))
        .filter((item) => item.no_in !== ''),
    }),
    // Sengaja TIDAK pindah halaman: daftar PO di-invalidate sehingga langkah berikutnya
    // (form SPP) langsung menggantikan kartu ini di tempat, tanpa mengeluarkan pengguna dari
    // halaman pengisian yang sedang dikerjakannya.
    onSuccess: () => {
      setConfirmIn(false)
      setValues({})
      afterChange()
      toast.success(`Nomor IN PO ${po.no_po} tersimpan dan dikunci. Lanjut isi No. SPP.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan nomor IN.')),
  })

  const updatePo = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}`, { status: 'dibatalkan' }),
    onSuccess: () => {
      setConfirmBatal(false)
      afterChange()
      toast.success(`PO ${po.no_po} dibatalkan. Transaksinya kembali tersedia untuk digabung.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui PO.')),
  })

  const errorMessage = ((mutation.error || updatePo.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const lengkapCount = po.po_detail.filter((d) => d.no_in || values[d.id]?.trim()).length
  const semuaLengkap = lengkapCount === po.po_detail.length

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmIn(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">Belum dikirim</span>
      </div>
      <PoProgressInfo
        posisi="Pengadaan"
        status="Isi IN"
        berikutnya={semuaLengkap ? 'Menunggu SPP' : 'Lengkapi nomor IN'}
        keterangan="Lengkapi semua nomor IN, lalu simpan untuk mengunci IN dan masuk ke status Menunggu SPP."
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>Progress IN</span>
        <span className="badge">{lengkapCount}/{po.po_detail.length} IN terisi</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="data-table-wrap mb-3">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th className="text-right">Kuantum</th><th>Nomor IN</th></tr></thead>
          <tbody>
            {po.po_detail.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold text-primary-dark">{d.transaksi_id}</td>
                <td className="text-right">{formatNumber(d.kuantum_kontribusi)} kg</td>
                {/* IN terkunci setelah No. SPP tersimpan -- KECUALI bila Keuangan menolak PO-nya:
                    di situlah "Perbaiki nomor IN" dipakai, dan mengunci input membuat tombol itu
                    membuka form yang tidak bisa diapa-apakan. Backend memang mengizinkannya
                    (PoGroupingService::isiNomorIn hanya menolak PO batal/lengkap). */}
                <td><input className="input" placeholder="Masukkan nomor IN" disabled={!!po.no_spp && po.review_status !== 'ditolak'} value={values[d.id] ?? d.no_in ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [d.id]: e.target.value }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button type="button" className="btn btn-outline-danger" onClick={() => setConfirmBatal(true)}>Batalkan PO</button>
        <button type="submit" disabled={!semuaLengkap || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan IN'}</button>
      </div>

      <ConfirmDialog
        open={confirmIn}
        title="Simpan IN?"
        description={<><strong>{lengkapCount} dari {po.po_detail.length} nomor IN</strong> akan tersimpan dan dikunci. Setelah itu status berubah menjadi <strong>Menunggu SPP</strong>.</>}
        confirmLabel="Simpan IN"
        confirmDisabled={!semuaLengkap}
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmIn(false)}
        onConfirm={() => mutation.mutate()}
      />

      <ConfirmDialog
        open={confirmBatal}
        title="Batalkan PO ini?"
        description={<>PO <strong>{po.no_po}</strong> akan <strong>dibatalkan</strong>. Seluruh transaksi di dalamnya dikembalikan ke tahap <strong>Pengadaan</strong> dan bisa digabung ulang ke PO lain. Lanjutkan?</>}
        confirmLabel="Batalkan PO"
        confirmVariant="danger"
        loading={updatePo.isPending}
        onCancel={() => setConfirmBatal(false)}
        onConfirm={() => updatePo.mutate()}
      />
    </form>
  )
}
