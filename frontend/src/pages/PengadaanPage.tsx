import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { useTransaksiList, type TransaksiListItem } from '../hooks/useTransaksiList'
import { usePoList, type PoItem } from '../hooks/usePoList'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards, SkeletonTable } from '../components/Skeleton'
import FormHero from '../components/FormHero'

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

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function formatMoney(value: string | number) {
  return Number(value).toLocaleString('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  })
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('id-ID')
}

function semuaOperasiAda(po: PoItem) {
  return po.po_detail.length > 0 && po.po_detail.every((detail) => !!detail.data_operasi)
}

function adaOutMenunggu(po: PoItem) {
  return po.po_detail.some((detail) => detail.data_operasi?.status_out === 'menunggu_pengadaan')
}

export default function PengadaanPage() {
  const [transaksiPage, setTransaksiPage] = useState(1)
  const [poPage, setPoPage] = useState(1)
  const { data: transaksiResult, isLoading: loadingTransaksi } = useTransaksiList(transaksiPage, 20, true)
  const { data: poResult, isLoading: loadingPo } = usePoList(poPage)
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [noPo, setNoPo] = useState('')
  const [harga, setHarga] = useState('6500')
  const [confirmGabung, setConfirmGabung] = useState(false)
  const [filterPemasok, setFilterPemasok] = useState('')
  const [filterTanggal, setFilterTanggal] = useState('')

  const transaksiList = transaksiResult?.items ?? []
  const transaksiMeta = transaksiResult?.meta
  const poList = poResult?.items ?? []
  const poMeta = poResult?.meta
  const poMenungguOut = poList.filter((po) => semuaOperasiAda(po) && adaOutMenunggu(po))
  const selectedRows = useMemo(
    () => transaksiList.filter((item) => selected.has(item.id_transaksi)),
    [selected, transaksiList],
  )
  const opsiPemasok = useMemo(
    () => Array.from(new Set(transaksiList.map((t) => groupKeyOf(t).id_pemasok))).filter((v) => v !== '-'),
    [transaksiList],
  )
  const opsiTanggal = useMemo(
    () => Array.from(new Set(transaksiList.map((t) => groupKeyOf(t).tanggal_bongkar))).filter((v) => v !== '-'),
    [transaksiList],
  )
  const filteredTransaksi = useMemo(
    () =>
      transaksiList.filter((t) => {
        const k = groupKeyOf(t)
        return (!filterPemasok || k.id_pemasok === filterPemasok) && (!filterTanggal || k.tanggal_bongkar === filterTanggal)
      }),
    [transaksiList, filterPemasok, filterTanggal],
  )
  const poBelumLengkap = poList.filter((po) => po.status === 'proses')
  const totalSelectedKuantum = selectedRows.reduce((sum, item) => sum + Number(groupKeyOf(item).kuantum || 0), 0)
  const detailBelumOut = poMenungguOut.reduce(
    (sum, po) => sum + po.po_detail.filter((detail) => detail.data_operasi?.status_out === 'menunggu_pengadaan').length,
    0,
  )

  const gabungMutation = useMutation({
    mutationFn: () =>
      api.post('/api/pengadaan/gabungkan-po', {
        transaksi_ids: Array.from(selected),
        no_po: noPo,
        harga: harga ? Number(harga) : undefined,
      }),
    onSuccess: () => {
      toast.success(`PO ${noPo} dibuat dari ${selected.size} transaksi, diteruskan ke Keuangan.`)
      setConfirmGabung(false)
      setSelected(new Set())
      setNoPo('')
      setHarga('6500')
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menggabungkan PO.')),
  })

  const errorMessage =
    (gabungMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Pengadaan"
        subtitle="Gabungkan transaksi Makloon menjadi PO, lalu isi nomor IN per transaksi asal."
        badge="Role Pengadaan"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Transaksi siap PO</div><div className="stat-value">{transaksiMeta?.total ?? transaksiList.length}</div></div>
            <div className="stat-card"><div className="stat-label">Dipilih</div><div className="stat-value">{selected.size}</div></div>
            <div className="stat-card"><div className="stat-label">PO proses</div><div className="stat-value">{poBelumLengkap.length}</div></div>
            <div className="stat-card"><div className="stat-label">Nomor OUT kosong</div><div className="stat-value">{detailBelumOut}</div></div>
          </div>

          <section className="panel panel-pad @container">
            <div className="toolbar-card mb-4">
              <div>
                <h2 className="section-title">Gabungkan Transaksi Menjadi PO</h2>
                <p className="page-subtitle">Pilih transaksi dengan pemasok, tanggal bongkar, dan makloon yang sama.</p>
              </div>
              <span className="badge">Total dipilih: {formatNumber(totalSelectedKuantum)} kg</span>
            </div>

            {errorMessage && <div className="alert-danger mb-4">{errorMessage}</div>}
            {loadingTransaksi && <SkeletonTable cols={6} />}
            {!loadingTransaksi && transaksiList.length === 0 && (
              <div className="empty-state">
                <div className="empty-title">Belum ada transaksi siap digabung</div>
                <p className="empty-copy">Transaksi akan muncul setelah tahap Makloon dan UB Jastasma diterima.</p>
              </div>
            )}

            {transaksiList.length > 0 && (
              <>
                <div className="grid gap-4 @md:grid-cols-2 mb-4">
                  <label className="block"><span className="label">Filter ID Pemasok</span>
                    <select className="input" value={filterPemasok} onChange={(e) => setFilterPemasok(e.target.value)}>
                      <option value="">Semua pemasok</option>
                      {opsiPemasok.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className="label">Filter Tanggal Bongkar</span>
                    <select className="input" value={filterTanggal} onChange={(e) => setFilterTanggal(e.target.value)}>
                      <option value="">Semua tanggal</option>
                      {opsiTanggal.map((v) => <option key={v} value={v}>{formatDate(v)}</option>)}
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
                            <td><input type="checkbox" checked={selected.has(t.id_transaksi)} onChange={() => toggle(t.id_transaksi)} aria-label={`Pilih ${t.id_transaksi}`} /></td>
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
                  <label className="block"><span className="label">Harga per kg</span><input required type="number" step="0.01" min="0" className="input" value={harga} onChange={(e) => setHarga(e.target.value)} /></label>
                  <label className="block"><span className="label">Total Kuantum</span><input className="input" readOnly value={`${formatNumber(totalSelectedKuantum)} kg`} /></label>
                  <label className="block"><span className="label">Total harga</span><input className="input" readOnly value={formatMoney(totalSelectedKuantum * Number(harga || 0))} /></label>
                  <div className="@md:col-span-2 flexflex-wrap items-center justify-between gap-3">
                    <button type="submit" disabled={selected.size === 0 || !noPo || gabungMutation.isPending} className="btn btn-primary">
                      {gabungMutation.isPending ? 'Menggabungkan...' : `Buat PO dari ${selected.size} transaksi`}
                    </button>
                  </div>
                </form>

                <ConfirmDialog
                  open={confirmGabung}
                  title="Gabungkan menjadi PO?"
                  description={<>PO <strong>{noPo}</strong> akan dibuat dari <strong>{selected.size} transaksi</strong> terpilih. Transaksi tersebut akan dikunci dan diteruskan ke tahap <strong>Keuangan</strong>. Lanjutkan?</>}
                  confirmLabel="Buat PO"
                  loading={gabungMutation.isPending}
                  error={errorMessage}
                  onCancel={() => setConfirmGabung(false)}
                  onConfirm={() => gabungMutation.mutate()}
                />
                {transaksiMeta && transaksiMeta.last_page > 1 && (
                  <PaginationBar
                    className="mt-4"
                    meta={transaksiMeta}
                    page={transaksiPage}
                    setPage={setTransaksiPage}
                    label="transaksi"
                  />
                )}
              </>
            )}
          </section>

          <section className="panel panel-pad @container">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Proses - Isi Nomor IN</h2><p className="page-subtitle">Setelah seluruh nomor IN terisi, PO masuk ke antrean Keuangan.</p></div>
              <span className="badge badge-warning">{poBelumLengkap.length} PO proses</span>
            </div>

            {loadingPo && <SkeletonPoCards />}
            {!loadingPo && poBelumLengkap.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu nomor IN</div><p className="empty-copy">PO yang sudah lengkap otomatis lanjut ke antrean Keuangan.</p></div>
            )}

            <div className="space-y-4">{poBelumLengkap.map((po) => <PoInForm key={po.id} po={po} />)}</div>
            {poMeta && poMeta.last_page > 1 && <PaginationBar className="mt-4" meta={poMeta} page={poPage} setPage={setPoPage} label="PO" />}
          </section>

          <section className="panel panel-pad @container">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">Approval Nomor OUT</h2><p className="page-subtitle">Setujui permintaan pengeluaran stok dari Operasi dengan mengisi nomor OUT per IN.</p></div>
              <span className="badge badge-warning">{poMenungguOut.length} PO menunggu</span>
            </div>

            {loadingPo && <SkeletonPoCards />}
            {!loadingPo && poMenungguOut.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada permintaan OUT</div><p className="empty-copy">Permintaan muncul setelah Operasi mengirim data MO/TM dan hasil produksi.</p></div>
            )}

            <div className="space-y-4">{poMenungguOut.map((po) => <PoOutApprovalForm key={po.id} po={po} />)}</div>
          </section>
      </div>
    </div>
  )
}

function PaginationBar({ meta, page, setPage, label, className = '' }: { meta: { current_page: number; last_page: number; total: number; from: number | null; to: number | null }; page: number; setPage: Dispatch<SetStateAction<number>>; label: string; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-sm text-muted ${className}`}>
      <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} {label}</span>
      <div className="flex gap-2">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
        <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
        <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}

function PoOutApprovalForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})
  const [confirmOut, setConfirmOut] = useState(false)

  const pendingDetails = po.po_detail.filter((detail) => detail.data_operasi?.status_out === 'menunggu_pengadaan')
  const isiCount = Object.values(values).filter((value) => value.trim() !== '').length
  const allValid = pendingDetails.length > 0 && pendingDetails.every((detail) => values[detail.id]?.trim())

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/out`, {
        items: pendingDetails.map((detail) => ({
          po_detail_id: detail.id,
          no_out: values[detail.id],
        })),
      }),
    onSuccess: () => {
      setConfirmOut(false)
      setValues({})
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`Nomor OUT PO ${po.no_po} disetujui dan dikirim ke Operasi.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyetujui nomor OUT.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmOut(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - No. SPP {po.no_spp ?? '-'}</div></div>
        <span className="badge badge-warning">{pendingDetails.length} OUT kosong</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="data-table-wrap mb-3">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th>No. IN</th><th>No. MO</th><th>No. TM</th><th>Nomor OUT</th></tr></thead>
          <tbody>
            {pendingDetails.map((detail) => (
              <tr key={detail.id}>
                <td className="font-semibold text-primary-dark">{detail.transaksi_id}</td>
                <td>{detail.no_in ?? '-'}</td>
                <td>{detail.data_operasi?.no_mo ?? '-'}</td>
                <td>{detail.data_operasi?.no_tm ?? '-'}</td>
                <td><input required className="input" placeholder="Masukkan nomor OUT" value={values[detail.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [detail.id]: e.target.value }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end"><button type="submit" disabled={!allValid || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyetujui...' : 'Approve Nomor OUT'}</button></div>

      <ConfirmDialog
        open={confirmOut}
        title="Approve nomor OUT?"
        description={<><strong>{isiCount} nomor OUT</strong> pada PO <strong>{po.no_po}</strong> akan disetujui dan dikirim kembali ke Operasi. Jika seluruh IN sudah punya nomor OUT, PO lanjut ke tahap <strong>Gudang</strong>. Lanjutkan?</>}
        confirmLabel="Approve OUT"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

function PoInForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})
  const [statusPo, setStatusPo] = useState(po.status)
  const [confirmIn, setConfirmIn] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/in`, {
        items: Object.entries(values)
          .filter(([, no_in]) => no_in.trim() !== '')
          .map(([po_detail_id, no_in]) => ({ po_detail_id: Number(po_detail_id), no_in })),
      }),
    onSuccess: (res) => {
      setConfirmIn(false)
      setValues({})
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      const lengkap = (res.data as { data?: { status?: string } })?.data?.status === 'lengkap'
      toast.success(lengkap ? `PO ${po.no_po} lengkap, diteruskan ke Keuangan.` : `Nomor IN PO ${po.no_po} tersimpan.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan nomor IN.')),
  })

  const updatePo = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}`, { status: statusPo }),
    onSuccess: () => {
      setConfirmBatal(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(statusPo === 'dibatalkan' ? `PO ${po.no_po} dibatalkan.` : `PO ${po.no_po} diperbarui.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui PO.')),
  })

  // Harga bisa diubah bebas (tanpa dialog); khusus perubahan status ke 'dibatalkan'
  // wajib konfirmasi karena membatalkan PO tidak bisa diurungkan lewat UI ini.
  const submitUpdatePo = () => {
    if (statusPo === 'dibatalkan' && po.status !== 'dibatalkan') {
      setConfirmBatal(true)
      return
    }
    updatePo.mutate()
  }

  const errorMessage =
    ((mutation.error || updatePo.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const isiCount = Object.values(values).filter((v) => v.trim() !== '').length
  const lengkapCount = po.po_detail.filter((d) => d.no_in).length

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmIn(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">{lengkapCount}/{po.po_detail.length} IN terisi</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="section-title mb-3">Status PO</div>
        <p className="page-subtitle mb-3">Harga per kg hanya diatur saat menggabungkan transaksi menjadi PO.</p>
        <div className="grid gap-4 @md:grid-cols-2">
          <label className="block"><span className="label">Status</span><select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}><option value="proses">Proses</option><option value="lengkap">Lengkap</option><option value="dibatalkan">Dibatalkan</option></select></label>
          <div className="@md:col-span-2 flex justify-end"><button type="button" disabled={updatePo.isPending} onClick={submitUpdatePo} className="btn btn-primary">{updatePo.isPending ? 'Menyimpan...' : 'Update Status'}</button></div>
        </div>
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
      <div className="flex justify-end"><button type="submit" disabled={isiCount === 0 || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Nomor IN'}</button></div>

      <ConfirmDialog
        open={confirmIn}
        title="Simpan nomor IN?"
        description={<><strong>{isiCount} nomor IN</strong> akan disimpan dan tidak bisa diubah lagi. Jika seluruh nomor IN pada PO ini sudah terisi, PO otomatis diteruskan ke tahap <strong>Keuangan</strong>. Lanjutkan?</>}
        confirmLabel="Simpan Nomor IN"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmIn(false)}
        onConfirm={() => mutation.mutate()}
      />

      <ConfirmDialog
        open={confirmBatal}
        title="Batalkan PO ini?"
        description={<>PO <strong>{po.no_po}</strong> akan ditandai <strong>dibatalkan</strong> dan keluar dari alur pengadaan. Tindakan ini tidak bisa diurungkan dari layar ini. Lanjutkan?</>}
        confirmLabel="Batalkan PO"
        confirmVariant="danger"
        loading={updatePo.isPending}
        onCancel={() => setConfirmBatal(false)}
        onConfirm={() => updatePo.mutate()}
      />
    </form>
  )
}
