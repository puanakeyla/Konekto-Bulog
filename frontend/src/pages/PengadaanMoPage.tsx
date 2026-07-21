import { useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import FormHero from '../components/FormHero'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { SkeletonPoCards } from '../components/Skeleton'
import { useMoList, usePutuskanOut, type Mo } from '../hooks/useMo'

function fmt(value: string | null): string {
  if (value === null || value === '') return '-'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value))
}

export default function PengadaanMoPage() {
  const [page, setPage] = useState(1)
  const { data: moResult, isLoading } = useMoList('pengadaan', page)
  const rows = moResult?.items ?? []

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role Pengadaan"
        title="Keputusan OUT (MO)"
        subtitle="Tinjau MO dari Operasi. Terima dengan menerbitkan No. OUT, atau tolak dengan catatan — keduanya kembali ke Operasi."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">MO Menunggu Keputusan</h2>
              <p className="page-subtitle">Terbitkan No. OUT untuk melanjutkan, atau tolak untuk dikembalikan ke Operasi.</p>
            </div>
            <span className="badge badge-warning">{rows.length} menunggu</span>
          </div>

          {isLoading && <SkeletonPoCards />}
          {!isLoading && rows.length === 0 && (
            <div className="empty-state"><div className="empty-title">Tidak ada MO menunggu</div><p className="empty-copy">MO muncul setelah Operasi menggabungkan pengolahan.</p></div>
          )}

          <div className="space-y-4">
            {rows.map((mo) => <MoOutCard key={mo.id} mo={mo} />)}
          </div>

          <Pagination meta={moResult?.meta} page={page} onPage={setPage} />
        </section>
      </div>
    </div>
  )
}

type Keputusan = '' | 'diterima' | 'ditolak'

function MoOutCard({ mo }: { mo: Mo }) {
  const putuskan = usePutuskanOut()
  const [keputusan, setKeputusan] = useState<Keputusan>('')
  const [noOut, setNoOut] = useState('')
  const [catatan, setCatatan] = useState('')
  const [confirm, setConfirm] = useState(false)

  const valid = keputusan === 'diterima' ? noOut.trim() !== '' : keputusan === 'ditolak' ? catatan.trim() !== '' : false

  function submit() {
    if (!valid || keputusan === '') return
    putuskan.mutate(
      {
        id: mo.id,
        body: keputusan === 'diterima'
          ? { keputusan: 'diterima', no_out: noOut.trim() }
          : { keputusan: 'ditolak', catatan: catatan.trim() },
      },
      {
        onSuccess: () => {
          setConfirm(false)
          toast.success(keputusan === 'diterima' ? `No. OUT ${noOut} dikirim ke Operasi.` : 'MO dikembalikan ke Operasi.')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan keputusan OUT.')),
      },
    )
  }

  return (
    <div className="po-card @container">
      <div className="po-card-header">
        <div>
          <div className="po-title">No. MO {mo.no_mo}</div>
          <div className="po-meta">{mo.makloon?.nama_maklon ?? '-'} · No. TM {mo.no_tm} · {fmt(mo.total_kuantum_olah)} kg</div>
        </div>
        <span className="badge badge-warning">Menunggu keputusan</span>
      </div>

      <div className="mb-3 text-xs text-muted">
        {mo.mo_detail?.length ?? 0} LHPK: {(mo.mo_detail ?? []).map((d) => d.pengolahan?.no_lhpk).filter(Boolean).join(', ') || '-'}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setKeputusan('diterima')} className={`btn ${keputusan === 'diterima' ? 'btn-primary' : 'btn-ghost border border-border bg-white'}`}>Terima (No. OUT)</button>
        <button type="button" onClick={() => setKeputusan('ditolak')} className={`btn ${keputusan === 'ditolak' ? 'btn-danger' : 'btn-ghost border border-border bg-white'}`}>Tolak</button>
      </div>

      {keputusan === 'diterima' && (
        <label className="mt-3 block max-w-sm"><span className="label">Nomor OUT</span><input className="input" value={noOut} onChange={(e) => setNoOut(e.target.value)} placeholder="Masukkan No. OUT" /></label>
      )}
      {keputusan === 'ditolak' && (
        <label className="mt-3 block"><span className="label">Catatan penolakan</span><textarea className="input min-h-16" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Alasan dikembalikan ke Operasi" /></label>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" disabled={!valid || putuskan.isPending} onClick={() => setConfirm(true)} className="btn btn-primary">Kirim Keputusan</button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Kirim keputusan OUT?"
        description={keputusan === 'diterima'
          ? <>MO <strong>{mo.no_mo}</strong> diterima dengan No. OUT <strong>{noOut}</strong> dan dikembalikan ke Operasi. Lanjutkan?</>
          : <>MO <strong>{mo.no_mo}</strong> ditolak dan dikembalikan ke Operasi untuk diperbaiki. Lanjutkan?</>}
        confirmLabel="Kirim Keputusan"
        confirmVariant={keputusan === 'ditolak' ? 'danger' : 'primary'}
        loading={putuskan.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={submit}
      />
    </div>
  )
}
