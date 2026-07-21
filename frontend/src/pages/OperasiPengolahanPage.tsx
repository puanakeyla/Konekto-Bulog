import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import FormHero from '../components/FormHero'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonTable } from '../components/Skeleton'
import { usePengolahanList, type Pengolahan } from '../hooks/usePengolahan'
import {
  useGabungkanMo,
  useGudangOptions,
  useKirimGudang,
  useKirimUlangPengadaan,
  useMoList,
  useTolakPengolahan,
  type Mo,
} from '../hooks/useMo'

function fmt(value: string | number | null): string {
  if (value === null || value === '') return '-'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value))
}

export default function OperasiPengolahanPage() {
  const { data: pengolahanResult, isLoading: loadingPengolahan } = usePengolahanList('menunggu_operasi')
  const { data: moResult, isLoading: loadingMo } = useMoList('operasi')

  const menunggu = pengolahanResult?.items ?? []
  const moOperasi = moResult?.items ?? []

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role Operasi"
        title="Pengolahan — Operasi"
        subtitle="Tinjau pengolahan dari UB Jastasma, gabungkan jadi No. MO, lalu setelah No. OUT keluar kirim ke gudang."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
        <ReviewLhpkSection rows={menunggu} loading={loadingPengolahan} />
        <MoOperasiSection rows={moOperasi} loading={loadingMo} />
      </div>
    </div>
  )
}

