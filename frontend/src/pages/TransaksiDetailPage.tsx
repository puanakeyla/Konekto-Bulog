import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { uploadSemuaFoto } from '../lib/uploadFoto'
import FotoPicker from '../components/FotoPicker'

type StageData = Record<string, unknown> & { status: string }

type TransaksiDetail = {
  id_transaksi: string
  skema: 'TJP' | 'MPP'
  current_stage: string
  status_keseluruhan: string
  created_by: number
  created_at: string
  data_jemput_pangan: StageData | null
  data_makloon_mpp: StageData | null
  data_makloon_tjp: StageData | null
  data_ub_jastasma: StageData | null
}

type StageConfig = {
  id: string
  label: string
  owner: string
  dataKeys: (keyof TransaksiDetail)[]
  helper: string
  actionPath?: string
  actionLabel?: string
}

const STAGES: StageConfig[] = [
  { id: 'jemput_pangan', label: 'Jemput Pangan', owner: 'Jemput Pangan', dataKeys: ['data_jemput_pangan'], helper: 'Input pemasok, kuantum awal, tujuan makloon, dan dokumen lapangan.' },
  { id: 'makloon', label: 'Makloon', owner: 'Makloon', dataKeys: ['data_makloon_tjp', 'data_makloon_mpp'], helper: 'Input data bongkar dan dokumen timbang dari makloon.' },
  { id: 'ub_jastasma', label: 'UB Jastasma', owner: 'UB Jastasma', dataKeys: ['data_ub_jastasma'], helper: 'Cek mutu gabah sebelum transaksi masuk pengadaan.' },
  { id: 'pengadaan', label: 'Pengadaan', owner: 'Pengadaan', dataKeys: [], helper: 'Gabungkan transaksi yang diterima menjadi PO dan isi nomor IN.', actionPath: '/pengadaan', actionLabel: 'Buka Pengadaan' },
  { id: 'keuangan', label: 'Keuangan', owner: 'Keuangan', dataKeys: [], helper: 'Input No. SPP dan tanggal pembayaran PO.', actionPath: '/keuangan', actionLabel: 'Buka Keuangan' },
  { id: 'operasi', label: 'Operasi', owner: 'Operasi', dataKeys: [], helper: 'Input MO/TM dan persentase hasil produksi.', actionPath: '/operasi', actionLabel: 'Buka Operasi' },
  { id: 'gudang', label: 'Gudang', owner: 'Gudang', dataKeys: [], helper: 'Catat penerimaan akhir ke gudang.', actionPath: '/gudang', actionLabel: 'Buka Gudang' },
]

const HIDDEN_FIELDS = new Set(['id', 'transaksi_id', 'locked_by', 'submitted_by', 'created_at', 'updated_at'])

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  catatan_penolakan: 'Catatan penolakan',
  locked_at: 'Diterima pada',
  submitted_at: 'Dikirim pada',
  id_pemasok: 'ID pemasok',
  supir: 'Supir',
  plat_mobil: 'Plat mobil',
  nama_poktan_gapoktan: 'Poktan/Gapoktan',
  desa: 'Desa',
  kecamatan: 'Kecamatan',
  kabupaten: 'Kabupaten',
  makloon_user_id: 'Makloon tujuan',
  tanggal_kirim: 'Tanggal kirim',
  tanggal_bongkar: 'Tanggal bongkar',
  kuantum: 'Kuantum',
  kuantum_bongkar: 'Kuantum bongkar',
  jarak_ke_makloon_km: 'Jarak ke makloon',
  ka1: 'KA1',
  ka2: 'KA2',
  ka3: 'KA3',
  hampa: 'Hampa',
  butir_hijau: 'Butir hijau',
}

const MAKLOON_FOTO_FIELDS = [
  { key: 'foto_surat_jalan_paraf', label: 'Surat jalan diparaf' },
  { key: 'foto_nota_timbang', label: 'Nota timbang' },
]

const JEMPUT_PANGAN_FOTO_FIELDS = [
  { key: 'foto_petani', label: 'Foto petani' },
  { key: 'foto_gabah', label: 'Foto gabah' },
  { key: 'foto_serah_terima', label: 'Foto serah terima' },
  { key: 'foto_kwitansi', label: 'Foto kwitansi' },
  { key: 'foto_surat_pernyataan', label: 'Foto surat pernyataan' },
  { key: 'foto_surat_jalan', label: 'Foto surat jalan' },
]

