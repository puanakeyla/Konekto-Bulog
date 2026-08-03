import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useGudangOptions } from '../hooks/useGudang'
import {
  LABEL_TAHAP,
  URUTAN_TAHAP,
  usePengolahanDetail,
  usePengolahanMutations,
  type PengolahanItem,
  type StatusTahap,
  type TahapPengolahan,
} from '../hooks/usePengolahan'
import { pesanError } from '../lib/pesanError'

type FormNilai = Record<string, string>

const FIELD_GUDANG: { key: string; label: string; type?: string }[] = [
  { key: 'tanggal_masuk_gudang', label: 'Tanggal masuk gudang', type: 'date' },
  { key: 'kuantum_hgl', label: 'Kuantum HGL (kg, timbangan fisik)', type: 'number' },
  { key: 'plat_mobil', label: 'Plat mobil' },
  { key: 'supir', label: 'Supir' },
]

const FIELD_LHPK: { key: string; label: string; type?: string }[] = [
  { key: 'no_lhpk', label: 'Nomor LHPK' },
  { key: 'tanggal_lhpk', label: 'Tanggal LHPK', type: 'date' },
  { key: 'kuantum_stok_gudang', label: 'Kuantum stok gudang (kg)', type: 'number' },
  { key: 'kuantum_gabah_diolah', label: 'Kuantum gabah yang diolah (kg)', type: 'number' },
  { key: 'kuantum_beras_hgl', label: 'Kuantum beras HGL (kg)', type: 'number' },
  { key: 'kualitas', label: 'Kualitas' },
  { key: 'broken', label: 'Broken (%)', type: 'number' },
  { key: 'menir', label: 'Menir (%)', type: 'number' },
  { key: 'katul', label: 'Katul (%)', type: 'number' },
  { key: 'ka1', label: 'KA1 (%)', type: 'number' },
  { key: 'ka2', label: 'KA2 (%)', type: 'number' },
  { key: 'ka3', label: 'KA3 (%)', type: 'number' },
  { key: 'reject', label: 'Reject (%)', type: 'number' },
]

function StatusPill({ status }: { status?: StatusTahap | null }) {
  if (!status) return <span className="badge">Belum diisi</span>
  const map: Record<StatusTahap, string> = {
    draft: 'badge',
    menunggu_review: 'badge badge-warning',
    diterima: 'badge badge-success',
    ditolak: 'badge badge-danger',
  }
  const label: Record<StatusTahap, string> = {
    draft: 'Draft',
    menunggu_review: 'Menunggu review',
    diterima: 'Diterima',
    ditolak: 'Ditolak',
  }
  return <span className={map[status]}>{label[status]}</span>
}

