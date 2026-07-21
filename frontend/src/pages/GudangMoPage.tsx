import { useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import { useAuth } from '../hooks/useAuth'
import FormHero from '../components/FormHero'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards } from '../components/Skeleton'
import { useMoList, useTerimaMo, useTolakMo, type Mo } from '../hooks/useMo'

function fmt(value: string | null): string {
  if (value === null || value === '') return '-'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value))
}

export default function GudangMoPage() {
  const { user } = useAuth()
  const { data: moResult, isLoading } = useMoList('gudang')

  // Tahap gudang difilter server-side; sisakan filter tujuan = akun ini (admin melihat semua).
  const rows = (moResult?.items ?? []).filter(
    (m) => user?.role.nama_role === 'admin' || m.tujuan_gudang_user_id === user?.id,
  )

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role Gudang"
        title="Penerimaan Gudang (MO)"
        subtitle="Konfirmasi penerimaan MO dari Operasi dengan mengisi tanggal masuk, atau tolak dengan catatan."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">MO Menunggu Penerimaan</h2>
              <p className="page-subtitle">Terima untuk menutup alur, atau tolak untuk dikembalikan ke Operasi.</p>
            </div>
            <span className="badge badge-warning">{rows.length} menunggu</span>
          </div>

          {isLoading && <SkeletonPoCards />}
          {!isLoading && rows.length === 0 && (
            <div className="empty-state"><div className="empty-title">Tidak ada MO menunggu</div><p className="empty-copy">MO muncul setelah Operasi mengirim ke gudang ini.</p></div>
          )}

          <div className="space-y-4">
            {rows.map((mo) => <MoTerimaCard key={mo.id} mo={mo} />)}
          </div>
        </section>
      </div>
    </div>
  )
}

type Aksi = '' | 'terima' | 'tolak'

function MoTerimaCard({ mo }: { mo: Mo }) {
  const terima = useTerimaMo()
  const tolak = useTolakMo()
  const [aksi, setAksi] = useState<Aksi>('')
  const [tanggal, setTanggal] = useState('')
  const [catatan, setCatatan] = useState('')
  const [confirm, setConfirm] = useState(false)

  const pending = terima.isPending || tolak.isPending
  const valid = aksi === 'terima' ? tanggal !== '' : aksi === 'tolak' ? catatan.trim() !== '' : false

  function submit() {
    if (!valid) return
    const onError = (err: unknown) => toast.error(apiErrorMessage(err, 'Gagal menyimpan penerimaan.'))
    if (aksi === 'terima') {
      terima.mutate({ id: mo.id, tanggal }, {
        onSuccess: () => { setConfirm(false); toast.success(`MO ${mo.no_mo} diterima. Alur selesai.`) },
        onError,
      })
    } else if (aksi === 'tolak') {
      tolak.mutate({ id: mo.id, catatan: catatan.trim() }, {
        onSuccess: () => { setConfirm(false); toast.success('MO dikembalikan ke Operasi.') },
        onError,
      })
    }
  }

  return (
    <div className="po-card @container">
      <div className="po-card-header">
        <div>
          <div className="po-title">No. MO {mo.no_mo}</div>
          <div className="po-meta">
            {mo.makloon?.nama_maklon ?? '-'} · No. OUT {mo.no_out ?? '-'} · No. TM Gudang {mo.no_tm_gudang ?? '-'} · {fmt(mo.kuantum_total)} kg
          </div>
        </div>
        <span className="badge badge-warning">Menunggu penerimaan</span>
      </div>

      {mo.tujuan_gudang?.nama_gudang && <div className="mb-3 text-xs text-muted">Tujuan: {mo.tujuan_gudang.nama_gudang}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAksi('terima')} className={`btn ${aksi === 'terima' ? 'btn-primary' : 'btn-ghost border border-border bg-white'}`}>Terima</button>
        <button type="button" onClick={() => setAksi('tolak')} className={`btn ${aksi === 'tolak' ? 'btn-danger' : 'btn-ghost border border-border bg-white'}`}>Tolak</button>
      </div>

      {aksi === 'terima' && (
        <label className="mt-3 block max-w-sm"><span className="label">Tanggal terima</span><input className="input" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></label>
      )}
      {aksi === 'tolak' && (
        <label className="mt-3 block"><span className="label">Catatan penolakan</span><textarea className="input min-h-16" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Alasan dikembalikan ke Operasi" /></label>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" disabled={!valid || pending} onClick={() => setConfirm(true)} className="btn btn-primary">Kirim</button>
      </div>

      <ConfirmDialog
        open={confirm}
        title={aksi === 'terima' ? 'Terima MO ini?' : 'Tolak MO ini?'}
        description={aksi === 'terima'
          ? <>MO <strong>{mo.no_mo}</strong> ditandai <strong>diterima</strong> pada {tanggal}. Alur pengolahan selesai. Lanjutkan?</>
          : <>MO <strong>{mo.no_mo}</strong> dikembalikan ke Operasi. Lanjutkan?</>}
        confirmLabel={aksi === 'terima' ? 'Terima' : 'Tolak'}
        confirmVariant={aksi === 'tolak' ? 'danger' : 'primary'}
        loading={pending}
        onCancel={() => setConfirm(false)}
        onConfirm={submit}
      />
    </div>
  )
}
