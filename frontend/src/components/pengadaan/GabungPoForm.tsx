import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatDate, formatMoney, formatNumber } from '../../lib/poFormat'
import type { TransaksiListItem } from '../../hooks/useTransaksiList'
import ConfirmDialog from '../ConfirmDialog'
import AngkaInput from '../AngkaInput'

// Kunci pengelompokan PO: transaksi hanya boleh digabung bila pemasok, tanggal bongkar, dan
// kuantum berasal dari sumber yang konsisten (MPP dari data makloon MPP, TJP dari jemput pangan +
// bongkar TJP). Penggabungan PO dilakukan dari timeline transaksi (TransaksiDetailPage).
function groupKeyOf(t: TransaksiListItem) {
  if (t.data_makloon_mpp) {
    return {
      id_pemasok: t.data_makloon_mpp.id_pemasok,
      tanggal_bongkar: t.data_makloon_mpp.tanggal_bongkar,
      kuantum: t.data_makloon_mpp.kuantum,
    }
  }
  if (t.data_makloon_tjp && t.data_jemput_pangan) {
    return {
      id_pemasok: t.data_jemput_pangan.id_pemasok,
      tanggal_bongkar: t.data_makloon_tjp.tanggal_bongkar,
      kuantum: t.data_makloon_tjp.kuantum_bongkar,
    }
  }
  return { id_pemasok: '-', tanggal_bongkar: '-', kuantum: '-' }
}

function groupIdOf(t: TransaksiListItem) {
  const k = groupKeyOf(t)
  return [t.skema, k.tanggal_bongkar, k.id_pemasok, t.nama_maklon ?? 'Tanpa makloon'].join('|')
}

function groupLabelOf(t: TransaksiListItem) {
  const k = groupKeyOf(t)
  return `${t.skema} - ${formatDate(k.tanggal_bongkar)} - ${k.id_pemasok} - ${t.nama_maklon ?? 'Tanpa makloon'}`
}

