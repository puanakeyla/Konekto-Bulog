import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import type { TransaksiListItem } from '../../hooks/useTransaksiList'
import ConfirmDialog from '../ConfirmDialog'

// Kandidat & PO memakai sumber kuantum/pemasok/tanggal yang sama (MPP dari makloon MPP,
// TJP dari jemput pangan + bongkar TJP). Dipakai untuk memfilter kandidat sekelompok PO.
function candKuantum(t: TransaksiListItem): number {
  return Number(t.data_makloon_mpp?.kuantum ?? t.data_makloon_tjp?.kuantum_bongkar ?? 0)
}
function candPemasok(t: TransaksiListItem): string {
  return t.data_makloon_mpp?.id_pemasok ?? t.data_jemput_pangan?.id_pemasok ?? ''
}
function candTanggal(t: TransaksiListItem): string {
  return (t.data_makloon_mpp?.tanggal_bongkar ?? t.data_makloon_tjp?.tanggal_bongkar ?? '').slice(0, 10)
}

// Kartu "PO Proses": alur dua langkah -- (1) PO: pilih ulang transaksi + koreksi No. PO & harga,
// (2) IN: isi Nomor IN per detail + No. SPP + status. Tombol "Kembali ke PO" di langkah IN
// membuka lagi langkah PO sebelum data Pengadaan disimpan. Dipakai panel inline di timeline.
export default function PoInForm({
  po,
  kandidat = [],
  preselectId,
  onChanged,
}: {
  po: PoItem
  kandidat?: TransaksiListItem[]
  preselectId?: string
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'po' | 'in'>('in')
  const [values, setValues] = useState<Record<number, string>>({})
  const [statusPo, setStatusPo] = useState(po.status)
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmIn, setConfirmIn] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)

  // State langkah PO (diisi ulang dari `po` tiap kali masuk langkah PO).
  const [noPoEdit, setNoPoEdit] = useState(po.no_po)
  const [hargaEdit, setHargaEdit] = useState(String(po.harga))
  const [selected, setSelected] = useState<Set<string>>(() => new Set(po.po_detail.map((d) => d.transaksi_id)))

  const memberIds = useMemo(() => po.po_detail.map((d) => d.transaksi_id), [po.po_detail])

  // Kandidat lain yang sekelompok PO ini (pemasok & tanggal bongkar sama) dan belum jadi anggota.
  const kandidatSekelompok = useMemo(
    () =>
      kandidat.filter(
        (t) =>
          !memberIds.includes(t.id_transaksi) &&
          candPemasok(t) === po.id_pemasok &&
          candTanggal(t) === String(po.tanggal_bongkar).slice(0, 10),
      ),
    [kandidat, memberIds, po.id_pemasok, po.tanggal_bongkar],
  )

  const kuantumById = useMemo(() => {
    const map = new Map<string, number>()
    po.po_detail.forEach((d) => map.set(d.transaksi_id, Number(d.kuantum_kontribusi)))
    kandidatSekelompok.forEach((t) => map.set(t.id_transaksi, candKuantum(t)))
    return map
  }, [po.po_detail, kandidatSekelompok])

  const barisPilih = useMemo(
    () => [
      ...po.po_detail.map((detail) => ({ id: detail.transaksi_id, kuantum: Number(detail.kuantum_kontribusi), anggota: true })),
      ...kandidatSekelompok.map((t) => ({ id: t.id_transaksi, kuantum: candKuantum(t), anggota: false })),
    ],
    [po.po_detail, kandidatSekelompok],
  )

  const totalKuantumSel = useMemo(
    () => [...selected].reduce((sum, id) => sum + (kuantumById.get(id) ?? 0), 0),
    [selected, kuantumById],
  )

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['po-list'] })
    queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
    onChanged?.()
  }

  const bukaLangkahPo = () => {
    setNoPoEdit(po.no_po)
    setHargaEdit(String(po.harga))
    setSelected(new Set(po.po_detail.map((d) => d.transaksi_id)))
    setStep('po')
  }

  const togglePilih = (id: string) => {
    if (id === preselectId) return // transaksi berjalan wajib ikut
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const simpanPo = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/anggota`, {
        transaksi_ids: Array.from(selected),
        no_po: noPoEdit.trim(),
        harga: hargaEdit ? Number(hargaEdit) : undefined,
      }),
    onSuccess: () => {
      afterChange()
      setStep('in')
      toast.success(`Data PO ${noPoEdit} tersimpan.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data PO.')),
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/in`, {
        items: po.po_detail
          .map((detail) => ({ po_detail_id: detail.id, no_in: (values[detail.id] ?? detail.no_in ?? '').trim() }))
          .filter((item) => item.no_in !== ''),
        no_spp: noSpp || undefined,
        status: statusPo,
      }),
    onSuccess: (res) => {
      setConfirmIn(false)
      setValues({})
      afterChange()
      const lengkap = (res.data as { data?: { status?: string } })?.data?.status === 'lengkap'
      toast.success(lengkap ? `PO ${po.no_po} lengkap, diteruskan ke Keuangan.` : `Data Pengadaan PO ${po.no_po} tersimpan.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan nomor IN.')),
  })

  const updatePo = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}`, { status: statusPo }),
    onSuccess: () => {
      setConfirmBatal(false)
      afterChange()
      toast.success(statusPo === 'dibatalkan' ? `PO ${po.no_po} dibatalkan.` : `PO ${po.no_po} diperbarui.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui PO.')),
  })

  const poError = (simpanPo.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const errorMessage =
    ((mutation.error || updatePo.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const isiCount = Object.values(values).filter((v) => v.trim() !== '').length
  const lengkapCount = po.po_detail.filter((d) => d.no_in || values[d.id]?.trim()).length
  const statusOptions: { value: PoItem['status']; label: string }[] = [
    { value: 'proses', label: 'Proses' },
    { value: 'lengkap', label: 'Lengkap' },
    { value: 'kwitansi_belum_upload', label: 'Kwitansi belum upload' },
    { value: 'foto_belum_lengkap', label: 'Foto belum lengkap' },
    { value: 'dibatalkan', label: 'Dibatalkan' },
  ]
  const siapKeKeuangan = statusPo === 'lengkap' && lengkapCount === po.po_detail.length && noSpp.trim() !== ''
  const bisaSimpan = statusPo === 'lengkap' ? siapKeKeuangan : (isiCount > 0 || statusPo !== po.status || noSpp.trim() !== (po.no_spp ?? ''))

  // ---- Langkah 1: PO (pilih ulang transaksi + koreksi No. PO & harga) ----
  if (step === 'po') {
    return (
      <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); simpanPo.mutate() }}>
        <div className="po-card-header">
          <div><div className="po-title">Ubah PO</div><div className="po-meta">Pilih transaksi, No. PO, dan harga.</div></div>
          <div className="flex items-center gap-2">
            <span className="badge">Langkah 1/2 - PO</span>
            <span className="badge badge-warning">{formatNumber(totalKuantumSel)} kg</span>
          </div>
        </div>
        {poError && <div className="alert-danger mb-3">{poError}</div>}

        <div className="data-table-wrap mb-4">
          <table className="data-table">
            <thead><tr><th className="w-10"></th><th>ID Transaksi</th><th className="text-right">Kuantum</th><th>Keterangan</th></tr></thead>
            <tbody>
              {barisPilih.map((row) => (
                <tr key={row.id}>
                  <td><input type="checkbox" checked={selected.has(row.id)} disabled={row.id === preselectId} onChange={() => togglePilih(row.id)} aria-label={`Pilih ${row.id}`} /></td>
                  <td className="font-semibold text-primary-dark">{row.id}</td>
                  <td className="text-right font-medium">{formatNumber(row.kuantum)} kg</td>
                  <td>{row.id === preselectId ? <span className="badge">transaksi ini (wajib)</span> : row.anggota ? <span className="badge">sudah di PO</span> : <span className="text-muted text-xs">tersedia</span>}</td>
                </tr>
              ))}
              {barisPilih.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-4">Tidak ada transaksi.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 @md:grid-cols-2">
          <label className="block"><span className="label">No. PO</span><input required className="input" value={noPoEdit} onChange={(e) => setNoPoEdit(e.target.value)} placeholder="Contoh: PO-0001/VII/2026" /></label>
          <label className="block"><span className="label">Harga per kg</span><input required type="number" step="0.01" min="0" className="input" value={hargaEdit} onChange={(e) => setHargaEdit(e.target.value)} /></label>
          <label className="block"><span className="label">Total Kuantum</span><input className="input" readOnly value={`${formatNumber(totalKuantumSel)} kg`} /></label>
          <label className="block"><span className="label">Total harga</span><input className="input" readOnly value={formatMoney(totalKuantumSel * Number(hargaEdit || 0))} /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <button type="button" className="btn btn-ghost" onClick={() => setStep('in')}>Batal</button>
          <button type="submit" disabled={selected.size === 0 || !noPoEdit.trim() || simpanPo.isPending} className="btn btn-primary">{simpanPo.isPending ? 'Menyimpan...' : 'Simpan & Lanjut ke IN'}</button>
        </div>
      </form>
    )
  }

  // ---- Langkah 2: IN (isi nomor IN + No. SPP + status) ----
  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); if (statusPo === 'dibatalkan' && po.status !== 'dibatalkan') setConfirmBatal(true); else setConfirmIn(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <div className="flex items-center gap-2">
          <span className="badge">Langkah 2/2 - IN</span>
          <span className="badge badge-warning">{lengkapCount}/{po.po_detail.length} IN terisi</span>
        </div>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="section-title mb-3">No. SPP & Status Sergab</div>
        <p className="page-subtitle mb-3">Status Lengkap akan mengirim PO ke Keuangan setelah semua nomor IN dan No. SPP terisi.</p>
        <div className="grid gap-4 @md:grid-cols-2">
          <label className="block"><span className="label">No. SPP</span><input className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" /></label>
          <label className="block"><span className="label">Status Sergab</span><select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        {statusPo === 'lengkap' && !siapKeKeuangan && <div className="alert-warning mt-3">Lengkapi seluruh nomor IN dan No. SPP sebelum status dibuat Lengkap.</div>}
      </div>
      <div className="data-table-wrap mb-3">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th className="text-right">Kuantum</th><th>Nomor IN</th></tr></thead>
          <tbody>
            {po.po_detail.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold text-primary-dark">{d.transaksi_id}</td>
                <td className="text-right">{formatNumber(d.kuantum_kontribusi)} kg</td>
                <td><input className="input" placeholder={d.no_in ?? 'Masukkan nomor IN'} disabled={!!d.no_in} value={values[d.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [d.id]: e.target.value }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button type="button" className="btn btn-ghost" onClick={bukaLangkahPo}>&larr; Kembali ke PO</button>
        <button type="submit" disabled={!bisaSimpan || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Data Pengadaan'}</button>
      </div>

      <ConfirmDialog
        open={confirmIn}
        title="Simpan nomor IN?"
        description={<><strong>{lengkapCount} nomor IN</strong>, No. SPP, dan status Sergab akan disimpan. Jika status Lengkap, PO diteruskan ke tahap <strong>Keuangan</strong>. Lanjutkan?</>}
        confirmLabel="Simpan Data"
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