const MAKLOON_MPP_FOTO_FIELDS = [
  { key: 'foto_petani', label: 'Foto petani' },
  { key: 'foto_gabah', label: 'Foto gabah' },
  { key: 'foto_serah_terima', label: 'Foto serah terima' },
  { key: 'foto_pembayaran', label: 'Foto pembayaran' },
  { key: 'foto_surat_pernyataan', label: 'Foto surat pernyataan' },
  { key: 'foto_surat_jalan', label: 'Foto surat jalan' },
  { key: 'foto_nota_timbang', label: 'Foto nota timbang' },
]

const UB_FOTO_FIELDS = [{ key: 'foto_lhpk_hpk', label: 'Foto LHPK/HPK' }]

function photoFieldsFor(stageId: string, skema: 'TJP' | 'MPP') {
  if (stageId === 'jemput_pangan') return JEMPUT_PANGAN_FOTO_FIELDS
  if (stageId === 'makloon') return skema === 'MPP' ? MAKLOON_MPP_FOTO_FIELDS : MAKLOON_FOTO_FIELDS
  if (stageId === 'ub_jastasma') return UB_FOTO_FIELDS
  return []
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value).toLocaleDateString('id-ID')
  return String(value)
}

function labelOf(key: string) {
  return FIELD_LABELS[key] ?? key.replaceAll('_', ' ')
}

function stagesFor(skema: 'TJP' | 'MPP') {
  return skema === 'MPP' ? STAGES.filter((stage) => stage.id !== 'jemput_pangan') : STAGES
}