// Form "Gabungkan Transaksi Menjadi PO". Dipakai halaman Pengadaan (daftar semua transaksi siap PO)
// dan panel inline di timeline (daftar transaksi yang cocok, dengan transaksi berjalan tercentang &
// terkunci lewat prop `preselectId`). onChanged dipanggil setelah PO dibuat.
export default function GabungPoForm({
  transaksiList,
  preselectId,
  onChanged,
  onSelectionChange,
}: {
  transaksiList: TransaksiListItem[]
  preselectId?: string
  onChanged?: () => void
  onSelectionChange?: (count: number, totalKuantum: number) => void
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselectId ? [preselectId] : []))
  const [noPo, setNoPo] = useState('')
  const [harga, setHarga] = useState('6500')
  const [confirmGabung, setConfirmGabung] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')

  const selectedRows = useMemo(
    () => transaksiList.filter((item) => selected.has(item.id_transaksi)),
    [selected, transaksiList],
  )
  const groupOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>()
    for (const t of transaksiList) {
      const id = groupIdOf(t)
      const current = map.get(id)
      map.set(id, { id, label: groupLabelOf(t), count: (current?.count ?? 0) + 1 })
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'id'))
  }, [transaksiList])
  useEffect(() => {
    if (!preselectId) return
    const preselected = transaksiList.find((item) => item.id_transaksi === preselectId)
    if (preselected) setSelectedGroup(groupIdOf(preselected))
  }, [preselectId, transaksiList])
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        const row = transaksiList.find((item) => item.id_transaksi === id)
        if (row && selectedGroup && groupIdOf(row) === selectedGroup) next.add(id)
      }
      if (preselectId) next.add(preselectId)
      return next
    })
  }, [preselectId, selectedGroup, transaksiList])
  const filteredTransaksi = useMemo(
    () =>
      selectedGroup ? transaksiList.filter((t) => groupIdOf(t) === selectedGroup) : [],
    [transaksiList, selectedGroup],
  )
  const totalSelectedKuantum = selectedRows.reduce((sum, item) => sum + Number(groupKeyOf(item).kuantum || 0), 0)

  useEffect(() => {
    onSelectionChange?.(selected.size, totalSelectedKuantum)
  }, [selected.size, totalSelectedKuantum, onSelectionChange])

  const gabungMutation = useMutation({
    mutationFn: () =>
      api.post('/api/pengadaan/gabungkan-po', {
        transaksi_ids: Array.from(selected),
        no_po: noPo,
        harga: harga ? Number(harga) : undefined,
      }),
    onSuccess: () => {
      toast.success(`PO ${noPo} dibuat dari ${selected.size} transaksi. Silakan isi No. IN, No. SPP, dan status Sergab.`)
      setConfirmGabung(false)
      setSelected(new Set(preselectId ? [preselectId] : []))
      setNoPo('')
      setHarga('6500')
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      onChanged?.()
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menggabungkan PO.')),
  })

  const errorMessage = (gabungMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  const toggle = (id: string) => {
    if (id === preselectId) return // transaksi berjalan wajib ikut, tidak bisa dilepas
    setSelected((prev) => {
      const next = new Set(prev)
      const row = transaksiList.find((item) => item.id_transaksi === id)
      if (!row || (selectedGroup && groupIdOf(row) !== selectedGroup)) return next
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="@container">
      <div className="toolbar-card mb-4">
        <div>
          <h2 className="section-title">Gabungkan Transaksi Menjadi PO</h2>
          <p className="page-subtitle">Pilih transaksi dengan pemasok, tanggal bongkar, dan makloon yang sama.</p>
        </div>
        <span className="badge">Total dipilih: {formatNumber(totalSelectedKuantum)} kg</span>
      </div>

      {errorMessage && <div className="alert-danger mb-4">{errorMessage}</div>}
      {transaksiList.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">Belum ada transaksi siap digabung</div>
          <p className="empty-copy">Transaksi akan muncul setelah tahap Makloon dan UB Jastasma diterima.</p>
        </div>
      )}

      {transaksiList.length > 0 && (
        <>
          <div className="mb-4">
            <label className="block"><span className="label">Kelompok PO</span>
              <select className="input" value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
                <option value="">Pilih kelompok skema/tanggal/pemasok/mitra</option>
                {groupOptions.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.count} transaksi)</option>)}
              </select>
            </label>
          </div>

          <div className="data-table-wrap mb-4">
            <table className="data-table">
              <thead><tr><th className="w-10"></th><th>ID Transaksi</th><th>Skema</th><th>ID Pemasok</th><th>Tanggal Bongkar</th><th className="text-right">Kuantum</th></tr></thead>
              <tbody>
                {filteredTransaksi.map((t) => {
                  const key = groupKeyOf(t)
                  return (
                    <tr key={t.id_transaksi}>
                      <td><input type="checkbox" checked={selected.has(t.id_transaksi)} disabled={t.id_transaksi === preselectId} onChange={() => toggle(t.id_transaksi)} aria-label={`Pilih ${t.id_transaksi}`} /></td>
                      <td className="font-semibold text-primary-dark">{t.id_transaksi}</td>
                      <td><span className="badge">{t.skema}</span></td>
                      <td>{key.id_pemasok}</td>
                      <td>{key.tanggal_bongkar === '-' ? '-' : formatDate(key.tanggal_bongkar)}</td>
                      <td className="text-right font-medium">{formatNumber(key.kuantum)} kg</td>
                    </tr>
                  )
                })}
                {filteredTransaksi.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-4">Tidak ada transaksi yang cocok dengan filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <form className="grid gap-4 @md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setConfirmGabung(true) }}>
            <label className="block"><span className="label">No. PO</span><input required className="input" value={noPo} onChange={(e) => setNoPo(e.target.value)} placeholder="Contoh: PO-0001/VII/2026" /></label>
            <label className="block"><span className="label">Harga per kg</span><AngkaInput required value={harga} onChange={setHarga} /></label>
            <label className="block"><span className="label">Total Kuantum</span><input className="input" readOnly value={`${formatNumber(totalSelectedKuantum)} kg`} /></label>
            <label className="block"><span className="label">Total harga</span><input className="input" readOnly value={formatMoney(totalSelectedKuantum * Number(harga || 0))} /></label>
            <div className="@md:col-span-2 flex flex-wrap items-center justify-between gap-3">
              <button type="submit" disabled={selected.size === 0 || !noPo || gabungMutation.isPending} className="btn btn-primary">
                {gabungMutation.isPending ? 'Menggabungkan...' : `Buat PO dari ${selected.size} transaksi`}
              </button>
            </div>
          </form>

          <ConfirmDialog
            open={confirmGabung}
            title="Gabungkan menjadi PO?"
            description={<>PO <strong>{noPo}</strong> akan dibuat dari <strong>{selected.size} transaksi</strong> terpilih. Setelah itu Pengadaan mengisi No. IN, No. SPP, dan status Sergab. Lanjutkan?</>}
            confirmLabel="Buat PO"
            loading={gabungMutation.isPending}
            error={errorMessage}
            onCancel={() => setConfirmGabung(false)}
            onConfirm={() => gabungMutation.mutate()}
          />
        </>
      )}
    </section>
  )
}
