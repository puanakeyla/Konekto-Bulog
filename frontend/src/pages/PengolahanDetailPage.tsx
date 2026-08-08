import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useFotoPengolahanUrl } from '../hooks/useFotoTransaksi'
import {
  LABEL_TAHAP,
  URUTAN_TAHAP,
  useKandidatMo,
  tahapTerlihat,
  usePengolahanDetail,
  usePengolahanMutations,
  type DataGudang,
  type DataLhpk,
  type PengolahanItem,
  type StatusTahap,
  type TahapPengolahan,
} from '../hooks/usePengolahan'
import { bukaTabBaru } from '../lib/bukaTabBaru'
import { labelFoto } from '../lib/fotoDokumen'
import { pesanError } from '../lib/pesanError'
import { apiErrorMessage } from '../lib/apiError'
import AngkaInput from '../components/AngkaInput'
import ConfirmDialog from '../components/ConfirmDialog'
import FotoPicker from '../components/FotoPicker'
import MakloonCombobox from '../components/MakloonCombobox'
import ModalPortal from '../components/ModalPortal'
import { useMoDetail } from '../hooks/useMo'

type FormNilai = Record<string, string>
/** `ribuan` = kuantum (kg) yang selalu bulat -- dirender AngkaInput agar berpemisah ribuan. */
type FieldDef = { key: string; label: string; type?: string; ribuan?: boolean }

const FIELD_GUDANG: FieldDef[] = [
  { key: 'tanggal_masuk_gudang', label: 'Tanggal masuk gudang', type: 'date' },
  { key: 'kuantum_hgl', label: 'Kuantum HGL (kg)', ribuan: true },
  { key: 'plat_mobil', label: 'Plat mobil' },
  { key: 'supir', label: 'Supir' },
]

const FIELD_LHPK: FieldDef[] = [
  { key: 'no_lhpk', label: 'Nomor LHPK' },
  { key: 'tanggal_lhpk', label: 'Tanggal LHPK', type: 'date' },
  { key: 'kuantum_gabah_diolah', label: 'Kuantum gabah yang sudah diolah (kg)', ribuan: true },
  { key: 'kuantum_beras_hgl', label: 'Kuantum beras HGL (kg)', ribuan: true },
  { key: 'kualitas', label: 'Kualitas' },
  // Angka mutu BUKAN persen -- nilainya ditulis apa adanya (mis. 6,5 / 18,5). Hanya rendemen
  // yang benar-benar persen karena ia rasio beras HGL terhadap gabah diolah.
  { key: 'broken', label: 'Broken', type: 'number' },
  { key: 'menir', label: 'Menir', type: 'number' },
  { key: 'katul', label: 'Katul', type: 'number' },
  { key: 'ka1', label: 'KA1', type: 'number' },
  { key: 'ka2', label: 'KA2', type: 'number' },
  { key: 'ka3', label: 'KA3', type: 'number' },
  { key: 'reject', label: 'Reject', type: 'number' },
]

const STATUS_LABEL: Record<StatusTahap, string> = {
  draft: 'Draft',
  menunggu_review: 'Menunggu review',
  diterima: 'Diterima',
  ditolak: 'Ditolak',
}

function StatusPill({ status }: { status?: StatusTahap | null }) {
  if (!status) return <span className="badge">Belum diisi</span>
  const map: Record<StatusTahap, string> = {
    draft: 'badge',
    menunggu_review: 'badge badge-warning',
    diterima: 'badge badge-success',
    ditolak: 'badge badge-danger',
  }
  return <span className={map[status]}>{STATUS_LABEL[status]}</span>
}

