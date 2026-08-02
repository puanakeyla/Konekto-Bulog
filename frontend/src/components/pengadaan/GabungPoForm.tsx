import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatDate, formatMoney, formatNumber } from '../../lib/poFormat'
import type { TransaksiListItem } from '../../hooks/useTransaksiList'
import ConfirmDialog from '../ConfirmDialog'
import TahapDialog from '../TahapDialog'
import AngkaInput from '../AngkaInput'
import { kunciTransaksi } from '../../lib/transaksiKunci'

// Kunci pengelompokan PO: transaksi hanya boleh digabung bila pemasok, tanggal bongkar, dan
// makloon sama (dijaga backend di PoGroupingService). Nilai per transaksi diambil dari helper
// bersama supaya identik dengan yang ditampilkan daftar transaksi di dashboard.
function groupKeyOf(t: TransaksiListItem) {
  const k = kunciTransaksi(t)
  return {
    id_pemasok: k.id_pemasok ?? '-',
    tanggal_bongkar: k.tanggal_bongkar ?? '-',
    kuantum: k.kuantum ?? '-',
  }
}

function groupIdOf(t: TransaksiListItem) {
  const k = groupKeyOf(t)
  return [t.skema, k.tanggal_bongkar, k.id_pemasok, t.nama_maklon ?? 'Tanpa makloon'].join('|')
}

function groupLabelOf(t: TransaksiListItem) {
  const k = groupKeyOf(t)
  return `${t.skema} - ${k.tanggal_bongkar === '-' ? '-' : formatDate(k.tanggal_bongkar)} - ${k.id_pemasok} - ${t.nama_maklon ?? 'Tanpa makloon'}`
}

/** Nilai unik satu kolom untuk isi dropdown filter, diurutkan menaik. */
function opsiUnik(rows: TransaksiListItem[], ambil: (t: TransaksiListItem) => string) {
  return Array.from(new Set(rows.map(ambil))).sort((a, b) => a.localeCompare(b, 'id'))
}

