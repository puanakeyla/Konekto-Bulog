import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { useOperasiList, sudahIsiHasil, type PermintaanOperasi } from '../hooks/useOperasiList'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'

function formatNumber(value: string | number | null) {
  if (value === null || value === '') return '-'
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function OperasiPage() {
  const { data, isLoading } = useOperasiList()
  const items = data?.items ?? []

  const menunggu = items.filter((i) => i.status_out === 'menunggu_pengadaan')
  const dikembalikan = items.filter((i) => i.status_out === 'dikembalikan')
  const perluHasil = items.filter((i) => i.status_out === 'dikeluarkan' && !i.no_mo)
  const selesai = items.filter(sudahIsiHasil)
  const totalDiproses = perluHasil.reduce((sum, i) => sum + Number(i.gabah_diolah_kg || 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role Operasi"
        title="Operasi — Pengeluaran Stok"
        subtitle="Ajukan permintaan pengeluaran stok gabah ke Pengadaan. Setelah nomor OUT keluar, isi hasil produksi (MO, TM, HGL, dan turunannya)."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Menunggu Pengadaan</div><div className="stat-value">{menunggu.length}</div></div>
          <div className="stat-card"><div className="stat-label">Perlu isi hasil</div><div className="stat-value">{perluHasil.length}</div></div>
          <div className="stat-card"><div className="stat-label">Dikembalikan</div><div className="stat-value">{dikembalikan.length}</div></div>
          <div className="stat-card"><div className="stat-label">Gabah diproses (kg)</div><div className="stat-value">{formatNumber(totalDiproses)}</div></div>
        </div>

        <AjukanForm />

        {isLoading && <SkeletonPoCards />}

        {dikembalikan.length > 0 && (
          <Section title="Dikembalikan Pengadaan" desc="Perbaiki jumlah lalu ajukan ulang." count={dikembalikan.length} tone="danger">
            {dikembalikan.map((item) => <DikembalikanCard key={item.id} item={item} />)}
          </Section>
        )}

        {perluHasil.length > 0 && (
          <Section title="Nomor OUT Sudah Keluar" desc="Isi hasil produksi untuk batch ini." count={perluHasil.length} tone="accent">
            {perluHasil.map((item) => <HasilForm key={item.id} item={item} />)}
          </Section>
        )}

        <Section title="Menunggu Keputusan Pengadaan" desc="Permintaan terkirim, menunggu nomor OUT." count={menunggu.length}>
          {menunggu.length === 0 && !isLoading && (
            <div className="empty-state"><div className="empty-title">Tidak ada permintaan menunggu</div><p className="empty-copy">Ajukan pengeluaran stok di form atas.</p></div>
          )}
          {menunggu.map((item) => <RingkasCard key={item.id} item={item} badge="Menunggu Pengadaan" tone="warning" />)}
        </Section>

        {selesai.length > 0 && (
          <Section title="Riwayat Batch Selesai" desc="Hasil produksi sudah diisi." count={selesai.length}>
            {selesai.map((item) => <RingkasCard key={item.id} item={item} badge={item.data_gudang ? 'Diterima Gudang' : 'Menunggu Gudang'} tone="success" />)}
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, desc, count, tone, children }: { title: string; desc: string; count: number; tone?: 'accent' | 'danger' | 'success'; children: React.ReactNode }) {
  const badgeClass = tone === 'danger' ? 'badge badge-danger' : tone === 'accent' ? 'badge badge-warning' : 'badge'
  return (
    <section className="panel panel-pad">
      <div className="toolbar-card mb-4">
        <div><h2 className="section-title">{title}</h2><p className="page-subtitle">{desc}</p></div>
        <span className={badgeClass}>{count}</span>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

// Form utama: Operasi mengajukan jumlah gabah bebas (tidak terikat PO/IN).
function AjukanForm() {
  const queryClient = useQueryClient()
  const [jumlah, setJumlah] = useState('')
  const [confirm, setConfirm] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.post('/api/operasi', { gabah_diolah_kg: Number(jumlah) }),
    onSuccess: () => {
      setConfirm(false)
      setJumlah('')
      queryClient.invalidateQueries({ queryKey: ['operasi-list'] })
      toast.success('Permintaan pengeluaran stok terkirim ke Pengadaan.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengirim permintaan.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const valid = jumlah.trim() !== '' && Number(jumlah) > 0

  return (
    <form className="panel overflow-hidden" onSubmit={(e) => { e.preventDefault(); setConfirm(true) }}>
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-lg font-bold text-white shadow-sm shadow-primary/20">+</span>
          <div>
            <h2 className="section-title">Ajukan Pengeluaran Stok</h2>
            <p className="mt-0.5 text-xs text-slate-500">Isi jumlah gabah yang ingin diolah. Bebas, tidak terikat nomor IN.</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-5">
        {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
        <label className="block max-w-sm">
          <span className="label">Gabah diolah (kg)</span>
          <input required type="number" step="0.01" min="0.01" className="input" placeholder="Contoh: 15000" value={jumlah} onChange={(e) => setJumlah(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-col gap-3 bg-primary-tint/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Permintaan dikirim ke Pengadaan untuk dikeluarkan atau dikembalikan.</p>
        <button type="submit" disabled={!valid || mutation.isPending} className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-primary-dark shadow-sm transition-all hover:bg-primary hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60">
          {mutation.isPending ? 'Mengirim...' : 'Kirim Permintaan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Kirim permintaan pengeluaran stok?"
        description={<>Permintaan pengeluaran <strong>{formatNumber(jumlah)} kg</strong> gabah akan dikirim ke <strong>Pengadaan</strong>. Lanjutkan?</>}
        confirmLabel="Kirim Permintaan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirm(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

function CardHeader({ item, badge, tone }: { item: PermintaanOperasi; badge: string; tone: 'warning' | 'success' | 'danger' | 'accent' }) {
  const cls = tone === 'success' ? 'badge badge-success' : tone === 'danger' ? 'badge badge-danger' : 'badge badge-warning'
  return (
    <div className="po-card-header">
      <div>
        <div className="po-title">{formatNumber(item.gabah_diolah_kg)} kg gabah{item.no_out ? ` — No. OUT ${item.no_out}` : ''}</div>
        <div className="po-meta">Diajukan {formatDateTime(item.created_at)}{item.creator ? ` oleh ${item.creator.username}` : ''}</div>
      </div>
      <span className={cls}>{badge}</span>
    </div>
  )
}

function RingkasCard({ item, badge, tone }: { item: PermintaanOperasi; badge: string; tone: 'warning' | 'success' }) {
  return (
    <div className="po-card">
      <CardHeader item={item} badge={badge} tone={tone} />
      {item.no_mo && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Info label="No. MO" value={item.no_mo} />
          <Info label="No. TM" value={item.no_tm} />
          <Info label="HGL (kg)" value={formatNumber(item.hgl_kg)} />
          <Info label="Rendemen" value={item.rendemen_persen ? `${item.rendemen_persen}%` : '-'} />
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-t border-border/70 pt-2">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-primary-dark">{value ?? '-'}</span>
    </div>
  )
}

// Permintaan dikembalikan Pengadaan -> Operasi perbaiki jumlah lalu ajukan ulang.
function DikembalikanCard({ item }: { item: PermintaanOperasi }) {
  const queryClient = useQueryClient()
  const [jumlah, setJumlah] = useState(String(Number(item.gabah_diolah_kg)))

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/operasi/${item.id}`, { gabah_diolah_kg: Number(jumlah) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operasi-list'] })
      toast.success('Permintaan diajukan ulang ke Pengadaan.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengajukan ulang.')),
  })

  return (
    <form className="po-card" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <CardHeader item={item} badge="Dikembalikan" tone="danger" />
      {item.catatan_pengembalian && <div className="alert-danger mb-3">Catatan Pengadaan: {item.catatan_pengembalian}</div>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-52">
          <span className="label">Gabah diolah (kg)</span>
          <input required type="number" step="0.01" min="0.01" className="input" value={jumlah} onChange={(e) => setJumlah(e.target.value)} />
        </label>
        <button type="submit" disabled={mutation.isPending || Number(jumlah) <= 0} className="btn btn-primary">
          {mutation.isPending ? 'Mengirim...' : 'Ajukan Ulang'}
        </button>
      </div>
    </form>
  )
}

// Setelah No. OUT keluar: Operasi mengisi hasil produksi. Rendemen dihitung otomatis backend.
function HasilForm({ item }: { item: PermintaanOperasi }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ no_mo: '', no_tm: '', hgl_kg: '', broken_kg: '', menir_kg: '', katul_kg: '' })
  const [confirm, setConfirm] = useState(false)

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))
  const num = (v: string) => (v.trim() !== '' ? Number(v) : undefined)

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/operasi/${item.id}/hasil`, {
        no_mo: form.no_mo,
        no_tm: form.no_tm,
        hgl_kg: num(form.hgl_kg),
        broken_kg: num(form.broken_kg),
        menir_kg: num(form.menir_kg),
        katul_kg: num(form.katul_kg),
      }),
    onSuccess: () => {
      setConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['operasi-list'] })
      toast.success('Hasil produksi tersimpan, batch siap diterima Gudang.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan hasil produksi.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const valid = form.no_mo.trim() && form.no_tm.trim()
  const gabah = Number(item.gabah_diolah_kg || 0)
  const rendemenPreview = form.hgl_kg.trim() !== '' && gabah > 0 ? ((Number(form.hgl_kg) / gabah) * 100).toFixed(2) : null

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirm(true) }}>
      <CardHeader item={item} badge="Siap diproses" tone="accent" />
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="No. MO"><input required className="input" value={form.no_mo} onChange={(e) => set('no_mo', e.target.value)} /></Field>
        <Field label="No. TM"><input required className="input" value={form.no_tm} onChange={(e) => set('no_tm', e.target.value)} /></Field>
        <Field label="HGL (kg)"><input type="number" step="0.01" min="0" className="input" value={form.hgl_kg} onChange={(e) => set('hgl_kg', e.target.value)} /></Field>
        <Field label="Broken (kg)"><input type="number" step="0.01" min="0" className="input" value={form.broken_kg} onChange={(e) => set('broken_kg', e.target.value)} /></Field>
        <Field label="Menir (kg)"><input type="number" step="0.01" min="0" className="input" value={form.menir_kg} onChange={(e) => set('menir_kg', e.target.value)} /></Field>
        <Field label="Katul (kg)"><input type="number" step="0.01" min="0" className="input" value={form.katul_kg} onChange={(e) => set('katul_kg', e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-slate-500">
          Rendemen otomatis = HGL ÷ {formatNumber(item.gabah_diolah_kg)} kg
          {rendemenPreview && <span className="ml-1 font-bold text-primary">= {rendemenPreview}%</span>}
        </p>
        <button type="submit" disabled={!valid || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Simpan Hasil Produksi'}
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Simpan hasil produksi?"
        description={<>Hasil produksi batch <strong>No. OUT {item.no_out}</strong> akan disimpan dan diteruskan ke <strong>Gudang</strong>. Lanjutkan?</>}
        confirmLabel="Simpan Hasil"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirm(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