function fmt(value: string | number | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '-'
  const angka = Number(value)
  if (Number.isNaN(angka)) return String(value)
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(angka)}${suffix}`
}

function labelReviewMo(status: string | null | undefined) {
  const map: Record<string, string> = {
    draft: 'Diproses di Operasi',
    menunggu_review: 'Menunggu review Pengadaan',
    diterima: 'Disetujui Pengadaan',
    ditolak: 'Ditolak Pengadaan',
  }
  return status ? map[status] ?? status.replaceAll('_', ' ') : '-'
}

function labelPengadaanMo(status: string | null | undefined, selesai: boolean) {
  if (selesai) return 'Selesai'
  if (status === 'diterima') return 'Diproses di Pengadaan'
  if (status === 'menunggu_review') return 'Menunggu review Pengadaan'
  if (status === 'ditolak') return 'MO ditolak'
  return '-'
}

function tanggal(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '-'
}

function nilaiField(field: FieldDef, form: FormNilai): string {
  return form[field.key] ?? ''
}

function dataUntukTahap(transaksi: PengolahanItem, tahap: TahapPengolahan): DataGudang | DataLhpk | null {
  if (tahap === 'gudang') return transaksi.data_gudang ?? null
  if (tahap === 'ub_jastasma') return transaksi.data_lhpk ?? null
  return null
}

export default function PengolahanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Simpan/Kirim/Tolak = pekerjaan selesai untuk baris ini; balik ke daftar supaya baris
  // berikutnya langsung terlihat. Terima sengaja TIDAK ikut: setelah menerima, giliran mengisi
  // tahap sendiri ada di halaman yang sama.
  const kembaliKeDaftar = () => navigate('/pengolahan')
  const role = user?.role.nama_role ?? ''
  const { data: transaksi, isLoading, isError, error, refetch } = usePengolahanDetail(id)
  const { simpanGudang, simpanLhpk, terima, tolak, batalkan, unggahFoto } = usePengolahanMutations(id)
  // MO hanya boleh menggabungkan LHPK dari makloon YANG SAMA (MoGroupingService::validasiAnggota),
  // jadi kandidatnya disaring di server sejak awal -- bukan menarik semua lalu memfilter di layar.
  const bolehLihatKandidat = role === 'operasi' || role === 'admin'
  const { data: kandidatMo = [] } = useKandidatMo(transaksi?.makloon_user_id, bolehLihatKandidat)
  const operasiWorkspace = useMutation({
    mutationFn: async ({ selectedIds, noMo, noTmAda, noTmGudang }: { selectedIds: string[]; noMo: string; noTmAda: string; noTmGudang: string }) => {
      const { data } = await api.post('/api/mo/gabungkan', {
        pengolahan_ids: selectedIds,
        no_mo: noMo,
        no_tm_ada: noTmAda || null,
        no_tm_gudang: noTmGudang || null,
      })
      await api.post(`/api/mo/${data.data.id}/kirim`)
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pengolahan-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-kandidat-mo'] })
      queryClient.invalidateQueries({ queryKey: ['mo-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-detail'] })
      toast.success('MO dibuat dan dikirim ke Pengadaan.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menggabungkan LHPK menjadi MO.')),
  })
  const kirimMoPengadaan = useMutation({
    mutationFn: async (moId: number) => (await api.post(`/api/mo/${moId}/kirim`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pengolahan-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-kandidat-mo'] })
      queryClient.invalidateQueries({ queryKey: ['mo-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-detail'] })
      toast.success('MO dikirim ke Pengadaan.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengirim MO ke Pengadaan.')),
  })
  const terimaMoPengadaan = useMutation({
    mutationFn: async (moId: number) => (await api.post(`/api/mo/${moId}/terima`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pengolahan-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-detail'] })
      toast.success('MO disetujui Pengadaan. Lanjut isi Nomor OUT.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyetujui MO.')),
  })
  const tolakMoPengadaan = useMutation({
    mutationFn: async ({ moId, catatan }: { moId: number; catatan: string }) => (await api.post(`/api/mo/${moId}/tolak`, { catatan })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pengolahan-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-detail'] })
      toast.success('MO ditolak dan dikembalikan ke Operasi.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menolak MO.')),
  })
  const isiOutMo = useMutation({
    mutationFn: async ({ moId, noOut, tanggalOut }: { moId: number; noOut: string; tanggalOut: string }) =>
      (await api.patch(`/api/mo/${moId}/out`, { no_out: noOut, tanggal_out: tanggalOut })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pengolahan-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-rekap'] })
      queryClient.invalidateQueries({ queryKey: ['mo-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-detail'] })
      toast.success('Nomor OUT diterbitkan; pengolahan selesai.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menerbitkan Nomor OUT.')),
  })

  const [form, setForm] = useState<FormNilai>({})
  const [makloonId, setMakloonId] = useState<number | null>(null)
  const [fotoPilihan, setFotoPilihan] = useState<Partial<Record<TahapPengolahan, File>>>({})
  const [tahapTerbuka, setTahapTerbuka] = useState<Set<TahapPengolahan>>(new Set())

  const toggleTahap = (tahap: TahapPengolahan) =>
    setTahapTerbuka((prev) => {
      const next = new Set(prev)
      if (next.has(tahap)) next.delete(tahap)
      else next.add(tahap)
      return next
    })

  // Tahap yang sedang direview dibuka otomatis -- sisanya tertutup, biar reviewer tidak
  // harus klik dulu sebelum bisa Terima/Tolak.
  useEffect(() => {
    if (!transaksi) return
    const urutan = URUTAN_TAHAP[transaksi.skema]
    const sebelum = urutan[urutan.indexOf(transaksi.current_stage) - 1]
    if (!sebelum || dataUntukTahap(transaksi, sebelum)?.status !== 'menunggu_review') return
    setTahapTerbuka((prev) => (prev.has(sebelum) ? prev : new Set(prev).add(sebelum)))
  }, [transaksi])

  useEffect(() => {
    if (!transaksi) return
    setMakloonId(transaksi.makloon_user_id)

    const sumber = transaksi.current_stage === 'gudang' ? transaksi.data_gudang : transaksi.data_lhpk
    if (!sumber) {
      setForm({})
      return
    }

    const fields = transaksi.current_stage === 'gudang' ? FIELD_GUDANG : FIELD_LHPK
    const nilai: FormNilai = {}
    for (const field of fields) {
      const raw = (sumber as unknown as Record<string, unknown>)[field.key]
      nilai[field.key] = raw === null || raw === undefined ? '' : String(raw).slice(0, field.type === 'date' ? 10 : undefined)
    }

    setForm(nilai)
  }, [transaksi])

  if (isLoading) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-gray-400">Memuat...</div>
  if (isError) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="panel panel-pad">
          <h1 className="section-title">Gagal memuat pengolahan</h1>
          <p className="page-subtitle mt-2">{pesanError(error)}</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => refetch()}>
            Coba lagi
          </button>
        </div>
      </div>
    )
  }
  if (!transaksi) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-danger">Pengolahan tidak ditemukan.</div>

  // Belum ada satu pun data tahap tersimpan -> belum jadi transaksi (server memakai aturan yang
  // sama lewat scopeSudahDiisi, jadi baris ini juga belum muncul di daftar mana pun).
  const masihKosong = !transaksi.data_gudang && !transaksi.data_lhpk

  const batalkanPengolahan = () =>
    batalkan.mutate(undefined, {
      onSuccess: () => navigate('/pengolahan'),
      onError: (err) => toast.error(pesanError(err)),
    })

  const urutan = URUTAN_TAHAP[transaksi.skema]
  // Sama seperti kolom Rekap: tiap role hanya melihat ISI tahap sampai tahapnya sendiri, jadi
  // Gudang tidak membuka MO/OUT. Kartunya sendiri tetap dirender -- timeline harus tetap
  // menunjukkan rantai lengkapnya.
  const terlihat = tahapTerlihat(role, transaksi.skema)
  // Makloon ditetapkan pengisi tahap PERTAMA; tahap kedua mencocokkan saja (server ikut menjaga).
  const tahapPertama = urutan[0]
  const indexAktif = urutan.indexOf(transaksi.current_stage)
  const tahapDireview = indexAktif > 0 ? urutan[indexAktif - 1] : null
  const dataDireview = tahapDireview ? dataUntukTahap(transaksi, tahapDireview) : null
  // Selama data tahap sebelumnya masih menunggu dicek, tahap ini BELUM boleh diisi -- server
  // sudah menolaknya (PengolahanStageService::recordUntukDiisi), jadi menampilkan formnya hanya
  // memancing user mengetik sesuatu yang pasti gagal.
  const adaYangHarusDicek = dataDireview?.status === 'menunggu_review'
  const bolehIsi = (tahap: TahapPengolahan) =>
    transaksi.current_stage === tahap
    && (role === tahap || role === 'admin')
    && transaksi.status_keseluruhan === 'berjalan'
    && !adaYangHarusDicek

  const kirimTahap = async (kirim: boolean) => {
    const tahap = transaksi.current_stage
    const file = fotoPilihan[tahap]
    const jenisFoto = tahap === 'gudang' ? 'foto_notim' : 'foto_lhpk'
    const recordTahap = dataUntukTahap(transaksi, tahap)

    // Gudang & kuantum stok gudang tidak ikut dikirim: yang pertama sudah terkunci di header
    // transaksi, yang kedua dihitung server dari stok berjalan gudang itu.
    const bodyUntuk = (kirimTahap: boolean) => {
      const body: Record<string, unknown> = { ...form, kirim: kirimTahap }
      for (const key of Object.keys(body)) {
        if (body[key] === '') body[key] = null
      }

      if (tahap === tahapPertama) body.makloon_user_id = makloonId

      return body
    }

    const simpanTahap = (kirimTahap: boolean) =>
      tahap === 'gudang'
        ? simpanGudang.mutateAsync(bodyUntuk(kirimTahap))
        : simpanLhpk.mutateAsync(bodyUntuk(kirimTahap))

    try {
      if (!kirim) {
        await simpanTahap(false)
        if (file) {
          await unggahFoto.mutateAsync({ jenisFoto, file })
        }
      } else if (file) {
        if (!recordTahap) {
          await simpanTahap(false)
        }
        await unggahFoto.mutateAsync({ jenisFoto, file })
        await simpanTahap(true)
      } else {
        await simpanTahap(true)
      }

      if (file) {
        setFotoPilihan((prev) => ({ ...prev, [tahap]: undefined }))
      }

      toast.success(kirim ? 'Data dan dokumen dikirim.' : 'Draft dan dokumen disimpan.')
      kembaliKeDaftar()
    } catch (err) {
      toast.error(pesanError(err))
    }
  }

  const handleTolak = (catatan: string) => {
    tolak.mutate(catatan, {
      onSuccess: () => {
        toast.success('Data ditolak.')
        kembaliKeDaftar()
      },
      onError: (err) => toast.error(pesanError(err)),
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Selama belum ada satu pun data tersimpan, pengolahan ini belum jadi transaksi: keluar
          dari sini artinya membatalkannya, bukan menyimpannya sebagai baris kosong. */}
      {masihKosong ? (
        <button
          type="button"
          onClick={batalkanPengolahan}
          disabled={batalkan.isPending}
          className="text-sm font-medium text-danger hover:underline"
        >
          &larr; Batalkan &amp; kembali ke daftar
        </button>
      ) : (
        <Link to="/pengolahan" className="text-sm font-medium text-primary hover:underline">&larr; Daftar pengolahan</Link>
      )}

      <section className="panel panel-pad mb-6 mt-3">
        {masihKosong && (
          <p className="alert-warning mb-4">
            Belum ada data tersimpan. Pengolahan ini baru menjadi transaksi setelah Anda menekan
            <strong> Simpan draft</strong> atau <strong>Kirim</strong> — sebelum itu ia tidak muncul di daftar siapa pun.
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">Pengolahan alur {transaksi.skema}</p>
            <h1 className="section-title mt-1">{transaksi.id_pengolahan}</h1>
            <p className="page-subtitle">
              Gudang: <span className="font-semibold text-primary-dark">{transaksi.gudang?.nama ?? '-'}</span>
              {' · '}
              Makloon: <span className="font-semibold text-primary-dark">{transaksi.makloon?.nama_maklon ?? 'belum diisi'}</span>
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <span className="badge">{indexAktif + 1}/{urutan.length} tahap</span>
            <span className={`badge ${transaksi.status_keseluruhan === 'selesai' ? 'badge-success' : 'badge-warning'}`}>
              {transaksi.status_keseluruhan === 'selesai' ? 'Selesai' : `Aktif: ${LABEL_TAHAP[transaksi.current_stage]}`}
            </span>
          </div>
        </div>
      </section>

      <ol className="relative ml-3 space-y-4 border-l border-border pl-6 sm:ml-5 sm:pl-8">
        {urutan.map((tahap, index) => {
          // SELURUH tahap tetap dirender supaya timeline menunjukkan ada berapa langkah dan
          // sisanya apa. Yang dibatasi hanya ISI kartu (lihat bolehLihatIsi di bawah).
          const data = dataUntukTahap(transaksi, tahap)
          const aktif = index === indexAktif && transaksi.status_keseluruhan === 'berjalan'
          const lewat = index < indexAktif || transaksi.status_keseluruhan === 'selesai'
          const menunggu = index > indexAktif && transaksi.status_keseluruhan === 'berjalan'
          const terbuka = tahapTerbuka.has(tahap)
          const tahapBisaDiisi = bolehIsi(tahap) && (tahap === 'gudang' || tahap === 'ub_jastasma')
          // Panel Terima/Tolak menempel di kartu tahap PENGIRIM, bukan kartu tahap saya: yang
          // sedang dinilai adalah datanya, jadi tombolnya harus duduk di sebelah datanya.
          const tampilReview = tahap === tahapDireview && adaYangHarusDicek && (role === transaksi.current_stage || role === 'admin')
          const tampilOperasiWorkspace = tahap === 'operasi' && aktif && dataDireview?.status === 'diterima'
          const mo = transaksi.mo_detail?.mo
          const tampilReviewMoOperasi = tahap === 'operasi' && transaksi.current_stage === 'pengadaan' && mo?.review_status === 'menunggu_review' && (role === 'pengadaan' || role === 'admin')
          // Tahap yang datanya belum ada tidak punya detail untuk dilihat -- begitu tahap sebelumnya
          // mengirim, kartu tahap berikutnya jadi aktif dan tombolnya dulu tetap muncul, membuka
          // tabel berisi "-" semua. Tombolnya baru ada setelah tahap ini benar-benar terisi.
          const adaIsi = tahap === 'gudang' || tahap === 'ub_jastasma' ? !!data : !!mo
          // Detail hanya sampai tahap milik role ini -- Gudang tidak membuka isi MO/OUT.
          const bolehLihatIsi = terlihat.includes(tahap)
          // Tahap Pengadaan baru terbuka setelah MO-nya DISETUJUI. Selama masih direview, satu-
          // satunya pekerjaan Pengadaan adalah menilai MO di kartu Operasi; membuka form OUT di
          // bawahnya cuma menawarkan langkah yang belum boleh dikerjakan.
          const pengadaanTerkunci = tahap === 'pengadaan' && mo?.review_status !== 'diterima'

          return (
            <li key={tahap} className="relative">
              <span className={`absolute -left-[2.1rem] top-5 grid h-6 w-6 place-items-center rounded-full border-2 text-[0.65rem] font-bold sm:-left-[2.6rem] ${
                lewat
                  ? 'border-success bg-success text-white'
                  : aktif
                    ? 'border-accent bg-warning-bg text-warning'
                    : 'border-border bg-white text-muted'
              }`}>
                {lewat ? (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M4 10.5l4 4 8-9" />
                  </svg>
                ) : index + 1}
              </span>

              <section className={`panel overflow-hidden ${aktif ? 'border-accent/70' : ''} ${menunggu ? 'opacity-80' : ''}`}>
                <div className={`bg-white px-4 py-3 sm:px-5 ${menunggu ? '' : 'border-b border-border'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-primary-dark">{LABEL_TAHAP[tahap]}</h2>
                      <p className="page-subtitle">{deskripsiTahap(tahap, transaksi, index, indexAktif)}</p>
                    </div>
                    <StatusTahapView tahap={tahap} data={data} transaksi={transaksi} aktif={aktif} />
                  </div>
                </div>

                {!menunggu && !bolehLihatIsi && (
                  <div className="px-4 py-3 text-xs text-muted sm:px-5">
                    Detail tahap ini di luar jangkauan role Anda.
                  </div>
                )}

                {!menunggu && bolehLihatIsi && pengadaanTerkunci && (
                  <div className="px-4 py-3 text-xs text-muted sm:px-5">
                    Terbuka setelah MO disetujui lewat <strong>Terima &amp; Lanjutkan</strong> di kartu Operasi.
                  </div>
                )}

                {!menunggu && bolehLihatIsi && !pengadaanTerkunci && (
                <div className="px-4 py-4 sm:px-5">
                  {adaIsi ? (
                    <button
                      type="button"
                      onClick={() => toggleTahap(tahap)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {terbuka ? 'Sembunyikan detail' : 'Lihat detail'}
                    </button>
                  ) : (
                    <p className="text-xs text-muted">Belum ada data untuk tahap ini.</p>
                  )}

                  {terbuka && adaIsi && (
                    <div className="mt-3">
                      <TahapSummary tahap={tahap} transaksi={transaksi} />

                      {(tahap === 'gudang' || tahap === 'ub_jastasma') && (
                        <FotoPengolahan
                          id={transaksi.id_pengolahan}
                          jenisFoto={tahap === 'gudang' ? 'foto_notim' : 'foto_lhpk'}
                          enabled={!!data}
                        />
                      )}
                    </div>
                  )}

                  {data?.status === 'ditolak' && data.catatan_penolakan && (
                    <p className="alert-danger mt-4">Catatan penolakan: {data.catatan_penolakan}</p>
                  )}

                  {aktif && adaYangHarusDicek && tahapDireview && (role === transaksi.current_stage || role === 'admin') && (
                    <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
                      Cek dulu data {LABEL_TAHAP[tahapDireview]} di kartu di atas. Form tahap ini terbuka setelah data itu Anda terima.
                    </p>
                  )}

                  {tampilReview && tahapDireview && (
                    <ReviewPanel
                      tahap={tahapDireview}
                      transaksi={transaksi}
                      role={role}
                      onTolak={handleTolak}
                      onTerima={() => terima.mutate(undefined, {
                        onSuccess: () => toast.success('Data diterima.'),
                        onError: (err) => toast.error(pesanError(err)),
                      })}
                      isTolakPending={tolak.isPending}
                      isTerimaPending={terima.isPending}
                    />
                  )}

                  {tahapBisaDiisi && (
                    <FormTahap
                      tahap={tahap}
                      transaksi={transaksi}
                      form={form}
                      setForm={setForm}
                      makloonId={makloonId}
                      setMakloonId={setMakloonId}
                      bolehPilihMakloon={tahap === tahapPertama}
                      kirimTahap={kirimTahap}
                      fotoPilihan={fotoPilihan[tahap] ?? null}
                      setFotoPilihan={(file) => setFotoPilihan((prev) => ({ ...prev, [tahap]: file ?? undefined }))}
                      isSaving={simpanGudang.isPending || simpanLhpk.isPending || unggahFoto.isPending}
                    />
                  )}

                  {tampilOperasiWorkspace && (
                    <OperasiWorkspace
                      transaksi={transaksi}
                      role={role}
                      kandidat={kandidatMo}
                      onGabungkan={(payload) => operasiWorkspace.mutate(payload)}
                      isPending={operasiWorkspace.isPending}
                      onKirimMo={(moId) => kirimMoPengadaan.mutate(moId)}
                      isKirimPending={kirimMoPengadaan.isPending}
                    />
                  )}

                  {tampilReviewMoOperasi && (
                    <MoReviewActions
                      noMo={mo.no_mo}
                      moId={mo.id}
                      idPengolahan={transaksi.id_pengolahan}
                      role={role}
                      onTerima={() => terimaMoPengadaan.mutate(mo.id)}
                      onTolak={(catatan) => tolakMoPengadaan.mutate({ moId: mo.id, catatan })}
                      isTerimaPending={terimaMoPengadaan.isPending}
                      isTolakPending={tolakMoPengadaan.isPending}
                    />
                  )}

                  {tahap === 'pengadaan' && (
                    <PengadaanWorkspace
                      transaksi={transaksi}
                      role={role}
                      onIsiOut={(moId, noOut, tanggalOut) => isiOutMo.mutate({ moId, noOut, tanggalOut })}
                      isOutPending={isiOutMo.isPending}
                    />
                  )}
                </div>
                )}
              </section>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StatusTahapView({
  tahap,
  data,
  transaksi,
  aktif,
}: {
  tahap: TahapPengolahan
  data: DataGudang | DataLhpk | null
  transaksi: PengolahanItem
  aktif: boolean
}) {
  if (tahap === 'operasi') {
    const mo = transaksi.mo_detail?.mo
    if (!mo) return <span className={`badge ${aktif ? 'badge-warning' : ''}`}>Menunggu MO</span>
    return <span className={`badge ${mo.review_status === 'diterima' ? 'badge-success' : 'badge-warning'}`}>{labelReviewMo(mo.review_status)}</span>
  }
  if (tahap === 'pengadaan') {
    const mo = transaksi.mo_detail?.mo
    if (transaksi.status_keseluruhan === 'selesai') return <span className="badge badge-success">OUT terbit</span>
    if (mo?.review_status === 'menunggu_review') return <span className="badge badge-warning">Menunggu review Pengadaan</span>
    if (mo?.review_status === 'diterima') return <span className="badge badge-success">Diproses di Pengadaan</span>
    if (mo?.review_status === 'ditolak') return <span className="badge badge-danger">MO ditolak</span>
    return <span className={aktif ? 'badge badge-warning' : 'badge'}>Menunggu tahap sebelumnya</span>
  }
  return <StatusPill status={data?.status} />
}

function deskripsiTahap(tahap: TahapPengolahan, transaksi: PengolahanItem, index: number, indexAktif: number) {
  if (tahap === 'gudang') return transaksi.skema === 'GDG' ? 'Input makloon, data masuk gudang, nota timbang.' : 'Mencocokkan data LHPK lalu input stok masuk gudang.'
  if (tahap === 'ub_jastasma') return transaksi.skema === 'GDG' ? 'Mencocokkan data gudang, lalu input LHPK.' : 'Input awal LHPK sebelum dicek Gudang.'
  if (tahap === 'operasi') return index <= indexAktif ? 'Menggabungkan LHPK ke MO.' : 'Menunggu data tahap sebelumnya diterima.'
  if (tahap === 'pengadaan') return transaksi.status_keseluruhan === 'selesai' ? 'Nomor OUT sudah diterbitkan.' : 'Review MO dan penerbitan Nomor OUT.'
  return ''
}

function TahapSummary({ tahap, transaksi }: { tahap: TahapPengolahan; transaksi: PengolahanItem }) {
  if (tahap === 'gudang') {
    const data = transaksi.data_gudang
    return (
      <DataGrid
        rows={[
          ['Makloon', transaksi.makloon?.nama_maklon ?? '-'],
          ['Gudang', transaksi.gudang?.nama ?? '-'],
          ['Tanggal masuk', tanggal(data?.tanggal_masuk_gudang)],
          ['Kuantum HGL', fmt(data?.kuantum_hgl, ' kg')],
          ['Plat mobil', data?.plat_mobil ?? '-'],
          ['Supir', data?.supir ?? '-'],
        ]}
      />
    )
  }

  if (tahap === 'ub_jastasma') {
    const data = transaksi.data_lhpk
    return (
      <DataGrid
        rows={[
          ['Nomor LHPK', data?.no_lhpk ?? '-'],
          ['Tanggal LHPK', tanggal(data?.tanggal_lhpk)],
          ['Gudang', transaksi.gudang?.nama ?? '-'],
          ['Stok gudang saat LHPK', fmt(data?.kuantum_stok_gudang, ' kg')],
          ['Gabah diolah', fmt(data?.kuantum_gabah_diolah, ' kg')],
          ['Beras HGL', fmt(data?.kuantum_beras_hgl, ' kg')],
          ['Rendemen', fmt(data?.rendemen, '%')],
          ['Kualitas', data?.kualitas ?? '-'],
          ['Broken / Menir / Katul', `${fmt(data?.broken)} / ${fmt(data?.menir)} / ${fmt(data?.katul)}`],
          ['KA1 / KA2 / KA3', `${fmt(data?.ka1)} / ${fmt(data?.ka2)} / ${fmt(data?.ka3)}`],
          ['Reject', fmt(data?.reject)],
        ]}
      />
    )
  }

  const mo = transaksi.mo_detail?.mo
  if (tahap === 'operasi') {
    return (
      <DataGrid
        rows={[
          ['Nomor MO', mo?.no_mo ?? '-'],
          ['No. TM ADA', mo?.no_tm_ada ?? '-'],
          ['No. TM Gudang', mo?.no_tm_gudang ?? '-'],
          ['Total beras HGL', fmt(mo?.total_kuantum_hgl, ' kg')],
          ['Total gabah diolah', fmt(mo?.total_kuantum_gabah_diolah, ' kg')],
        ]}
      />
    )
  }

  return (
    <DataGrid
      rows={[
        ['Nomor OUT', mo?.no_out ?? '-'],
        ['Tanggal OUT', tanggal(mo?.tanggal_out)],
      ]}
    />
  )
}

/**
 * Pop-up detail satu pengolahan. Datanya ditarik dari endpoint detail yang sama dengan halaman
 * ini -- baris kandidat MO cuma membawa LHPK, sedangkan yang mau dilihat peninjau adalah seluruh
 * tahapnya. Karena kuncinya sama, membuka pop-up untuk transaksi yang sedang dibuka tidak
 * menambah request sama sekali (dilayani cache React Query).
 *
 * Isinya ikut aturan yang sama dengan timeline & rekap: hanya tahap sampai milik role ini.
 */
function DetailPengolahanModal({ id, role, onClose }: { id: string; role: string; onClose: () => void }) {
  const { data: transaksi, isLoading, isError, error } = usePengolahanDetail(id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-primary-dark via-primary to-primary-dark px-6 py-5 text-white">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-accent">Detail Pengolahan</p>
              <h2 className="mt-1 text-2xl font-extrabold">{id}</h2>
              {transaksi && (
                <p className="mt-1 text-sm text-white/70">
                  {transaksi.gudang?.nama ?? '-'} · {transaksi.makloon?.nama_maklon ?? 'Makloon belum diisi'}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-bold transition-colors hover:bg-white/20">
              Tutup
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto bg-surface px-6 py-5">
            {isLoading && <div className="panel px-4 py-3 text-sm text-muted">Memuat detail...</div>}
            {isError && <div className="alert-danger">{pesanError(error)}</div>}

            {transaksi && tahapTerlihat(role, transaksi.skema).map((tahap) => (
              <section key={tahap} className="panel panel-pad">
                <h3 className="mb-3 text-sm font-extrabold text-primary-dark">{LABEL_TAHAP[tahap]}</h3>
                <TahapSummary tahap={tahap} transaksi={transaksi} />

                {/* Dokumen ikut di sini: yang dicek peninjau bukan cuma angkanya, tapi nota
                    timbang & LHPK-nya. Tanpa ini pop-up masih menyuruh buka halaman lain. */}
                {(tahap === 'gudang' || tahap === 'ub_jastasma') && (
                  <FotoPengolahan
                    id={transaksi.id_pengolahan}
                    jenisFoto={tahap === 'gudang' ? 'foto_notim' : 'foto_lhpk'}
                    enabled={!!dataUntukTahap(transaksi, tahap)}
                  />
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

/**
 * Baris-baris LHPK yang tergabung dalam satu MO, tiap baris membuka pop-up detailnya.
 *
 * Padanan tabel di layar Operasi, tapi untuk Pengadaan: yang dinilai Pengadaan (saat Terima/Tolak
 * MO maupun saat menerbitkan Nomor OUT) adalah gabungan baris-baris ini, jadi ia harus bisa
 * membuka satu per satu tanpa pindah halaman. Anggotanya diambil dari endpoint MO -- payload
 * pengolahan hanya membawa MO-nya, bukan saudara-saudaranya.
 */
function TabelAnggotaMo({ moId, role, sorotId }: { moId: number; role: string; sorotId?: string }) {
  const { data: mo, isLoading } = useMoDetail(moId)
  const [detailId, setDetailId] = useState<string | null>(null)
  const anggota = (mo?.mo_detail ?? []).map((item) => item.transaksi_pengolahan).filter((item) => !!item)

  return (
    <div className="mt-4">
      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.06em] text-muted">
        Baris yang digabungkan ({anggota.length}) — klik untuk lihat detail
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-primary-tint text-left text-primary-dark">
            <tr>
              <th className="px-3 py-2">No. LHPK</th>
              <th className="px-3 py-2">Gudang</th>
              <th className="px-3 py-2 text-right">Gabah Diolah</th>
              <th className="px-3 py-2 text-right">Kuantum HGL</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">Memuat anggota MO...</td></tr>}
            {!isLoading && anggota.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">MO ini belum punya anggota.</td></tr>
            )}
            {anggota.map((item) => (
              <tr
                key={item.id_pengolahan}
                onClick={() => setDetailId(item.id_pengolahan)}
                title="Klik untuk lihat detail pengolahan ini"
                className={`cursor-pointer border-t border-border transition-colors hover:bg-primary-tint/40 ${
                  item.id_pengolahan === sorotId ? 'bg-warning-bg/30' : ''
                }`}
              >
                <td className="px-3 py-2 font-medium text-primary-dark underline decoration-dotted underline-offset-4">
                  {item.data_lhpk?.no_lhpk ?? item.id_pengolahan}
                </td>
                <td className="px-3 py-2 text-gray-600">{item.gudang?.nama ?? '-'}</td>
                <td className="px-3 py-2 text-right">{fmt(item.data_lhpk?.kuantum_gabah_diolah, '')}</td>
                <td className="px-3 py-2 text-right">{fmt(item.data_lhpk?.kuantum_beras_hgl, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailId && <DetailPengolahanModal id={detailId} role={role} onClose={() => setDetailId(null)} />}
    </div>
  )
}

/** Tombol seragam pembuka pop-up detail, dipakai panel review, Operasi, dan Pengadaan. */
function TombolDetail({ onClick, label = 'Lihat detail lengkap' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-primary-dark transition-colors hover:border-primary hover:bg-primary-tint"
    >
      {label}
    </button>
  )
}

function OperasiWorkspace({
  transaksi,
  role,
  kandidat,
  onGabungkan,
  isPending,
  onKirimMo,
  isKirimPending,
}: {
  transaksi: PengolahanItem
  role: string
  kandidat: PengolahanItem[]
  onGabungkan: (payload: { selectedIds: string[]; noMo: string; noTmAda: string; noTmGudang: string }) => void
  isPending: boolean
  onKirimMo: (moId: number) => void
  isKirimPending: boolean
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set([transaksi.id_pengolahan]))
  const [noMo, setNoMo] = useState('')
  const [noTmAda, setNoTmAda] = useState('')
  const [noTmGudang, setNoTmGudang] = useState('')
  const [cari, setCari] = useState('')

  useEffect(() => {
    setSelected((prev) => new Set([...prev, transaksi.id_pengolahan]))
  }, [transaksi.id_pengolahan])

  // Server sudah membatasi kandidat ke makloon transaksi ini -- MO memang cuma boleh menggabungkan
  // LHPK dari makloon yang sama (MoGroupingService::validasiAnggota), jadi pilihan "semua makloon"
  // dulu hanya menawarkan baris yang pasti ditolak saat disimpan.
  const rows = useMemo(
    () => kandidat.filter((item) => !cari || (item.data_lhpk?.no_lhpk ?? '').toLowerCase().includes(cari.toLowerCase())),
    [kandidat, cari],
  )

  const selectedRows = rows.filter((item) => selected.has(item.id_pengolahan))
  const totalGabah = selectedRows.reduce((sum, item) => sum + Number(item.data_lhpk?.kuantum_gabah_diolah ?? 0), 0)
  const totalHgl = selectedRows.reduce((sum, item) => sum + Number(item.data_lhpk?.kuantum_beras_hgl ?? 0), 0)
  const mo = transaksi.mo_detail?.mo
  const moSiapDikirim = mo && mo.review_status === 'draft' && mo.status === 'proses'

  if (moSiapDikirim) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <div className="toolbar-card">
          <div>
            <h3 className="section-title">MO siap dikirim</h3>
            <p className="page-subtitle">MO sudah dibuat di Operasi. Kirim ke Pengadaan agar masuk status menunggu review.</p>
          </div>
          <button type="button" className="btn btn-primary" disabled={isKirimPending} onClick={() => onKirimMo(mo.id)}>
            {isKirimPending ? 'Mengirim...' : 'Kirim ke Pengadaan'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="toolbar-card mb-4">
        <div>
          <h3 className="section-title">Gabungkan LHPK jadi MO</h3>
          <p className="page-subtitle">Pilih baris dari makloon yang sama, lalu isi nomor MO dan TM. Klik barisnya untuk melihat detail.</p>
        </div>
        <span className="badge">Dipilih: {selectedRows.length}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="badge">Makloon: {transaksi.makloon?.nama_maklon ?? '-'}</span>
        <input className="input max-w-xs bg-white" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari No. LHPK" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-primary-tint text-left text-primary-dark">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2">No. LHPK</th>
              <th className="px-3 py-2">Makloon</th>
              <th className="px-3 py-2 text-right">Gabah Diolah</th>
              <th className="px-3 py-2 text-right">Kuantum HGL</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Belum ada LHPK yang siap digabung.</td></tr>
            )}
            {rows.map((item) => {
              const checked = selected.has(item.id_pengolahan)
              const isCurrent = item.id_pengolahan === transaksi.id_pengolahan
              return (
                // Baris diklik = buka detailnya. Yang digabung ke MO adalah angka-angka baris ini,
                // jadi peninjau harus bisa mengeceknya tanpa meninggalkan halaman penggabungan.
                <tr
                  key={item.id_pengolahan}
                  onClick={() => setDetailId(item.id_pengolahan)}
                  title="Klik untuk lihat detail pengolahan ini"
                  className={`cursor-pointer border-t border-border transition-colors hover:bg-primary-tint/40 ${isCurrent ? 'bg-warning-bg/30' : ''}`}
                >
                  {/* Sel centang menelan kliknya sendiri supaya memilih baris tidak ikut membuka pop-up. */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isCurrent}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(item.id_pengolahan)
                          else next.delete(item.id_pengolahan)
                          next.add(transaksi.id_pengolahan)
                          return next
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-primary-dark underline decoration-dotted underline-offset-4">
                    {item.data_lhpk?.no_lhpk ?? item.id_pengolahan}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{item.makloon?.nama_maklon ?? '-'}</td>
                  <td className="px-3 py-2 text-right">{fmt(item.data_lhpk?.kuantum_gabah_diolah, '')}</td>
                  <td className="px-3 py-2 text-right">{fmt(item.data_lhpk?.kuantum_beras_hgl, '')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="no_mo">Nomor MO</label>
          <input id="no_mo" className="input bg-white" value={noMo} onChange={(e) => setNoMo(e.target.value)} placeholder="MO/00832/02/2026/ADA08001" />
        </div>
        <div>
          <label className="label" htmlFor="no_tm_ada">Nomor TM ADA</label>
          <input id="no_tm_ada" className="input bg-white" value={noTmAda} onChange={(e) => setNoTmAda(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="no_tm_gudang">Nomor TM Gudang</label>
          <input id="no_tm_gudang" className="input bg-white" value={noTmGudang} onChange={(e) => setNoTmGudang(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total Gabah Diolah</div>
          <div className="mt-1 text-2xl font-extrabold text-primary-dark">{fmt(totalGabah, '')}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total Kuantum HGL</div>
          <div className="mt-1 text-2xl font-extrabold text-primary-dark">{fmt(totalHgl, '')}</div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!noMo.trim() || selected.size === 0 || isPending}
          onClick={() => onGabungkan({ selectedIds: Array.from(selected), noMo: noMo.trim(), noTmAda, noTmGudang })}
        >
          {isPending ? 'Memproses...' : 'Buat & Kirim ke Pengadaan'}
        </button>
      </div>

      {detailId && <DetailPengolahanModal id={detailId} role={role} onClose={() => setDetailId(null)} />}
    </div>
  )
}

function PengadaanWorkspace({
  transaksi,
  role,
  onIsiOut,
  isOutPending,
}: {
  transaksi: PengolahanItem
  role: string
  onIsiOut: (moId: number, noOut: string, tanggalOut: string) => void
  isOutPending: boolean
}) {
  const mo = transaksi.mo_detail?.mo
  const sudahSelesai = transaksi.status_keseluruhan === 'selesai' || mo?.status === 'lengkap'
  const [noOut, setNoOut] = useState(mo?.no_out ?? '')
  const [tanggalOut, setTanggalOut] = useState(tanggal(mo?.tanggal_out) === '-' ? '' : tanggal(mo?.tanggal_out))

  useEffect(() => {
    setNoOut(mo?.no_out ?? '')
    setTanggalOut(tanggal(mo?.tanggal_out) === '-' ? '' : tanggal(mo?.tanggal_out))
  }, [mo?.no_out, mo?.tanggal_out])

  if (!mo) return null

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="toolbar-card mb-4">
        <div>
          <h3 className="section-title">Pengadaan MO</h3>
          <p className="page-subtitle">Nomor OUT bisa diisi setelah MO disetujui Pengadaan.</p>
        </div>
        <span className="badge">{labelPengadaanMo(mo.review_status, sudahSelesai)}</span>
      </div>
      {/* Nomor OUT diterbitkan ATAS baris-baris ini, jadi daftarnya duduk tepat di atas formnya. */}
      <TabelAnggotaMo moId={mo.id} role={role} sorotId={transaksi.id_pengolahan} />

      {mo.review_status === 'diterima' && !sudahSelesai && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor={`no-out-${mo.id}`}>Nomor OUT</label>
            <input id={`no-out-${mo.id}`} className="input bg-white" value={noOut} onChange={(e) => setNoOut(e.target.value)} placeholder="OUT/00832/02/2026/ADA08001" />
          </div>
          <div>
            <label className="label" htmlFor={`tanggal-out-${mo.id}`}>Tanggal OUT</label>
            <input id={`tanggal-out-${mo.id}`} type="date" className="input bg-white" value={tanggalOut} onChange={(e) => setTanggalOut(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!noOut.trim() || !tanggalOut || isOutPending}
            onClick={() => onIsiOut(mo.id, noOut.trim(), tanggalOut)}
          >
            {isOutPending ? 'Memproses...' : 'Terbitkan OUT'}
          </button>
        </div>
      )}
    </div>
  )
}

function MoReviewActions({
  noMo,
  moId,
  idPengolahan,
  role,
  onTerima,
  onTolak,
  isTerimaPending,
  isTolakPending,
}: {
  noMo: string
  moId: number
  idPengolahan: string
  role: string
  onTerima: () => void
  onTolak: (catatan: string) => void
  isTerimaPending: boolean
  isTolakPending: boolean
}) {
  const [dialogTolak, setDialogTolak] = useState(false)
  const [dialogTerima, setDialogTerima] = useState(false)
  const [catatan, setCatatan] = useState('')

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="toolbar-card mb-4">
        <div>
          <h3 className="section-title">Review MO Operasi</h3>
          <p className="page-subtitle">Cek data MO dari Operasi sebelum Pengadaan mengisi Nomor OUT.</p>
        </div>
        <span className="badge badge-warning">Menunggu review Pengadaan</span>
      </div>

      {/* Yang diterima/ditolak adalah gabungan baris-baris ini -- peninjau harus bisa membuka
          tiap barisnya sebelum memutuskan. */}
      <TabelAnggotaMo moId={moId} role={role} sorotId={idPengolahan} />

      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <button type="button" className="btn btn-outline-danger" disabled={isTolakPending} onClick={() => setDialogTolak(true)}>
          Tolak
        </button>
        <button type="button" className="btn btn-primary" disabled={isTerimaPending} onClick={() => setDialogTerima(true)}>
          Terima &amp; Lanjutkan
        </button>
      </div>

      <ConfirmDialog
        open={dialogTerima}
        title="Terima MO ini?"
        description={<>MO <strong>{noMo}</strong> akan disetujui Pengadaan. Setelah itu Nomor OUT bisa diterbitkan.</>}
        confirmLabel="Terima & Lanjutkan"
        confirmVariant="primary"
        loading={isTerimaPending}
        onCancel={() => setDialogTerima(false)}
        onConfirm={() => {
          onTerima()
          setDialogTerima(false)
        }}
      />

      <ConfirmDialog
        open={dialogTolak}
        title="Tolak MO ini?"
        description={<>MO <strong>{noMo}</strong> akan dikembalikan ke Operasi untuk diperbaiki. Tulis alasan penolakan.</>}
        confirmLabel="Kirim Penolakan"
        confirmVariant="danger"
        loading={isTolakPending}
        confirmDisabled={!catatan.trim()}
        onCancel={() => {
          setDialogTolak(false)
          setCatatan('')
        }}
        onConfirm={() => {
          onTolak(catatan.trim())
          setDialogTolak(false)
          setCatatan('')
        }}
      >
        <textarea className="input mt-3 min-h-24" placeholder="Catatan penolakan (wajib diisi)" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </ConfirmDialog>
    </div>
  )
}

function DataGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-surface px-3 py-2">
          <dt className="text-[0.68rem] font-bold uppercase tracking-[0.06em] text-muted">{label}</dt>
          <dd className="mt-1 break-words font-semibold text-primary-dark">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function FotoPengolahan({ id, jenisFoto, enabled }: { id: string; jenisFoto: string; enabled: boolean }) {
  const { data: thumb } = useFotoPengolahanUrl(id, jenisFoto, enabled, 'thumb')
  const { data: asli, refetch } = useFotoPengolahanUrl(id, jenisFoto, false)
  const label = labelFoto(jenisFoto)

  return (
    <div className="mt-4">
      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.06em] text-muted">Foto tersimpan</p>
      {thumb ? (
        <button
          type="button"
          onClick={() => bukaTabBaru(async () => asli ?? (await refetch()).data)}
          className="group w-24 text-left"
          title={`Buka ${label}`}
        >
          <span className="block h-24 w-24 overflow-hidden rounded-lg border border-border bg-surface">
            <img src={thumb} alt={label} loading="lazy" className="h-24 w-24 object-cover transition-transform group-hover:scale-105" />
          </span>
          <span className="mt-1 block truncate text-[0.65rem] text-gray-500">{label}</span>
        </button>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm text-muted">
          {enabled ? `${label} belum diunggah.` : 'Belum ada data tahap untuk foto.'}
        </p>
      )}
    </div>
  )
}

function ReviewPanel({
  tahap,
  transaksi,
  role,
  onTolak,
  onTerima,
  isTolakPending,
  isTerimaPending,
}: {
  tahap: TahapPengolahan
  transaksi: PengolahanItem
  role: string
  onTolak: (catatan: string) => void
  onTerima: () => void
  isTolakPending: boolean
  isTerimaPending: boolean
}) {
  const [dialogTolak, setDialogTolak] = useState(false)
  const [catatan, setCatatan] = useState('')
  const [detailTerbuka, setDetailTerbuka] = useState(false)

  return (
    <div className="mt-5 rounded-xl border border-warning/40 bg-warning-bg/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-primary-dark">Review data {LABEL_TAHAP[tahap]}</h3>
          <p className="page-subtitle">Cocokkan detail tahap ini sebelum diterima ke tahap berikutnya.</p>
        </div>
        <span className="badge badge-warning">Giliran {LABEL_TAHAP[transaksi.current_stage]}</span>
      </div>
      {/* Tombol detail duduk di sisi kiri, terpisah dari Terima/Tolak: memeriksa dulu baru
          memutuskan, bukan tiga tombol sederajat yang gampang salah tekan. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <TombolDetail onClick={() => setDetailTerbuka(true)} />
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="btn btn-outline-danger" disabled={isTolakPending} onClick={() => setDialogTolak(true)}>
            Tolak
          </button>
          <button type="button" className="btn btn-primary" disabled={isTerimaPending} onClick={onTerima}>
            Terima
          </button>
        </div>
      </div>

      {detailTerbuka && (
        <DetailPengolahanModal id={transaksi.id_pengolahan} role={role} onClose={() => setDetailTerbuka(false)} />
      )}

      <ConfirmDialog
        open={dialogTolak}
        title="Tolak data tahap ini?"
        description={<>Data <strong>{LABEL_TAHAP[tahap]}</strong> akan dikembalikan untuk direvisi. Tulis alasan penolakan terlebih dahulu.</>}
        confirmLabel="Kirim Penolakan"
        confirmVariant="danger"
        loading={isTolakPending}
        confirmDisabled={!catatan.trim()}
        onCancel={() => {
          setDialogTolak(false)
          setCatatan('')
        }}
        onConfirm={() => {
          onTolak(catatan.trim())
          setDialogTolak(false)
          setCatatan('')
        }}
      >
        <textarea
          className="input mt-3 min-h-24"
          placeholder="Catatan penolakan (wajib diisi)"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  )
}

function FormTahap({
  tahap,
  transaksi,
  form,
  setForm,
  makloonId,
  setMakloonId,
  bolehPilihMakloon,
  kirimTahap,
  fotoPilihan,
  setFotoPilihan,
  isSaving,
}: {
  tahap: TahapPengolahan
  transaksi: PengolahanItem
  form: FormNilai
  setForm: (value: FormNilai) => void
  makloonId: number | null
  setMakloonId: (value: number | null) => void
  /** Hanya pengisi tahap PERTAMA yang menetapkan makloon; tahap kedua membacanya saja. */
  bolehPilihMakloon: boolean
  kirimTahap: (kirim: boolean) => void
  fotoPilihan: File | null
  setFotoPilihan: (file: File | null) => void
  isSaving: boolean
}) {
  const fields = tahap === 'gudang' ? FIELD_GUDANG : FIELD_LHPK
  const rendemen =
    tahap === 'ub_jastasma' && Number(form.kuantum_gabah_diolah) > 0
      ? (Number(form.kuantum_beras_hgl || 0) / Number(form.kuantum_gabah_diolah)) * 100
      : null

  const jenisFoto = tahap === 'gudang' ? 'foto_notim' : 'foto_lhpk'
  const { data: fotoTersimpan } = useFotoPengolahanUrl(
    transaksi.id_pengolahan,
    jenisFoto,
    !!dataUntukTahap(transaksi, tahap),
    'thumb',
  )

  const [warning, setWarning] = useState<string | null>(null)

  const kurang = [
    ...(bolehPilihMakloon && !makloonId ? ['Makloon'] : []),
    ...fields.filter((field) => !nilaiField(field, form).trim()).map((field) => field.label),
  ]

  /**
   * Simpan menuntut seluruh field terisi, Kirim menuntut field + dokumen. Tombol sengaja tidak
   * di-disable: user perlu bisa menekannya dan diberi tahu APA yang kurang -- pola yang sama
   * dipakai form-form alur SerGab.
   */
  const simpan = (kirim: boolean) => {
    const blokir = [...kurang, ...(kirim && !fotoPilihan && !fotoTersimpan ? ['dokumen foto'] : [])]
    if (blokir.length > 0) {
      setWarning(`Belum lengkap: ${blokir.join(', ')}.`)
      return
    }

    setWarning(null)
    kirimTahap(kirim)
  }

  return (
    <div className="mt-5 rounded-xl border border-primary/20 bg-primary-tint/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-primary-dark">Input {LABEL_TAHAP[tahap]}</h3>
          <p className="page-subtitle">
            {tahap === 'gudang' ? 'Isi data masuk gudang dan unggah nota timbang.' : 'Isi LHPK, nilai rendemen dihitung otomatis.'}
          </p>
        </div>
        <StatusPill status={dataUntukTahap(transaksi, tahap)?.status} />
      </div>

      {/* Gudang tidak diketik lagi di sini: ia dipilih sekali saat pengolahan dibuat. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="makloon-tahap">Makloon asal</label>
          {bolehPilihMakloon ? (
            <MakloonCombobox value={makloonId} onChange={setMakloonId} reserveSpaceWhenOpen />
          ) : (
            <input
              id="makloon-tahap"
              className="input bg-white text-muted"
              value={transaksi.makloon?.nama_maklon ?? '-'}
              readOnly
            />
          )}
        </div>

        {tahap === 'ub_jastasma' && (
          <div>
            <label className="label" htmlFor="stok-gudang">Kuantum stok gudang otomatis (kg)</label>
            {/* Angka sistem: stok berjalan gudang ini (HGL diterima - gabah yang sudah diolah).
                Dihitung ulang server saat disimpan, jadi di sini murni tampilan. */}
            <input
              id="stok-gudang"
              className="input bg-white text-muted"
              value={fmt(transaksi.stok_gudang_berjalan ?? 0)}
              readOnly
            />
          </div>
        )}

        {fields.map((field) => {
          const nilai = nilaiField(field, form)

          return (
            <div key={field.key}>
              <label className="label" htmlFor={field.key}>{field.label}</label>
              {field.ribuan ? (
                <AngkaInput
                  className="input bg-white"
                  value={nilai}
                  onChange={(raw) => setForm({ ...form, [field.key]: raw })}
                />
              ) : (
                <input
                  id={field.key}
                  className="input bg-white"
                  type={field.type ?? 'text'}
                  step={field.type === 'number' ? '0.01' : undefined}
                  value={nilai}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  placeholder={field.key === 'no_lhpk' ? 'LHPK/00832/02/2026/ADA08001' : undefined}
                />
              )}
            </div>
          )
        })}
      </div>

      {tahap === 'ub_jastasma' && (
        <p className="mt-3 rounded-lg border border-border bg-white px-3 py-2 text-sm text-muted">
          Rendemen otomatis:{' '}
          <strong className="text-primary-dark">{rendemen === null ? '-' : `${rendemen.toFixed(2)}%`}</strong>
        </p>
      )}

      <div className="mt-4">
        <FotoPicker
          label={tahap === 'gudang' ? 'Foto Nota Timbang' : 'Foto LHPK/HPK'}
          file={fotoPilihan}
          onChange={setFotoPilihan}
          savedSrc={fotoTersimpan}
        />
        <p className="page-subtitle mt-1">Dokumen ikut tersimpan saat draft disimpan atau data dikirim.</p>
      </div>

      {warning && <p className="alert-danger mt-4">{warning}</p>}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-ghost" disabled={isSaving} onClick={() => simpan(false)}>Simpan draft</button>
        <button type="button" className="btn btn-primary" disabled={isSaving} onClick={() => simpan(true)}>
          {isSaving ? 'Menyimpan...' : 'Kirim ke tahap berikutnya'}
        </button>
      </div>
    </div>
  )
}