export default function PengolahanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const { data: transaksi, isLoading } = usePengolahanDetail(id)
  const { data: gudangOptions } = useGudangOptions()
  const { simpanGudang, simpanLhpk, terima, tolak, unggahFoto } = usePengolahanMutations(id)

  const [form, setForm] = useState<FormNilai>({})
  const [gudangId, setGudangId] = useState('')
  const [catatanTolak, setCatatanTolak] = useState('')

  const tahapAktif = transaksi?.current_stage
  const dataTahap = tahapAktif === 'gudang' ? transaksi?.data_gudang : tahapAktif === 'ub_jastasma' ? transaksi?.data_lhpk : null

  // Muat ulang isian form tiap kali tahap aktif atau datanya berubah, supaya perbaikan setelah
  // ditolak dimulai dari nilai yang sudah tersimpan, bukan form kosong.
  useEffect(() => {
    if (!transaksi) return
    const sumber = transaksi.current_stage === 'gudang' ? transaksi.data_gudang : transaksi.data_lhpk
    if (!sumber) {
      setForm({})
      setGudangId('')
      return
    }
    const nilai: FormNilai = {}
    const fields = transaksi.current_stage === 'gudang' ? FIELD_GUDANG : FIELD_LHPK
    for (const field of fields) {
      const raw = (sumber as unknown as Record<string, unknown>)[field.key]
      nilai[field.key] = raw === null || raw === undefined ? '' : String(raw).slice(0, field.type === 'date' ? 10 : undefined)
    }
    setForm(nilai)
    setGudangId(
      transaksi.current_stage === 'gudang'
        ? String(transaksi.data_gudang?.gudang_id ?? '')
        : String(transaksi.data_lhpk?.gudang_tujuan_id ?? ''),
    )
  }, [transaksi])

  if (isLoading) return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-gray-400">Memuat...</div>
  if (!transaksi) return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-danger">Pengolahan tidak ditemukan.</div>

  const urutan = URUTAN_TAHAP[transaksi.skema]
  const indexAktif = urutan.indexOf(transaksi.current_stage)
  const bolehIsi = (tahap: TahapPengolahan) =>
    transaksi.current_stage === tahap && (role === tahap || role === 'admin') && transaksi.status_keseluruhan === 'berjalan'

  // Reviewer tahap ini adalah pemegang tahap berikutnya -- persis pola TJP/MPP.
  const tahapDireview = indexAktif > 0 ? urutan[indexAktif - 1] : null
  const dataDireview = tahapDireview === 'gudang' ? transaksi.data_gudang : tahapDireview === 'ub_jastasma' ? transaksi.data_lhpk : null
  const bolehReview =
    !!tahapDireview &&
    dataDireview?.status === 'menunggu_review' &&
    (role === transaksi.current_stage || role === 'admin')

  const kirimTahap = (kirim: boolean) => {
    const body: Record<string, unknown> = { ...form, kirim }
    for (const key of Object.keys(body)) {
      if (body[key] === '') body[key] = null
    }

    if (transaksi.current_stage === 'gudang') {
      body.gudang_id = gudangId ? Number(gudangId) : null
      simpanGudang.mutate(body, {
        onSuccess: () => toast.success(kirim ? 'Data Gudang dikirim.' : 'Draft disimpan.'),
        onError: (err) => toast.error(pesanError(err)),
      })
    } else {
      body.gudang_tujuan_id = gudangId ? Number(gudangId) : null
      simpanLhpk.mutate(body, {
        onSuccess: () => toast.success(kirim ? 'LHPK dikirim.' : 'Draft disimpan.'),
        onError: (err) => toast.error(pesanError(err)),
      })
    }
  }

  const fields = transaksi.current_stage === 'gudang' ? FIELD_GUDANG : FIELD_LHPK
  const jenisFoto = transaksi.current_stage === 'gudang' ? 'foto_notim' : 'foto_lhpk'

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link to="/pengolahan" className="text-sm font-medium text-primary hover:underline">&larr; Daftar pengolahan</Link>

      <div className="panel panel-pad mb-6 mt-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">Pengolahan {transaksi.skema}</p>
            <h1 className="section-title mt-1">{transaksi.id_pengolahan}</h1>
            <p className="page-subtitle">Makloon: {transaksi.makloon?.nama_maklon ?? '-'}</p>
          </div>
          <span className={`badge ${transaksi.status_keseluruhan === 'selesai' ? 'badge-success' : 'badge-warning'}`}>
            {transaksi.status_keseluruhan === 'selesai' ? 'Selesai' : `Tahap ${LABEL_TAHAP[transaksi.current_stage]}`}
          </span>
        </div>
      </div>

      {/* Timeline tahap */}
      <ol className="mb-6 space-y-3">
        {urutan.map((tahap, i) => {
          const data = tahap === 'gudang' ? transaksi.data_gudang : tahap === 'ub_jastasma' ? transaksi.data_lhpk : null
          const lewat = i < indexAktif
          const aktif = i === indexAktif

          return (
            <li key={tahap} className={`panel px-5 py-4 ${aktif ? 'border-accent/50' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                    lewat ? 'bg-success/15 text-success' : aktif ? 'bg-accent text-primary-dark' : 'bg-surface text-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="font-semibold text-primary-dark">{LABEL_TAHAP[tahap]}</span>
                </div>
                {tahap === 'operasi' || tahap === 'pengadaan'
                  ? <span className="badge">Dikerjakan di level MO</span>
                  : <StatusPill status={data?.status} />}
              </div>

              {data?.status === 'ditolak' && data.catatan_penolakan && (
                <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                  Ditolak: {data.catatan_penolakan}
                </p>
              )}
            </li>
          )
        })}
      </ol>

      {/* MO terkait, kalau sudah digabung */}
      {transaksi.mo_detail?.mo && (
        <div className="panel panel-pad mb-6">
          <h2 className="section-title">MO terkait</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div><dt className="text-muted">Nomor MO</dt><dd className="font-semibold text-primary-dark">{transaksi.mo_detail.mo.no_mo}</dd></div>
            <div><dt className="text-muted">Nomor OUT</dt><dd className="font-semibold text-primary-dark">{transaksi.mo_detail.mo.no_out ?? '-'}</dd></div>
            <div><dt className="text-muted">Tanggal OUT</dt><dd className="font-semibold text-primary-dark">{transaksi.mo_detail.mo.tanggal_out ?? '-'}</dd></div>
          </dl>
          <Link to="/mo" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">Buka daftar MO &rarr;</Link>
        </div>
      )}

      {/* Panel review: tahap sebelumnya menunggu keputusan pemegang tahap ini */}
      {bolehReview && tahapDireview && (
        <section className="panel panel-pad mb-6 border-warning/40">
          <h2 className="section-title">Cek data {LABEL_TAHAP[tahapDireview]}</h2>
          <p className="page-subtitle">Terima kalau datanya sudah benar, atau tolak dengan catatan perbaikan.</p>

          <RingkasanData tahap={tahapDireview} transaksi={transaksi} />

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="catatan">Catatan penolakan</label>
              <input
                id="catatan"
                className="input"
                value={catatanTolak}
                onChange={(e) => setCatatanTolak(e.target.value)}
                placeholder="Wajib diisi kalau menolak"
              />
            </div>
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={tolak.isPending || !catatanTolak.trim()}
              onClick={() => tolak.mutate(catatanTolak, {
                onSuccess: () => { toast.success('Data ditolak.'); setCatatanTolak('') },
                onError: (err) => toast.error(pesanError(err)),
              })}
            >
              Tolak
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={terima.isPending}
              onClick={() => terima.mutate(undefined, {
                onSuccess: () => toast.success('Data diterima.'),
                onError: (err) => toast.error(pesanError(err)),
              })}
            >
              Terima
            </button>
          </div>
        </section>
      )}

      {/* Form pengisian tahap aktif */}
      {bolehIsi(transaksi.current_stage) && (transaksi.current_stage === 'gudang' || transaksi.current_stage === 'ub_jastasma') && (
        <section className="panel panel-pad">
          <h2 className="section-title">Isi data {LABEL_TAHAP[transaksi.current_stage]}</h2>
          {dataTahap?.status === 'ditolak' && (
            <p className="page-subtitle text-danger">Perbaiki bagian yang ditandai lalu kirim ulang.</p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="gudang">
                {transaksi.current_stage === 'gudang' ? 'Gudang (asal)' : 'Gudang tujuan'}
              </label>
              <select id="gudang" className="input" value={gudangId} onChange={(e) => setGudangId(e.target.value)}>
                <option value="">Pilih gudang...</option>
                {(gudangOptions ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.kode} — {item.nama}</option>
                ))}
              </select>
            </div>

            {fields.map((field) => (
              <div key={field.key}>
                <label className="label" htmlFor={field.key}>{field.label}</label>
                <input
                  id={field.key}
                  className="input"
                  type={field.type ?? 'text'}
                  step={field.type === 'number' ? '0.01' : undefined}
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  placeholder={field.key === 'no_lhpk' ? 'LHPK/00832/02/2026/ADA08001' : undefined}
                />
              </div>
            ))}
          </div>

          {transaksi.current_stage === 'ub_jastasma' && (
            <p className="mt-3 text-sm text-muted">
              Rendemen dihitung otomatis: beras HGL ÷ gabah diolah ={' '}
              <strong className="text-primary-dark">
                {form.kuantum_gabah_diolah && Number(form.kuantum_gabah_diolah) > 0
                  ? `${((Number(form.kuantum_beras_hgl || 0) / Number(form.kuantum_gabah_diolah)) * 100).toFixed(2)}%`
                  : '—'}
              </strong>
            </p>
          )}

          <div className="mt-4">
            <label className="label" htmlFor="foto">
              {transaksi.current_stage === 'gudang' ? 'Unggah Notim' : 'Unggah LHPK'}
            </label>
            <input
              id="foto"
              type="file"
              accept="image/jpeg,image/png"
              className="input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                unggahFoto.mutate({ jenisFoto, file }, {
                  onSuccess: () => toast.success('Foto terunggah.'),
                  onError: (err) => toast.error(pesanError(err)),
                })
              }}
            />
            <p className="page-subtitle mt-1">Simpan datanya lebih dulu sebelum mengunggah foto.</p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => kirimTahap(false)}>Simpan draft</button>
            <button type="button" className="btn btn-primary" onClick={() => kirimTahap(true)}>
              Kirim ke tahap berikutnya
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

/** Ringkasan singkat data satu tahap, untuk dibaca reviewer sebelum menekan Terima/Tolak. */
function RingkasanData({ tahap, transaksi }: { tahap: TahapPengolahan; transaksi: PengolahanItem }) {
  const isi: [string, string][] =
    tahap === 'gudang'
      ? [
          ['Gudang', transaksi.data_gudang?.gudang?.nama ?? '-'],
          ['Tanggal masuk', transaksi.data_gudang?.tanggal_masuk_gudang?.slice(0, 10) ?? '-'],
          ['Kuantum HGL', transaksi.data_gudang?.kuantum_hgl ?? '-'],
          ['Plat / Supir', `${transaksi.data_gudang?.plat_mobil ?? '-'} / ${transaksi.data_gudang?.supir ?? '-'}`],
        ]
      : [
          ['No. LHPK', transaksi.data_lhpk?.no_lhpk ?? '-'],
          ['Gudang tujuan', transaksi.data_lhpk?.gudang_tujuan?.nama ?? '-'],
          ['Gabah diolah', transaksi.data_lhpk?.kuantum_gabah_diolah ?? '-'],
          ['Beras HGL', transaksi.data_lhpk?.kuantum_beras_hgl ?? '-'],
          ['Rendemen', `${transaksi.data_lhpk?.rendemen ?? 0}%`],
        ]

  return (
    <dl className="mt-3 grid gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm sm:grid-cols-2">
      {isi.map(([label, nilai]) => (
        <div key={label}>
          <dt className="text-muted">{label}</dt>
          <dd className="font-semibold text-primary-dark">{nilai}</dd>
        </div>
      ))}
    </dl>
  )
}