// Form "Gabungkan Transaksi Menjadi PO". Dipakai halaman Pengadaan (daftar semua transaksi siap PO)
// dan panel inline di timeline (daftar transaksi yang cocok, dengan transaksi berjalan tercentang &
// terkunci lewat prop `preselectId`). onChanged dipanggil setelah PO dibuat.
export default function GabungPoForm({
  transaksiList,
  preselectId,
  onChanged,
  onSelectionChange,
  kembaliKeDashboard = true,
}: {
  transaksiList: TransaksiListItem[]
  preselectId?: string
  onChanged?: () => void
  onSelectionChange?: (count: number, totalKuantum: number) => void
  kembaliKeDashboard?: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselectId ? [preselectId] : []))
  const [noPo, setNoPo] = useState('')
  const [harga, setHarga] = useState('6500')
  const [confirmGabung, setConfirmGabung] = useState(false)
  const [filterMakloon, setFilterMakloon] = useState('')
  const [filterTanggal, setFilterTanggal] = useState('')
  const [filterPemasok, setFilterPemasok] = useState('')
  const [detailTahap, setDetailTahap] = useState<TransaksiListItem | null>(null)

  const selectedRows = useMemo(
    () => transaksiList.filter((item) => selected.has(item.id_transaksi)),
    [selected, transaksiList],
  )

  // Satu PO = satu (tanggal, pemasok, makloon). Filter tidak menjamin itu, jadi kelompok
  // dikunci oleh baris pertama yang tercentang (atau transaksi berjalan pada panel inline);
  // baris kelompok lain ikut tampil tapi tidak bisa dicentang, bukan disembunyikan, supaya
  // Pengadaan tetap melihat kenapa baris itu tidak boleh ikut.
  const penentuKelompok = useMemo(
    () => (preselectId ? transaksiList.find((item) => item.id_transaksi === preselectId) : selectedRows[0]) ?? null,
    [preselectId, selectedRows, transaksiList],
  )
  const lockedGroup = penentuKelompok ? groupIdOf(penentuKelompok) : null

  const makloonOptions = useMemo(() => opsiUnik(transaksiList, (t) => t.nama_maklon ?? 'Tanpa makloon'), [transaksiList])
  const tanggalOptions = useMemo(() => opsiUnik(transaksiList, (t) => groupKeyOf(t).tanggal_bongkar), [transaksiList])
  const pemasokOptions = useMemo(() => opsiUnik(transaksiList, (t) => groupKeyOf(t).id_pemasok), [transaksiList])

  const filteredTransaksi = useMemo(
    () => transaksiList.filter((t) => {
      const k = groupKeyOf(t)
      if (filterMakloon && (t.nama_maklon ?? 'Tanpa makloon') !== filterMakloon) return false
      if (filterTanggal && k.tanggal_bongkar !== filterTanggal) return false
      if (filterPemasok && k.id_pemasok !== filterPemasok) return false
      return true
    }),
    [transaksiList, filterMakloon, filterTanggal, filterPemasok],
  )

  // Buang centang yang barisnya hilang dari daftar (mis. sudah tergabung PO lain).
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (transaksiList.some((item) => item.id_transaksi === id)) next.add(id)
      }
      if (preselectId) next.add(preselectId)
      return next
    })
  }, [preselectId, transaksiList])
  const totalSelectedKuantum = selectedRows.reduce((sum, item) => {
    const kuantum = groupKeyOf(item).kuantum
    return sum + (kuantum === '-' ? 0 : Number(kuantum) || 0)
  }, 0)

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
      toast.success(kembaliKeDashboard
        ? `PO ${noPo} dibuat dari ${selected.size} transaksi. Cek dashboard untuk langkah berikutnya.`
        : `PO ${noPo} dibuat dari ${selected.size} transaksi. Lanjut isi nomor IN.`)
      setConfirmGabung(false)
      setSelected(new Set(preselectId ? [preselectId] : []))
      setNoPo('')
      setHarga('6500')
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ringkasan'] })
      onChanged?.()
      if (kembaliKeDashboard) navigate('/dashboard')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menggabungkan PO.')),
  })

  const errorMessage = (gabungMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  const toggle = (id: string) => {
    if (id === preselectId) return // transaksi berjalan wajib ikut, tidak bisa dilepas
    setSelected((prev) => {
      const next = new Set(prev)
      const row = transaksiList.find((item) => item.id_transaksi === id)
      if (!row) return next
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (lockedGroup && groupIdOf(row) !== lockedGroup) return next
      next.add(id)
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
          <div className="mb-4 grid gap-3 @md:grid-cols-3">
            <label className="block"><span className="label">Makloon</span>
              <select className="input" value={filterMakloon} onChange={(e) => setFilterMakloon(e.target.value)}>
                <option value="">Semua makloon</option>
                {makloonOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Tanggal bongkar</span>
              <select className="input" value={filterTanggal} onChange={(e) => setFilterTanggal(e.target.value)}>
                <option value="">Semua tanggal</option>
                {tanggalOptions.map((v) => <option key={v} value={v}>{v === '-' ? '-' : formatDate(v)}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">ID Pemasok</span>
              <select className="input" value={filterPemasok} onChange={(e) => setFilterPemasok(e.target.value)}>
                <option value="">Semua pemasok</option>
                {pemasokOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>

          {penentuKelompok && (
            <p className="mb-3 text-xs text-muted">
              Kelompok terkunci pada <strong>{groupLabelOf(penentuKelompok)}</strong>.
              Baris di luar kelompok itu tidak bisa dicentang. Lepas semua centang untuk berpindah kelompok.
            </p>
          )}

          <div className="data-table-wrap mb-4">
            <table className="data-table">
              <thead><tr><th className="w-10"></th><th>ID Transaksi</th><th>Skema</th><th>ID Pemasok</th><th>Tanggal Bongkar</th><th className="text-right">Kuantum</th></tr></thead>
              <tbody>
                {filteredTransaksi.map((t) => {
                  const key = groupKeyOf(t)
                  const bedaKelompok = !!lockedGroup && groupIdOf(t) !== lockedGroup
                  return (
                    <tr
                      key={t.id_transaksi}
                      onClick={() => setDetailTahap(t)}
                      title="Klik untuk melihat progres 5 tahap"
                      className={`cursor-pointer hover:bg-primary-tint/40 ${bedaKelompok ? 'opacity-45' : ''}`}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(t.id_transaksi)}
                          disabled={t.id_transaksi === preselectId || bedaKelompok}
                          onChange={() => toggle(t.id_transaksi)}
                          aria-label={`Pilih ${t.id_transaksi}`}
                        />
                      </td>
                      <td className="font-semibold text-primary-dark">{t.id_transaksi}</td>
                      <td><span className="badge">{t.skema}</span></td>
                      <td>{key.id_pemasok}</td>
                      <td>{key.tanggal_bongkar === '-' ? '-' : formatDate(key.tanggal_bongkar)}</td>
                      <td className="text-right font-medium">{key.kuantum === '-' ? '-' : `${formatNumber(key.kuantum)} kg`}</td>
                    </tr>
                  )
                })}
                {filteredTransaksi.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-4">Tidak ada transaksi yang cocok dengan filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <TahapDialog transaksi={detailTahap} onClose={() => setDetailTahap(null)} />

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
            description={kembaliKeDashboard
              ? <>PO <strong>{noPo}</strong> akan dibuat dari <strong>{selected.size} transaksi</strong> terpilih. Setelah tersimpan, Anda akan kembali ke dashboard untuk melihat langkah berikutnya. Lanjutkan?</>
              : <>PO <strong>{noPo}</strong> akan dibuat dari <strong>{selected.size} transaksi</strong> terpilih. Setelah tersimpan, form nomor IN langsung ditampilkan karena PO dan IN satu rangkaian kerja. Lanjutkan?</>}
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