function ReviewLhpkSection({ rows, loading }: { rows: Pengolahan[]; loading: boolean }) {
  const gabung = useGabungkanMo()
  const tolak = useTolakPengolahan()

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [noMo, setNoMo] = useState('')
  const [noTm, setNoTm] = useState('')
  const [tolakId, setTolakId] = useState<number | null>(null)
  const [tolakCatatan, setTolakCatatan] = useState('')

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])
  const makloonIds = new Set(selectedRows.map((r) => r.makloon_user_id))
  const lintasMakloon = makloonIds.size > 1
  const totalKuantum = selectedRows.reduce((sum, r) => sum + Number(r.kuantum_olah || 0), 0)
  const bisaGabung = selectedRows.length > 0 && !lintasMakloon && noMo.trim() !== '' && noTm.trim() !== ''

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submitGabung() {
    if (!bisaGabung) return
    gabung.mutate(
      { pengolahan_ids: [...selected], no_mo: noMo.trim(), no_tm: noTm.trim() },
      {
        onSuccess: () => {
          toast.success(`No. MO ${noMo} dibuat dan dikirim ke Pengadaan.`)
          setSelected(new Set())
          setNoMo('')
          setNoTm('')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menggabungkan MO.')),
      },
    )
  }

  function submitTolak() {
    if (tolakId == null || tolakCatatan.trim() === '') return
    tolak.mutate(
      { id: tolakId, catatan: tolakCatatan.trim() },
      {
        onSuccess: () => {
          toast.success('Pengolahan dikembalikan ke UB Jastasma.')
          setTolakId(null)
          setTolakCatatan('')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menolak pengolahan.')),
      },
    )
  }

  return (
    <section className="panel panel-pad">
      <div className="toolbar-card mb-4">
        <div>
          <h2 className="section-title">Review Pengolahan (per LHPK)</h2>
          <p className="page-subtitle">Pilih baris makloon yang sama untuk digabung jadi satu No. MO, atau tolak untuk dikembalikan.</p>
        </div>
        <span className="badge badge-warning">{rows.length} menunggu</span>
      </div>

      {loading && <SkeletonTable />}
      {!loading && rows.length === 0 && (
        <div className="empty-state"><div className="empty-title">Tidak ada pengolahan menunggu</div><p className="empty-copy">Baris muncul setelah UB Jastasma mengirim pengolahan.</p></div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary-tint text-left text-primary-dark">
                <tr>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2">No. LHPK</th>
                  <th className="px-4 py-2">Makloon</th>
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2 text-right">Kuantum Olah</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                    </td>
                    <td className="px-4 py-2 font-medium text-primary-dark">{row.no_lhpk}</td>
                    <td className="px-4 py-2">{row.makloon?.nama_maklon ?? '-'}</td>
                    <td className="px-4 py-2">{row.tanggal}</td>
                    <td className="px-4 py-2 text-right">{fmt(row.kuantum_olah)}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => setTolakId(row.id)} className="font-medium text-danger">Tolak</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-primary-dark">Gabungkan ke No. MO</h3>
              <span className="badge">{selectedRows.length} baris · {fmt(totalKuantum)} kg</span>
            </div>
            {lintasMakloon && <div className="alert-danger mb-3">Baris terpilih berasal dari makloon berbeda. Pilih hanya satu makloon.</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="label">No. MO</span><input className="input" value={noMo} onChange={(e) => setNoMo(e.target.value)} placeholder="Nomor MO" /></label>
              <label className="block"><span className="label">No. TM (Transfer Move)</span><input className="input" value={noTm} onChange={(e) => setNoTm(e.target.value)} placeholder="Nomor TM" /></label>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" disabled={!bisaGabung || gabung.isPending} onClick={submitGabung} className="btn btn-primary">
                {gabung.isPending ? 'Menggabungkan...' : 'Gabungkan & Kirim ke Pengadaan'}
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={tolakId != null}
        title="Tolak pengolahan?"
        description="Baris ini dikembalikan ke UB Jastasma untuk diperbaiki. Sertakan alasan penolakan."
        confirmLabel="Tolak"
        confirmVariant="danger"
        loading={tolak.isPending}
        confirmDisabled={tolakCatatan.trim() === ''}
        onCancel={() => { setTolakId(null); setTolakCatatan('') }}
        onConfirm={submitTolak}
      >
        <textarea className="input mt-3 min-h-16" placeholder="Alasan penolakan" value={tolakCatatan} onChange={(e) => setTolakCatatan(e.target.value)} />
      </ConfirmDialog>
    </section>
  )
}

function MoOperasiSection({ rows, loading }: { rows: Mo[]; loading: boolean }) {
  return (
    <section className="panel panel-pad">
      <div className="toolbar-card mb-4">
        <div>
          <h2 className="section-title">MO di Meja Operasi</h2>
          <p className="page-subtitle">Setelah No. OUT keluar dari Pengadaan, isi tujuan gudang, No. TM gudang, dan kuantum total lalu kirim ke gudang.</p>
        </div>
        <span className="badge">{rows.length} MO</span>
      </div>

      {loading && <SkeletonTable />}
      {!loading && rows.length === 0 && (
        <div className="empty-state"><div className="empty-title">Belum ada MO di tahap Operasi</div><p className="empty-copy">MO muncul di sini setelah Pengadaan memutuskan No. OUT.</p></div>
      )}

      <div className="space-y-4">
        {rows.map((mo) => <MoKirimGudangCard key={mo.id} mo={mo} />)}
      </div>
    </section>
  )
}

function MoKirimGudangCard({ mo }: { mo: Mo }) {
  const kirim = useKirimGudang()
  const ulang = useKirimUlangPengadaan()
  const { data: gudangOptions } = useGudangOptions()

  const [tujuan, setTujuan] = useState<number | ''>('')
  const [noTmGudang, setNoTmGudang] = useState('')
  const [kuantumTotal, setKuantumTotal] = useState('')

  // MO kembali ke Operasi tanpa No. OUT hanya bisa karena ditolak Pengadaan → perlu dikirim ulang.
  const belumAdaOut = !mo.no_out
  const valid = tujuan !== '' && noTmGudang.trim() !== '' && Number(kuantumTotal) > 0

  function submit() {
    if (tujuan === '' || noTmGudang.trim() === '' || !(Number(kuantumTotal) > 0)) return
    kirim.mutate(
      { id: mo.id, body: { tujuan_gudang_user_id: tujuan, no_tm_gudang: noTmGudang.trim(), kuantum_total: Number(kuantumTotal) } },
      {
        onSuccess: () => toast.success(`MO ${mo.no_mo} dikirim ke gudang.`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengirim ke gudang.')),
      },
    )
  }

  function kirimUlang() {
    ulang.mutate(mo.id, {
      onSuccess: () => toast.success(`MO ${mo.no_mo} dikirim ulang ke Pengadaan.`),
      onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengirim ulang ke Pengadaan.')),
    })
  }

  return (
    <div className="po-card">
      <div className="po-card-header">
        <div>
          <div className="po-title">No. MO {mo.no_mo}</div>
          <div className="po-meta">{mo.makloon?.nama_maklon ?? '-'} · No. TM {mo.no_tm} · {fmt(mo.total_kuantum_olah)} kg</div>
        </div>
        {belumAdaOut
          ? <span className="badge badge-danger">Ditolak Pengadaan</span>
          : <span className="badge badge-success">No. OUT {mo.no_out}</span>}
      </div>

      {mo.catatan_penolakan && <div className="alert-danger mb-3">Ditolak: {mo.catatan_penolakan}</div>}

      {belumAdaOut ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">MO dikembalikan Pengadaan. Perbaiki sesuai catatan, lalu kirim ulang untuk keputusan OUT.</p>
          <button type="button" disabled={ulang.isPending} onClick={kirimUlang} className="btn btn-primary">
            {ulang.isPending ? 'Mengirim...' : 'Kirim Ulang ke Pengadaan'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">Tujuan Gudang</span>
              <select className="input" value={tujuan} onChange={(e) => setTujuan(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Pilih gudang…</option>
                {(gudangOptions ?? []).map((g) => <option key={g.id} value={g.id}>{g.nama_gudang}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">No. TM Gudang</span><input className="input" value={noTmGudang} onChange={(e) => setNoTmGudang(e.target.value)} placeholder="Nomor TM gudang" /></label>
            <label className="block"><span className="label">Kuantum Total (kg)</span><input className="input" type="number" step="0.01" min="0" value={kuantumTotal} onChange={(e) => setKuantumTotal(e.target.value)} /></label>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" disabled={!valid || kirim.isPending} onClick={submit} className="btn btn-primary">
              {kirim.isPending ? 'Mengirim...' : 'Kirim ke Gudang'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