export default function TransaksiDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [catatan, setCatatan] = useState('')
  const [rejectingStage, setRejectingStage] = useState<string | null>(null)

  const [makloonForm, setMakloonForm] = useState({ tanggal_bongkar: '', kuantum_bongkar: '' })
  const [fotosMakloon, setFotosMakloon] = useState<Record<string, File | null>>({})
  const [progressMakloon, setProgressMakloon] = useState<Record<string, number>>({})
  const [fotoMakloonGagal, setFotoMakloonGagal] = useState<string[]>([])

  const [ubForm, setUbForm] = useState({ ka1: '', ka2: '', ka3: '', hampa: '', butir_hijau: '' })
  const [fotosUb, setFotosUb] = useState<Record<string, File | null>>({})
  const [progressUb, setProgressUb] = useState<Record<string, number>>({})
  const [fotoUbGagal, setFotoUbGagal] = useState<string[]>([])

  const { data: transaksi, isLoading } = useQuery({
    queryKey: ['transaksi', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: TransaksiDetail }>(`/api/transaksi/${encodeURIComponent(id!)}`)
      return data.data
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
    queryClient.invalidateQueries({ queryKey: ['transaksi', id] })
  }

  const terima = useMutation({
    mutationFn: () => api.post(`/api/transaksi/${encodeURIComponent(id!)}/terima`),
    onSuccess: () => {
      setRejectingStage(null)
      setCatatan('')
      invalidate()
    },
  })

  const tolak = useMutation({
    mutationFn: () => api.post(`/api/transaksi/${encodeURIComponent(id!)}/tolak`, { catatan }),
    onSuccess: () => {
      setRejectingStage(null)
      setCatatan('')
      invalidate()
    },
  })

  const simpanMakloon = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/makloon`, {
        tanggal_bongkar: makloonForm.tanggal_bongkar,
        kuantum_bongkar: Number(makloonForm.kuantum_bongkar),
      })
      const { gagal } = await uploadSemuaFoto(id!, fotosMakloon, (jenisFoto, percent) => setProgressMakloon((prev) => ({ ...prev, [jenisFoto]: percent })))
      return { gagal }
    },
    onSuccess: ({ gagal }) => {
      setFotoMakloonGagal(gagal)
      invalidate()
    },
  })

  const simpanUb = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/ub-jastasma`, {
        ka1: Number(ubForm.ka1),
        ka2: Number(ubForm.ka2),
        ka3: Number(ubForm.ka3),
        hampa: Number(ubForm.hampa),
        butir_hijau: Number(ubForm.butir_hijau),
      })
      const { gagal } = await uploadSemuaFoto(id!, fotosUb, (jenisFoto, percent) => setProgressUb((prev) => ({ ...prev, [jenisFoto]: percent })))
      return { gagal }
    },
    onSuccess: ({ gagal }) => {
      setFotoUbGagal(gagal)
      invalidate()
    },
  })

  if (isLoading || !transaksi) return <div className="page-shell">Memuat...</div>

  const role = user?.role.nama_role
  const activeStages = stagesFor(transaksi.skema)
  const currentIndex = activeStages.findIndex((stage) => stage.id === transaksi.current_stage)
  const pendingData = activeStages
    .flatMap((stage) => stage.dataKeys.map((key) => ({ stageId: stage.id, data: transaksi[key] as StageData | null })))
    .find((item) => item.data?.status === 'menunggu_review') ?? null
  const canAct = role === transaksi.current_stage || role === 'admin'
  const canFillMakloon = canAct && !pendingData && transaksi.current_stage === 'makloon' && transaksi.skema === 'TJP'
  const canFillUb = canAct && !pendingData && transaksi.current_stage === 'ub_jastasma'

  const makloonError = (simpanMakloon.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const ubError = (simpanUb.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const actionError = ((terima.error || tolak.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-[46rem]">
        <header className="page-header">
          <div>
            <h1 className="page-title">{transaksi.id_transaksi}</h1>
            <p className="page-subtitle">Alur {transaksi.skema === 'TJP' ? 'TJP: Jemput Pangan ke Makloon lalu UB Jastasma' : 'MPP: Makloon langsung ke UB Jastasma'} - dibuat {formatDateTime(transaksi.created_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2"><span className="badge">Skema {transaksi.skema}</span><Link to="/dashboard" className="btn btn-ghost">Dashboard</Link></div>
        </header>

        <div className="panel p-4 sm:p-6">
          <div className="mb-5 rounded-lg border border-border bg-primary-tint p-4">
            <div className="section-title">Tahap aktif: {STAGES.find((stage) => stage.id === transaksi.current_stage)?.label ?? transaksi.current_stage}</div>
            <p className="page-subtitle">Setiap tahap mengisi data, tahap berikutnya mengecek dengan aksi Terima atau Tolak. Setelah UB Jastasma diterima, alur lanjut ke halaman PO Pengadaan.</p>
          </div>

          {actionError && <div className="alert-danger mb-4">{actionError}</div>}

          <ol className="relative space-y-3 before:absolute before:left-3 before:top-4 before:h-[calc(100%-2rem)] before:w-px before:bg-border">
            {activeStages.map((stage, index) => {
              const data = stage.dataKeys.map((key) => transaksi[key] as StageData | null).find(Boolean) ?? null
              const isComplete = !!data && data.status === 'diterima'
              const isPendingReview = !!data && data.status === 'menunggu_review'
              const isRejected = !!data && data.status === 'ditolak'
              const isCurrent = transaksi.current_stage === stage.id || isPendingReview || (stage.id === pendingData?.stageId)
              const isFuture = currentIndex >= 0 && index > currentIndex && !data
              const canReviewThis = canAct && isPendingReview && stage.id === pendingData?.stageId
              const showMakloonForm = stage.id === 'makloon' && canFillMakloon
              const showUbForm = stage.id === 'ub_jastasma' && canFillUb
              const canOpenPoPage = canAct && stage.id === transaksi.current_stage && !!stage.actionPath && !pendingData

              return (
                <li key={stage.id} className="relative pl-10">
                  <span className={`absolute left-0 top-1 grid h-6 w-6 place-items-center rounded-full border text-xs font-bold ${isComplete ? 'border-primary bg-primary text-white' : isCurrent ? 'border-primary bg-white text-primary' : 'border-border bg-white text-gray-300'}`}>{isComplete ? '✓' : isCurrent ? '•' : ''}</span>
                  <section className={`rounded-lg p-4 ${isCurrent ? 'border border-primary bg-white shadow-sm' : isFuture ? 'bg-white/50 text-gray-300' : 'bg-surface'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="section-title">{stage.label}{isCurrent && !isPendingReview && !showMakloonForm && !showUbForm ? ' - sedang berjalan' : ''}</h2>
                        <p className="mt-1 text-xs text-gray-500">{isComplete ? `Diterima oleh ${stage.owner}` : isPendingReview ? `Menunggu dicek oleh ${STAGES.find((s) => s.id === transaksi.current_stage)?.owner ?? transaksi.current_stage}` : showMakloonForm || showUbForm ? 'Giliran Anda mengisi data tahap ini' : isFuture ? 'Menunggu tahap sebelumnya' : stage.helper}</p>
                      </div>
                      {isCurrent && <span className="badge">{isPendingReview ? 'Menunggu review' : 'Giliran Anda'}</span>}
                    </div>

                    {data && !showMakloonForm && !showUbForm && <StageReadOnly data={data} collapsed={!isCurrent} />}
                    {data && <FotoLinks transaksiId={transaksi.id_transaksi} fields={photoFieldsFor(stage.id, transaksi.skema)} />}
                    {isRejected && <div className="alert-danger mt-4">Tahap ini ditolak. Perbaiki data pada role terkait lalu kirim ulang.</div>}
                    {showMakloonForm && <MakloonTjpForm form={makloonForm} setForm={setMakloonForm} mutation={simpanMakloon} error={makloonError} fotos={fotosMakloon} setFotos={setFotosMakloon} progress={progressMakloon} fotoGagal={fotoMakloonGagal} />}
                    {showUbForm && <UbForm form={ubForm} setForm={setUbForm} mutation={simpanUb} error={ubError} fotos={fotosUb} setFotos={setFotosUb} progress={progressUb} fotoGagal={fotoUbGagal} />}

                    {canReviewThis && (
                      <ReviewActions
                        stageId={stage.id}
                        rejectingStage={rejectingStage}
                        setRejectingStage={setRejectingStage}
                        catatan={catatan}
                        setCatatan={setCatatan}
                        onAccept={() => terima.mutate()}
                        onReject={() => tolak.mutate()}
                        acceptPending={terima.isPending}
                        rejectPending={tolak.isPending}
                      />
                    )}

                    {canOpenPoPage && (
                      <div className="mt-4 flex justify-end border-t border-border pt-4">
                        <Link to={stage.actionPath!} className="btn btn-primary">{stage.actionLabel}</Link>
                      </div>
                    )}
                  </section>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

function FotoLinks({ transaksiId, fields }: { transaksiId: string; fields: { key: string; label: string }[] }) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (fields.length === 0) return null

  const openFoto = async (jenisFoto: string) => {
    setLoadingKey(jenisFoto)
    setError(null)
    try {
      const { data } = await api.get<{ url: string }>(`/api/transaksi/${encodeURIComponent(transaksiId)}/foto/${jenisFoto}`)
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      const message = (err as { response?: { status?: number; data?: { message?: string } } }).response?.data?.message
      setError(message ?? 'Foto belum tersedia atau tidak dapat diakses oleh role Anda.')
    } finally {
      setLoadingKey(null)
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="section-title mb-2">Foto tersimpan</div>
      {error && <div className="alert-warning mb-2">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {fields.map((field) => (
          <button key={field.key} type="button" className="btn btn-ghost border border-border bg-white" onClick={() => openFoto(field.key)} disabled={loadingKey === field.key}>
            {loadingKey === field.key ? 'Membuka...' : field.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function StageReadOnly({ data, collapsed }: { data: StageData; collapsed: boolean }) {
  const entries = Object.entries(data).filter(([key]) => !HIDDEN_FIELDS.has(key))
  return (
    <div className="mt-4 grid gap-2 text-sm">
      {(collapsed ? entries.slice(0, 4) : entries).map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4 border-t border-border/70 pt-2 first:border-t-0 first:pt-0">
          <span className="text-gray-500">{labelOf(key)}</span>
          <span className="text-right font-medium text-primary-dark">{formatValue(value)}</span>
        </div>
      ))}
      {collapsed && entries.length > 4 && <p className="text-right text-xs text-muted">+{entries.length - 4} field lain</p>}
    </div>
  )
}

function MakloonTjpForm({ form, setForm, mutation, error, fotos, setFotos, progress, fotoGagal }: any) {
  return (
    <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      {error && <div className="alert-danger">{error}</div>}
      {mutation.isSuccess && fotoGagal.length > 0 && <div className="alert-warning">Data tersimpan, tapi {fotoGagal.length} foto gagal terupload.</div>}
      <div className="form-grid">
        <Field label="Tanggal bongkar"><input required type="date" className="input" value={form.tanggal_bongkar} onChange={(e) => setForm((prev: any) => ({ ...prev, tanggal_bongkar: e.target.value }))} /></Field>
        <Field label="Kuantum bongkar (kg)"><input required type="number" step="0.01" min="0" className="input" placeholder="0" value={form.kuantum_bongkar} onChange={(e) => setForm((prev: any) => ({ ...prev, kuantum_bongkar: e.target.value }))} /></Field>
      </div>
      <DokumenGrid fields={MAKLOON_FOTO_FIELDS} fotos={fotos} setFotos={setFotos} progress={progress} fotoGagal={fotoGagal} />
      <div className="flex justify-end border-t border-border pt-4"><button type="submit" disabled={mutation.isPending || !form.tanggal_bongkar || !form.kuantum_bongkar} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim ke UB Jastasma'}</button></div>
    </form>
  )
}

function UbForm({ form, setForm, mutation, error, fotos, setFotos, progress, fotoGagal }: any) {
  const ready = form.ka1 && form.ka2 && form.ka3 && form.hampa && form.butir_hijau
  return (
    <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      {error && <div className="alert-danger">{error}</div>}
      {mutation.isSuccess && fotoGagal.length > 0 && <div className="alert-warning">Data tersimpan, tapi {fotoGagal.length} foto gagal terupload.</div>}
      <div className="form-grid">
        {(['ka1', 'ka2', 'ka3', 'hampa', 'butir_hijau'] as const).map((key) => <Field key={key} label={`${labelOf(key)} (%)`}><input required type="number" step="0.01" min="0" max="100" className="input" value={form[key]} onChange={(e) => setForm((prev: any) => ({ ...prev, [key]: e.target.value }))} /></Field>)}
      </div>
      <DokumenGrid fields={UB_FOTO_FIELDS} fotos={fotos} setFotos={setFotos} progress={progress} fotoGagal={fotoGagal} />
      <div className="flex justify-end border-t border-border pt-4"><button type="submit" disabled={mutation.isPending || !ready} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim ke Pengadaan'}</button></div>
    </form>
  )
}

function DokumenGrid({ fields, fotos, setFotos, progress, fotoGagal }: any) {
  return (
    <div>
      <div className="section-title mb-2">Dokumen</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(({ key, label }: { key: string; label: string }) => <FotoPicker key={key} label={label} file={fotos[key] ?? null} onChange={(file) => setFotos((prev: Record<string, File | null>) => ({ ...prev, [key]: file }))} progress={progress[key]} error={fotoGagal.includes(key) ? 'Gagal terupload' : undefined} />)}
      </div>
    </div>
  )
}

function ReviewActions({ stageId, rejectingStage, setRejectingStage, catatan, setCatatan, onAccept, onReject, acceptPending, rejectPending }: any) {
  if (rejectingStage === stageId) {
    return (
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <textarea className="input min-h-24" placeholder="Catatan penolakan" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setRejectingStage(null)} className="btn btn-ghost">Batal</button><button type="button" onClick={onReject} disabled={!catatan || rejectPending} className="btn btn-outline-danger">{rejectPending ? 'Mengirim...' : 'Kirim Penolakan'}</button></div>
      </div>
    )
  }
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-3 border-t border-border pt-4">
      <button type="button" onClick={() => setRejectingStage(stageId)} className="btn btn-outline-danger">Tolak</button>
      <button type="button" onClick={() => { if (confirm('Terima data tahap sebelumnya? Data akan dikunci dan alur lanjut.')) onAccept() }} disabled={acceptPending} className="btn btn-primary">{acceptPending ? 'Menyimpan...' : 'Terima & Lanjutkan'}</button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
