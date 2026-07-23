import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { pesanKegagalan } from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { useAuth } from '../hooks/useAuth'
import { uploadSemuaFoto } from '../lib/uploadFoto'
import { formatMoney, formatNumber } from '../lib/poFormat'
import AngkaInput from '../components/AngkaInput'
import FotoPicker from '../components/FotoPicker'
import FormHero from '../components/FormHero'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonTimeline } from '../components/Skeleton'
import MakloonCombobox from '../components/MakloonCombobox'
import KabupatenSelect from '../components/KabupatenSelect'
import GabungPoForm from '../components/pengadaan/GabungPoForm'
import PoInForm from '../components/pengadaan/PoInForm'
import PembayaranForm from '../components/pengadaan/PembayaranForm'
import PoReviewCard from '../components/pengadaan/PoReviewCard'
import { useTransaksiList } from '../hooks/useTransaksiList'
import type { PoItem } from '../hooks/usePoList'

type StageData = Record<string, unknown> & { status: string }

type RiwayatPenolakan = {
  id: number
  tahap: string
  catatan: string
  ditolak_oleh: number
  ditolak_oleh_nama: string | null
  ditolak_pada: string
}

type JemputPanganFormState = {
  id_pemasok: string
  supir: string
  plat_mobil: string
  nama_poktan_gapoktan: string
  desa: string
  kecamatan: string
  kabupaten: string
  makloon_user_id: number | null
  tanggal_kirim: string
  kuantum: string
  jarak_ke_makloon_km: string
}

type MakloonTjpFormState = { tanggal_bongkar: string; kuantum_bongkar: string }

type MakloonMppFormState = {
  id_pemasok: string
  supir: string
  plat_mobil: string
  desa: string
  kecamatan: string
  kabupaten: string
  tanggal_bongkar: string
  kuantum: string
  jarak_ke_makloon_km: string
}

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
  data_pengadaan: PoItem | null
  riwayat_penolakan: RiwayatPenolakan[]
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
  { id: 'makloon_kirim', label: 'Makloon Kirim', owner: 'Makloon', dataKeys: ['data_makloon_mpp'], helper: 'Makloon membuat data MPP dan mengirimkannya untuk pengecekan internal.' },
  { id: 'makloon_terima', label: 'Makloon Terima', owner: 'Makloon', dataKeys: [], helper: 'Makloon mengecek data MPP sebelum diteruskan ke UB Jastasma.' },
  { id: 'ub_jastasma', label: 'UB Jastasma', owner: 'UB Jastasma', dataKeys: ['data_ub_jastasma'], helper: 'Cek mutu gabah sebelum transaksi masuk pengadaan.' },
  { id: 'pengadaan', label: 'Pengadaan', owner: 'Pengadaan', dataKeys: [], helper: 'Gabungkan transaksi yang diterima menjadi PO dan isi nomor IN.' },
  { id: 'keuangan', label: 'Keuangan', owner: 'Keuangan', dataKeys: [], helper: 'Input No. SPP dan tanggal pembayaran PO.' },
  { id: 'operasi', label: 'Operasi', owner: 'Operasi', dataKeys: [], helper: 'Input MO/TM dan persentase hasil produksi.', actionPath: '/operasi', actionLabel: 'Buka Operasi' },
  { id: 'gudang', label: 'Gudang', owner: 'Gudang', dataKeys: [], helper: 'Catat penerimaan akhir ke gudang.', actionPath: '/gudang', actionLabel: 'Buka Gudang' },
]

// Ikon garis sederhana per tahap (stroke currentColor) supaya marker timeline lebih
// hidup daripada sekadar titik. Ukuran seragam 14x14 di dalam marker bulat.
const STAGE_ICONS: Record<string, React.ReactNode> = {
  jemput_pangan: (
    <>
      <path d="M1.5 4h8.5v7H1.5z M10 6.5h3.5l2.5 2.5V11H10z" />
      <circle cx="4.5" cy="13.5" r="1.5" />
      <circle cx="13" cy="13.5" r="1.5" />
    </>
  ),
  makloon: <path d="M2 16V7l4 2.5V7l4 2.5V4.5l6 3.5V16z M6 16v-3 M11 16v-3" />,
  makloon_kirim: <path d="M2 16V7l4 2.5V7l4 2.5V4.5l6 3.5V16z M6 16v-3 M11 16v-3 M13 7.5l3 2.5-3 2.5 M16 10H9" />,
  makloon_terima: <path d="M2 16V7l4 2.5V7l4 2.5V4.5l6 3.5V16z M6 16v-3 M11 16v-3 M9.5 10.5l2 2 4-4" />,
  ub_jastasma: <path d="M7 2.5h4 M8.5 2.5v4l-4 7.5a1 1 0 0 0 .9 1.5h7.2a1 1 0 0 0 .9-1.5l-4-7.5v-4 M6.3 11.5h5.4" />,
  pengadaan: <path d="M4.5 2.5h6l3.5 3.5V15.5h-9.5z M10.5 2.5v3.5h3.5 M7 9.5h4 M7 12h4" />,
  keuangan: <path d="M2 5.5h14v8H2z M2 8.5h14 M12 11.5h2.5" />,
}

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
  no_po: 'No. PO',
  no_spp: 'No. SPP',
  status_po: 'Status PO',
  total_kuantum: 'Total kuantum',
  harga: 'Harga',
  total_harga: 'Total harga',
  status_bayar: 'Status bayar',
  tanggal_bayar: 'Tanggal bayar',
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

const emptyJemputPanganForm: JemputPanganFormState = {
  id_pemasok: '',
  supir: '',
  plat_mobil: '',
  nama_poktan_gapoktan: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  makloon_user_id: null,
  tanggal_kirim: '',
  kuantum: '',
  jarak_ke_makloon_km: '',
}

const emptyMakloonMppForm: MakloonMppFormState = {
  id_pemasok: '',
  supir: '',
  plat_mobil: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  tanggal_bongkar: '',
  kuantum: '',
  jarak_ke_makloon_km: '',
}

const FOTO_LABELS: Record<string, string> = Object.fromEntries(
  [...JEMPUT_PANGAN_FOTO_FIELDS, ...MAKLOON_MPP_FOTO_FIELDS, ...MAKLOON_FOTO_FIELDS, ...UB_FOTO_FIELDS].map((f) => [f.key, f.label]),
)

function fotoLabel(key: string) {
  return FOTO_LABELS[key] ?? key.replaceAll('_', ' ')
}

function photoFieldsFor(stageId: string, skema: 'TJP' | 'MPP') {
  if (stageId === 'jemput_pangan') return JEMPUT_PANGAN_FOTO_FIELDS
  if (stageId === 'makloon') return skema === 'MPP' ? MAKLOON_MPP_FOTO_FIELDS : MAKLOON_FOTO_FIELDS
  if (stageId === 'makloon_kirim') return MAKLOON_MPP_FOTO_FIELDS
  if (stageId === 'ub_jastasma') return UB_FOTO_FIELDS
  return []
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

// Field bernilai uang -> Rupiah; field kuantum (kg) -> pemisah ribuan tanpa desimal paksa.
const MONEY_FIELDS = new Set(['harga', 'total_harga'])
const KUANTUM_FIELDS = new Set(['kuantum', 'kuantum_bongkar', 'total_kuantum'])

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (MONEY_FIELDS.has(key)) return formatMoney(value as string | number)
  if (KUANTUM_FIELDS.has(key)) return `${formatNumber(value as string | number)} kg`
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value).toLocaleDateString('id-ID')
  return String(value)
}

function labelOf(key: string) {
  return FIELD_LABELS[key] ?? key.replaceAll('_', ' ')
}

// Operasi & Gudang sengaja tidak dirender di timeline -- alurnya dikerjakan di halaman
// /operasi & /gudang. Timeline berhenti di Keuangan. Definisi keduanya tetap ada di STAGES
// untuk keperluan lookup label (mis. current_stage, riwayat penolakan).
const TIMELINE_HIDDEN = new Set(['operasi', 'gudang'])
const STAGE_ACTOR_ROLES: Record<string, string> = {
  makloon_kirim: 'makloon',
  makloon_terima: 'makloon',
}

function stagesFor(skema: 'TJP' | 'MPP') {
  const base = skema === 'MPP'
    ? STAGES.filter((stage) => !['jemput_pangan', 'makloon'].includes(stage.id))
    : STAGES.filter((stage) => !['makloon_kirim', 'makloon_terima'].includes(stage.id))
  return base.filter((stage) => !TIMELINE_HIDDEN.has(stage.id))
}

function actorRoleFor(stageId: string) {
  return STAGE_ACTOR_ROLES[stageId] ?? stageId
}

function pendingReviewFor(activeStages: StageConfig[], currentIndex: number, transaksi: TransaksiDetail) {
  if (currentIndex <= 0) return null

  const currentStage = activeStages[currentIndex]
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    const previousStage = activeStages[i]
    const data = previousStage.dataKeys
      .map((key) => transaksi[key] as StageData | null)
      .find((item) => item?.status === 'menunggu_review')

    if (data) {
      return {
        stageId: currentStage.dataKeys.length === 0 ? currentStage.id : previousStage.id,
        data,
      }
    }
  }

  return null
}

function textField(data: StageData | null | undefined, key: string) {
  const value = data?.[key]
  return value === null || value === undefined ? '' : String(value)
}

function dateField(data: StageData | null | undefined, key: string) {
  return textField(data, key).slice(0, 10)
}

function numberIdField(data: StageData | null | undefined, key: string) {
  const value = data?.[key]
  if (value === null || value === undefined || value === '') return null
  return Number(value)
}

function poStageData(po: PoItem | null, stageId: string): StageData | null {
  if (!po) return null

  if (stageId === 'pengadaan') {
    return {
      status: po.review_status ?? 'menunggu_review',
      locked_at: po.review_timeline?.pengadaan?.reviewed_at ?? null,
      no_po: po.no_po,
      no_spp: po.no_spp,
      status_po: po.status,
      total_kuantum: po.total_kuantum,
      harga: po.harga,
      total_harga: po.total_harga,
    }
  }

  if (stageId === 'keuangan' && po.data_keuangan) {
    return {
      status: po.data_keuangan.review_status ?? (po.data_keuangan.status_bayar === 'dibayarkan' ? 'diterima' : 'menunggu_review'),
      locked_at: po.review_timeline?.keuangan?.reviewed_at ?? null,
      no_po: po.no_po,
      no_spp: po.no_spp,
      status_bayar: po.data_keuangan.status_bayar,
      tanggal_bayar: po.data_keuangan.tanggal_bayar,
    }
  }

  return null
}

export default function TransaksiDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [catatan, setCatatan] = useState('')
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const toggleStage = (stageId: string) =>
    setExpandedStages((prev) => {
      const next = new Set(prev)
      if (next.has(stageId)) next.delete(stageId)
      else next.add(stageId)
      return next
    })

  const [jemputPanganForm, setJemputPanganForm] = useState<JemputPanganFormState>(emptyJemputPanganForm)
  const [fotosJemputPangan, setFotosJemputPangan] = useState<Record<string, File | null>>({})
  const [progressJemputPangan, setProgressJemputPangan] = useState<Record<string, number>>({})
  const [fotoJemputPanganGagal, setFotoJemputPanganGagal] = useState<string[]>([])

  const [makloonForm, setMakloonForm] = useState<MakloonTjpFormState>({ tanggal_bongkar: '', kuantum_bongkar: '' })
  const [makloonMppForm, setMakloonMppForm] = useState<MakloonMppFormState>(emptyMakloonMppForm)
  const [fotosMakloon, setFotosMakloon] = useState<Record<string, File | null>>({})
  const [progressMakloon, setProgressMakloon] = useState<Record<string, number>>({})
  const [fotoMakloonGagal, setFotoMakloonGagal] = useState<string[]>([])

  const [ubForm, setUbForm] = useState({ ka1: '', ka2: '', ka3: '', hampa: '', butir_hijau: '' })
  const [fotosUb, setFotosUb] = useState<Record<string, File | null>>({})
  const [progressUb, setProgressUb] = useState<Record<string, number>>({})
  const [fotoUbGagal, setFotoUbGagal] = useState<string[]>([])

  const { data: transaksi, isLoading, isError, error } = useQuery({
    queryKey: ['transaksi', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: TransaksiDetail }>(`/api/transaksi/${encodeURIComponent(id!)}`)
      return data.data
    },
  })

  // Daftar transaksi kandidat untuk digabung menjadi PO (dipakai panel Pengadaan inline saat
  // transaksi ini belum tergabung). Sama sumbernya dengan halaman Pengadaan (mode siap_po).
  const { data: kandidatResult } = useTransaksiList(1, 100, true)

  useEffect(() => {
    if (!transaksi) return

    setJemputPanganForm({
      id_pemasok: textField(transaksi.data_jemput_pangan, 'id_pemasok'),
      supir: textField(transaksi.data_jemput_pangan, 'supir'),
      plat_mobil: textField(transaksi.data_jemput_pangan, 'plat_mobil'),
      nama_poktan_gapoktan: textField(transaksi.data_jemput_pangan, 'nama_poktan_gapoktan'),
      desa: textField(transaksi.data_jemput_pangan, 'desa'),
      kecamatan: textField(transaksi.data_jemput_pangan, 'kecamatan'),
      kabupaten: textField(transaksi.data_jemput_pangan, 'kabupaten'),
      makloon_user_id: numberIdField(transaksi.data_jemput_pangan, 'makloon_user_id'),
      tanggal_kirim: dateField(transaksi.data_jemput_pangan, 'tanggal_kirim'),
      kuantum: textField(transaksi.data_jemput_pangan, 'kuantum'),
      jarak_ke_makloon_km: textField(transaksi.data_jemput_pangan, 'jarak_ke_makloon_km'),
    })

    setMakloonForm({
      tanggal_bongkar: dateField(transaksi.data_makloon_tjp, 'tanggal_bongkar'),
      kuantum_bongkar: textField(transaksi.data_makloon_tjp, 'kuantum_bongkar'),
    })

    setMakloonMppForm({
      id_pemasok: textField(transaksi.data_makloon_mpp, 'id_pemasok'),
      supir: textField(transaksi.data_makloon_mpp, 'supir'),
      plat_mobil: textField(transaksi.data_makloon_mpp, 'plat_mobil'),
      desa: textField(transaksi.data_makloon_mpp, 'desa'),
      kecamatan: textField(transaksi.data_makloon_mpp, 'kecamatan'),
      kabupaten: textField(transaksi.data_makloon_mpp, 'kabupaten'),
      tanggal_bongkar: dateField(transaksi.data_makloon_mpp, 'tanggal_bongkar'),
      kuantum: textField(transaksi.data_makloon_mpp, 'kuantum'),
      jarak_ke_makloon_km: textField(transaksi.data_makloon_mpp, 'jarak_ke_makloon_km'),
    })
  }, [transaksi])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
    queryClient.invalidateQueries({ queryKey: ['transaksi', id] })
  }

  const terima = useMutation({
    mutationFn: (_stageLabel: string) => api.post(`/api/transaksi/${encodeURIComponent(id!)}/terima`),
    onSuccess: (_res, stageLabel) => {
      setCatatan('')
      invalidate()
      toast.success(`Data ${stageLabel} diterima & dikunci.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menerima data tahap.')),
  })

  const tolak = useMutation({
    mutationFn: (_stageLabel: string) => api.post(`/api/transaksi/${encodeURIComponent(id!)}/tolak`, { catatan }),
    onSuccess: (_res, stageLabel) => {
      setCatatan('')
      invalidate()
      toast.success(`Transaksi dikembalikan ke ${stageLabel} untuk direvisi.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menolak data tahap.')),
  })

  const simpanJemputPangan = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/jemput-pangan`, {
        ...jemputPanganForm,
        kuantum: Number(jemputPanganForm.kuantum),
        jarak_ke_makloon_km: Number(jemputPanganForm.jarak_ke_makloon_km),
      })
      const { gagal } = await uploadSemuaFoto(id!, fotosJemputPangan, (jenisFoto, percent) => setProgressJemputPangan((prev) => ({ ...prev, [jenisFoto]: percent })))
      return { gagal }
    },
    onSuccess: ({ gagal }) => {
      setFotoJemputPanganGagal(gagal)
      invalidate()
      toast.success('Data Jemput Pangan dikirim ulang ke Makloon.')
      gagal.forEach((f) => toast.error(`Foto "${fotoLabel(f)}" gagal diupload, coba ulangi.`))
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data Jemput Pangan.')),
  })

  const simpanMakloon = useMutation({
    mutationFn: async () => {
      const payload = transaksi?.skema === 'MPP'
        ? {
            ...makloonMppForm,
            kuantum: Number(makloonMppForm.kuantum),
            jarak_ke_makloon_km: Number(makloonMppForm.jarak_ke_makloon_km),
          }
        : {
            tanggal_bongkar: makloonForm.tanggal_bongkar,
            kuantum_bongkar: Number(makloonForm.kuantum_bongkar),
          }

      await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/makloon`, payload)
      const { gagal } = await uploadSemuaFoto(id!, fotosMakloon, (jenisFoto, percent) => setProgressMakloon((prev) => ({ ...prev, [jenisFoto]: percent })))
      return { gagal }
    },
    onSuccess: ({ gagal }) => {
      setFotoMakloonGagal(gagal)
      invalidate()
      toast.success(transaksi?.skema === 'MPP' ? 'Data Makloon dikirim untuk proses Makloon Terima.' : 'Data Makloon dikirim, transaksi diteruskan ke UB Jastasma.')
      gagal.forEach((f) => toast.error(`Foto "${fotoLabel(f)}" gagal diupload, coba ulangi.`))
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data Makloon.')),
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
      toast.success('Data UB Jastasma dikirim, transaksi diteruskan ke Pengadaan.')
      gagal.forEach((f) => toast.error(`Foto "${fotoLabel(f)}" gagal diupload, coba ulangi.`))
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data UB Jastasma.')),
  })

  if (isLoading) return <SkeletonTimeline />

  if (isError || !transaksi) {
    return (
      <div className="min-h-screen bg-surface">
        <FormHero
          title="Detail transaksi tidak bisa dimuat"
          subtitle={pesanKegagalan(error) ?? 'Data transaksi tidak ditemukan atau server belum mengembalikan detail transaksi.'}
          eyebrow="Perum Bulog Kanwil Lampung"
          badge="Gagal memuat"
        />
        <div className="relative mx-auto -mt-16 w-full max-w-[46rem] px-6 pb-16">
          <div className="panel panel-pad">
            <div className="alert-danger">
              {apiErrorMessage(error, 'Gagal memuat detail transaksi. Coba muat ulang halaman atau kembali ke daftar transaksi.')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const role = user?.role.nama_role
  const activeStages = stagesFor(transaksi.skema)
  const currentIndex = activeStages.findIndex((stage) => stage.id === transaksi.current_stage)
  const pendingData = pendingReviewFor(activeStages, currentIndex, transaksi)
  const canAct = role === actorRoleFor(transaksi.current_stage) || role === 'admin'
  const canFillJemputPangan = canAct && !pendingData && transaksi.skema === 'TJP' && transaksi.current_stage === 'jemput_pangan' && transaksi.data_jemput_pangan?.status === 'ditolak'
  const canFillMakloon = canAct && !pendingData && ((transaksi.skema === 'TJP' && transaksi.current_stage === 'makloon') || (transaksi.skema === 'MPP' && transaksi.current_stage === 'makloon_kirim'))
  const canFillUb = canAct && !pendingData && transaksi.current_stage === 'ub_jastasma'
  // Tahap PO (level PO, dikerjakan inline). po = PO tempat transaksi ini bernaung (null bila belum).
  // PENTING: setelah digabung, backend memindahkan current_stage transaksi langsung ke 'keuangan'
  // (lihat PoGroupingService), padahal pengisian No. IN masih tugas Pengadaan selama PO 'proses'.
  // Karena itu visibilitas panel PO diturunkan dari STATUS PO + role, bukan current_stage.
  const po = transaksi.data_pengadaan
  const isPengadaanRole = role === 'pengadaan' || role === 'admin'
  const isKeuanganRole = role === 'keuangan' || role === 'admin'
  const poRejected = !!po && po.review_status === 'ditolak'
  const poFillingIn = !!po && transaksi.current_stage === 'pengadaan' && (po.status === 'proses' || poRejected) // fase Pengadaan mengisi/memperbaiki PO
  const poWaitingReview = !!po && transaksi.current_stage === 'keuangan' && po.review_status === 'menunggu_review'
  const poAccepted = !!po && po.review_status === 'diterima'
  const poPaid = po?.data_keuangan?.status_bayar === 'dibayarkan' || po?.data_keuangan?.review_status === 'diterima'
  // Pengadaan: gabung PO (belum ada PO) lalu isi No. IN (PO 'proses'/ditolak).
  const showCombine = !po && transaksi.current_stage === 'pengadaan' && !pendingData && isPengadaanRole
  const showIsiIn = poFillingIn && isPengadaanRole
  const pengadaanCurrent = showCombine || poFillingIn
  const pengadaanComplete = !!po && !poFillingIn
  // Keuangan: review data Pengadaan lalu pembayaran.
  const showKeuanganReview = poWaitingReview && isKeuanganRole
  const showBayar = poAccepted && !poPaid && isKeuanganRole
  const keuanganCurrent = transaksi.current_stage === 'keuangan' && (poWaitingReview || (poAccepted && !poPaid))
  const keuanganComplete = poPaid

  const jemputPanganError = (simpanJemputPangan.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const makloonError = (simpanMakloon.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const ubError = (simpanUb.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const actionError = ((terima.error || tolak.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  // Ringkasan progres alur untuk progress bar hero (memakai aturan isComplete yang sama).
  const completedCount = activeStages.filter((stage) => {
    if (stage.id === 'pengadaan') return pengadaanComplete
    if (stage.id === 'keuangan') return keuanganComplete
    if (stage.id === 'makloon_terima') return transaksi.data_makloon_mpp?.status === 'diterima'
    const data = stage.dataKeys.map((key) => transaksi[key] as StageData | null).find(Boolean) ?? null
    return !!data && data.status === 'diterima'
  }).length
  const totalStages = activeStages.length
  const progressPct = totalStages > 0 ? Math.round((completedCount / totalStages) * 100) : 0
  const activeStageLabel = STAGES.find((stage) => stage.id === transaksi.current_stage)?.label ?? transaksi.current_stage
  const allDone = completedCount === totalStages

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title={transaksi.id_transaksi}
        subtitle={`Alur ${transaksi.skema === 'TJP' ? 'TJP: Jemput Pangan ke Makloon lalu UB Jastasma' : 'MPP: Makloon Kirim ke Makloon Terima lalu UB Jastasma'} · dibuat ${formatDateTime(transaksi.created_at)}`}
        eyebrow="Perum Bulog Kanwil Lampung"
        badge={`Skema ${transaksi.skema}`}
      />

      <div className="relative mx-auto -mt-16 w-full max-w-[46rem] px-6 pb-16">
        <div className="panel p-4 sm:p-6">
          {/* Panel tahap aktif + progres alur -- memberi rasa "sudah sejauh mana". */}
          <div className="mb-5 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary-tint to-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-primary/70">
                  {allDone ? 'Alur selesai' : 'Tahap aktif'}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${allDone ? 'bg-success' : 'bg-accent'}`} />
                  <span className="text-base font-bold text-primary-dark">{allDone ? 'Seluruh tahap tuntas' : activeStageLabel}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold leading-none text-primary">
                  {completedCount}<span className="text-base font-semibold text-slate-400">/{totalStages}</span>
                </p>
                <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500">tahap selesai</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-inset ring-border">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-success' : 'bg-gradient-to-r from-accent to-primary'}`}
                style={{ width: `${Math.max(progressPct, 4)}%` }}
              />
            </div>
            <p className="mt-2.5 text-xs leading-5 text-slate-500">Setiap tahap mengisi data, tahap berikutnya mengecek dengan aksi Terima atau Tolak. Pengadaan &amp; Keuangan dikerjakan langsung di sini; Operasi &amp; Gudang dilanjutkan di halaman masing-masing.</p>
          </div>

          {actionError && <div className="alert-danger mb-4">{actionError}</div>}

          <RiwayatPenolakanPanel items={transaksi.riwayat_penolakan ?? []} />

          <ol className="relative space-y-3 before:absolute before:left-4 before:top-5 before:h-[calc(100%-2.5rem)] before:w-px before:bg-border">
            {activeStages.map((stage, index) => {
              const data = stage.id === 'pengadaan' || stage.id === 'keuangan'
                ? poStageData(po, stage.id)
                : stage.dataKeys.map((key) => transaksi[key] as StageData | null).find(Boolean) ?? null
              const isPendingReview = !!data && data.status === 'menunggu_review'
              const isRejected = stage.id !== 'pengadaan' && stage.id !== 'keuangan' && !!data && data.status === 'ditolak'
              // Tahap PO (pengadaan/keuangan) diturunkan dari STATUS PO + role, bukan current_stage,
              // karena current_stage transaksi sudah pindah ke 'keuangan' begitu PO dibuat.
              const isComplete = stage.id === 'pengadaan' ? pengadaanComplete
                : stage.id === 'keuangan' ? keuanganComplete
                : stage.id === 'makloon_terima' ? transaksi.data_makloon_mpp?.status === 'diterima'
                : (!!data && data.status === 'diterima')
              const isCurrent = stage.id === 'pengadaan' ? pengadaanCurrent
                : stage.id === 'keuangan' ? keuanganCurrent
                : (transaksi.current_stage === stage.id || isPendingReview || (stage.id === pendingData?.stageId))
              const isFuture = stage.id === 'pengadaan' ? (!po && !pengadaanCurrent && !pengadaanComplete)
                : stage.id === 'keuangan' ? (!keuanganCurrent && !keuanganComplete)
                : (currentIndex >= 0 && index > currentIndex && !data)
              const canReviewThis = canAct && !!pendingData?.data && stage.id === pendingData.stageId
              const showJemputPanganForm = stage.id === 'jemput_pangan' && canFillJemputPangan
              const showMakloonForm = (stage.id === 'makloon' || stage.id === 'makloon_kirim') && canFillMakloon
              const showUbForm = stage.id === 'ub_jastasma' && canFillUb
              const showPengadaanCombine = stage.id === 'pengadaan' && showCombine
              const showPengadaanIn = stage.id === 'pengadaan' && showIsiIn
              const showKeuanganReviewCard = stage.id === 'keuangan' && showKeuanganReview
              const showKeuanganBayar = stage.id === 'keuangan' && showBayar
              const showPoPanel = showPengadaanCombine || showPengadaanIn || showKeuanganReviewCard || showKeuanganBayar
              const blockedByPendingPrevious = isCurrent && !!pendingData?.data && stage.id !== pendingData.stageId && !showPoPanel

              return (
                <li key={stage.id} className="relative pl-12">
                  <span
                    className={`absolute left-0 top-0.5 grid h-8 w-8 place-items-center rounded-full border transition-all ${
                      isComplete
                        ? 'border-success bg-success text-white'
                        : isCurrent
                          ? 'border-accent bg-white text-accent ring-4 ring-accent/15'
                          : 'border-border bg-white text-slate-300'
                    }`}
                  >
                    {isComplete ? (
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 10.5 8.5 14 15 6.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 18 18" className="h-[0.95rem] w-[0.95rem]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        {STAGE_ICONS[stage.id] ?? <circle cx="9" cy="9" r="2.5" />}
                      </svg>
                    )}
                  </span>
                  <section className={`rounded-xl p-4 transition-all ${isCurrent ? 'border border-accent/40 bg-white shadow-md shadow-primary/5 ring-1 ring-accent/10' : isFuture ? 'border border-transparent bg-white/50 text-gray-300' : 'border border-border bg-surface'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="section-title">{stage.label}{isCurrent && !isPendingReview && !showJemputPanganForm && !showMakloonForm && !showUbForm && !showPoPanel ? ' - sedang berjalan' : ''}</h2>
                        <p className="mt-1 text-xs text-gray-500">{isComplete ? `Diterima oleh ${stage.owner}${data?.locked_at ? ' - ' + formatDateTime(String(data.locked_at)) : ''}` : isPendingReview ? `Menunggu dicek oleh ${STAGES.find((s) => s.id === transaksi.current_stage)?.owner ?? transaksi.current_stage}` : showJemputPanganForm || showMakloonForm || showUbForm ? 'Giliran Anda mengisi data tahap ini' : showPoPanel ? 'Giliran Anda melanjutkan proses tahap ini' : canReviewThis ? 'Giliran Anda mengecek data tahap sebelumnya' : blockedByPendingPrevious ? 'Terima atau tolak tahap sebelumnya dahulu.' : isFuture ? 'Menunggu tahap sebelumnya' : stage.helper}</p>
                      </div>
                      {isCurrent && (
                        isPendingReview
                          ? <span className="badge shrink-0">Menunggu review</span>
                          : <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[0.6875rem] font-bold text-primary-dark shadow-sm"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary-dark" />Giliran Anda</span>
                      )}
                    </div>

                    {data && (isComplete ? (
                      <CompletedStageDetail
                        data={data}
                        transaksiId={transaksi.id_transaksi}
                        fotoFields={photoFieldsFor(stage.id, transaksi.skema)}
                        expanded={expandedStages.has(stage.id)}
                        onToggle={() => toggleStage(stage.id)}
                      />
                    ) : (
                      <>
                        {!showJemputPanganForm && !showMakloonForm && !showUbForm && <StageReadOnly data={data} collapsed={!isCurrent} />}
                        <FotoLinks transaksiId={transaksi.id_transaksi} fields={photoFieldsFor(stage.id, transaksi.skema)} />
                      </>
                    ))}
                    {isRejected && <div className="alert-danger mt-4">Tahap ini ditolak. Perbaiki data pada role terkait lalu kirim ulang.</div>}
                    {showJemputPanganForm && <JemputPanganForm form={jemputPanganForm} setForm={setJemputPanganForm} mutation={simpanJemputPangan} error={jemputPanganError} fotos={fotosJemputPangan} setFotos={setFotosJemputPangan} progress={progressJemputPangan} fotoGagal={fotoJemputPanganGagal} />}
                    {showMakloonForm && (transaksi.skema === 'MPP' ? <MakloonMppForm form={makloonMppForm} setForm={setMakloonMppForm} mutation={simpanMakloon} error={makloonError} fotos={fotosMakloon} setFotos={setFotosMakloon} progress={progressMakloon} fotoGagal={fotoMakloonGagal} /> : <MakloonTjpForm form={makloonForm} setForm={setMakloonForm} mutation={simpanMakloon} error={makloonError} fotos={fotosMakloon} setFotos={setFotosMakloon} progress={progressMakloon} fotoGagal={fotoMakloonGagal} />)}
                    {showUbForm && <UbForm form={ubForm} setForm={setUbForm} mutation={simpanUb} error={ubError} fotos={fotosUb} setFotos={setFotosUb} progress={progressUb} fotoGagal={fotoUbGagal} />}

                    {canReviewThis && (
                      <ReviewActions
                        stageLabel={stage.label}
                        catatan={catatan}
                        setCatatan={setCatatan}
                        onAccept={() => terima.mutate(stage.label)}
                        onReject={() => tolak.mutate(stage.label)}
                        acceptPending={terima.isPending}
                        rejectPending={tolak.isPending}
                        actionError={actionError}
                      />
                    )}

                    {showPengadaanCombine && (
                      <div className="mt-4 border-t border-border pt-4">
                        <GabungPoForm transaksiList={kandidatResult?.items ?? []} preselectId={transaksi.id_transaksi} onChanged={invalidate} />
                      </div>
                    )}

                    {showPengadaanIn && po && (
                      <div className="mt-4 border-t border-border pt-4">
                        {poRejected && po.catatan_penolakan && (
                          <div className="alert-danger mb-3">Ditolak Keuangan: {po.catatan_penolakan}. Perbaiki lalu kirim ulang.</div>
                        )}
                        <PoInForm po={po} kandidat={kandidatResult?.items ?? []} preselectId={transaksi.id_transaksi} onChanged={invalidate} />
                      </div>
                    )}

                    {showKeuanganReviewCard && po && (
                      <div className="mt-4 border-t border-border pt-4">
                        <PoReviewCard po={po} reviewLabel="Pengadaan" onChanged={invalidate} />
                      </div>
                    )}

                    {showKeuanganBayar && po && (
                      <div className="mt-4 border-t border-border pt-4">
                        <PembayaranForm po={po} onChanged={invalidate} />
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

function RiwayatPenolakanPanel({ items }: { items: RiwayatPenolakan[] }) {
  const [open, setOpen] = useState(items.length > 0)

  if (items.length === 0) return null

  return (
    <section className="mb-5 rounded-lg border border-border bg-white">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen((value) => !value)}>
        <span className="section-title">Riwayat penolakan</span>
        <span className="text-xs font-semibold text-primary">{open ? 'Sembunyikan' : `Lihat ${items.length}`}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-primary-dark">{STAGES.find((stage) => stage.id === item.tahap)?.label ?? item.tahap}</span>
                <span className="text-xs text-gray-500">{formatDateTime(item.ditolak_pada)}</span>
              </div>
              <p className="mt-2 text-gray-700">{item.catatan}</p>
              <p className="mt-2 text-xs text-gray-500">Ditolak oleh {item.ditolak_oleh_nama ?? `User #${item.ditolak_oleh}`}</p>
            </div>
          ))}
        </div>
      )}
    </section>
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

// Tahap yang sudah selesai & terkunci (Bagian 7.4): tampil ringkas (nama tahap +
// diisi siapa + kapan ada di header), detail read-only (field + foto) disembunyikan
// di balik "Lihat detail" supaya timeline tidak penuh.
function CompletedStageDetail({ data, transaksiId, fotoFields, expanded, onToggle }: { data: StageData; transaksiId: string; fotoFields: { key: string; label: string }[]; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="mt-3">
      <button type="button" onClick={onToggle} className="text-xs font-semibold text-primary hover:underline">
        {expanded ? 'Sembunyikan detail' : 'Lihat detail'}
      </button>
      {expanded && (
        <>
          <StageReadOnly data={data} collapsed={false} />
          <FotoLinks transaksiId={transaksiId} fields={fotoFields} />
        </>
      )}
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
          <span className="text-right font-medium text-primary-dark">{formatValue(key, value)}</span>
        </div>
      ))}
      {collapsed && entries.length > 4 && <p className="text-right text-xs text-muted">+{entries.length - 4} field lain</p>}
    </div>
  )
}

function JemputPanganForm({ form, setForm, mutation, error, fotos, setFotos, progress, fotoGagal }: any) {
  const ready = form.id_pemasok && form.supir && form.plat_mobil && form.nama_poktan_gapoktan && form.desa && form.kecamatan && form.kabupaten && form.makloon_user_id && form.tanggal_kirim && form.kuantum && form.jarak_ke_makloon_km
  return (
    <form className="mt-4 @container space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      {error && <div className="alert-danger">{error}</div>}
      {mutation.isSuccess && fotoGagal.length > 0 && <div className="alert-warning">Data tersimpan, tapi {fotoGagal.length} foto gagal terupload.</div>}
      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="ID pemasok"><input required className="input" value={form.id_pemasok} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, id_pemasok: e.target.value }))} /></Field>
        <Field label="Nama Poktan/Gapoktan"><input required className="input" value={form.nama_poktan_gapoktan} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, nama_poktan_gapoktan: e.target.value }))} /></Field>
        <Field label="Supir"><input required className="input" value={form.supir} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, supir: e.target.value }))} /></Field>
        <Field label="Plat mobil"><input required className="input" value={form.plat_mobil} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, plat_mobil: e.target.value }))} /></Field>
        <Field label="Desa"><input required className="input" value={form.desa} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, desa: e.target.value }))} /></Field>
        <Field label="Kecamatan"><input required className="input" value={form.kecamatan} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, kecamatan: e.target.value }))} /></Field>
        <Field label="Kabupaten"><KabupatenSelect value={form.kabupaten} onChange={(value) => setForm((prev: JemputPanganFormState) => ({ ...prev, kabupaten: value }))} /></Field>
        <Field label="Makloon tujuan"><MakloonCombobox value={form.makloon_user_id} onChange={(value) => setForm((prev: JemputPanganFormState) => ({ ...prev, makloon_user_id: value }))} /></Field>
        <Field label="Tanggal kirim"><input required type="date" className="input" value={form.tanggal_kirim} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, tanggal_kirim: e.target.value }))} /></Field>
        <Field label="Kuantum (kg)"><AngkaInput required value={form.kuantum} onChange={(v) => setForm((prev: JemputPanganFormState) => ({ ...prev, kuantum: v }))} /></Field>
        <Field label="Jarak ke Makloon (km)"><input required type="number" step="0.01" min="0" className="input" value={form.jarak_ke_makloon_km} onChange={(e) => setForm((prev: JemputPanganFormState) => ({ ...prev, jarak_ke_makloon_km: e.target.value }))} /></Field>
      </div>
      <DokumenGrid fields={JEMPUT_PANGAN_FOTO_FIELDS} fotos={fotos} setFotos={setFotos} progress={progress} fotoGagal={fotoGagal} />
      <div className="flex justify-end border-t border-border pt-4"><button type="submit" disabled={mutation.isPending || !ready} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim ulang ke Makloon'}</button></div>
    </form>
  )
}

function MakloonMppForm({ form, setForm, mutation, error, fotos, setFotos, progress, fotoGagal }: any) {
  const ready = form.id_pemasok && form.supir && form.plat_mobil && form.desa && form.kecamatan && form.kabupaten && form.tanggal_bongkar && form.kuantum && form.jarak_ke_makloon_km
  return (
    <form className="mt-4 @container space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      {error && <div className="alert-danger">{error}</div>}
      {mutation.isSuccess && fotoGagal.length > 0 && <div className="alert-warning">Data tersimpan, tapi {fotoGagal.length} foto gagal terupload.</div>}
      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="ID pemasok"><input required className="input" value={form.id_pemasok} onChange={(e) => setForm((prev: MakloonMppFormState) => ({ ...prev, id_pemasok: e.target.value }))} /></Field>
        <Field label="Supir"><input required className="input" value={form.supir} onChange={(e) => setForm((prev: MakloonMppFormState) => ({ ...prev, supir: e.target.value }))} /></Field>
        <Field label="Plat mobil"><input required className="input" value={form.plat_mobil} onChange={(e) => setForm((prev: MakloonMppFormState) => ({ ...prev, plat_mobil: e.target.value }))} /></Field>
        <Field label="Desa"><input required className="input" value={form.desa} onChange={(e) => setForm((prev: MakloonMppFormState) => ({ ...prev, desa: e.target.value }))} /></Field>
        <Field label="Kecamatan"><input required className="input" value={form.kecamatan} onChange={(e) => setForm((prev: MakloonMppFormState) => ({ ...prev, kecamatan: e.target.value }))} /></Field>
        <Field label="Kabupaten"><KabupatenSelect value={form.kabupaten} onChange={(value) => setForm((prev: MakloonMppFormState) => ({ ...prev, kabupaten: value }))} /></Field>
        <Field label="Tanggal bongkar"><input required type="date" className="input" value={form.tanggal_bongkar} onChange={(e) => setForm((prev: MakloonMppFormState) => ({ ...prev, tanggal_bongkar: e.target.value }))} /></Field>
        <Field label="Kuantum (kg)"><AngkaInput required value={form.kuantum} onChange={(v) => setForm((prev: MakloonMppFormState) => ({ ...prev, kuantum: v }))} /></Field>
        <Field label="Jarak ke Makloon (km)"><input required type="number" step="0.01" min="0" className="input" value={form.jarak_ke_makloon_km} onChange={(e) => setForm((prev: MakloonMppFormState) => ({ ...prev, jarak_ke_makloon_km: e.target.value }))} /></Field>
      </div>
      <DokumenGrid fields={MAKLOON_MPP_FOTO_FIELDS} fotos={fotos} setFotos={setFotos} progress={progress} fotoGagal={fotoGagal} />
      <div className="flex justify-end border-t border-border pt-4"><button type="submit" disabled={mutation.isPending || !ready} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim ke Makloon Terima'}</button></div>
    </form>
  )
}

function MakloonTjpForm({ form, setForm, mutation, error, fotos, setFotos, progress, fotoGagal }: any) {
  return (
    <form className="mt-4 @container space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      {error && <div className="alert-danger">{error}</div>}
      {mutation.isSuccess && fotoGagal.length > 0 && <div className="alert-warning">Data tersimpan, tapi {fotoGagal.length} foto gagal terupload.</div>}
      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="Tanggal bongkar"><input required type="date" className="input" value={form.tanggal_bongkar} onChange={(e) => setForm((prev: any) => ({ ...prev, tanggal_bongkar: e.target.value }))} /></Field>
        <Field label="Kuantum bongkar (kg)"><AngkaInput required placeholder="0" value={form.kuantum_bongkar} onChange={(v) => setForm((prev: any) => ({ ...prev, kuantum_bongkar: v }))} /></Field>
      </div>
      <DokumenGrid fields={MAKLOON_FOTO_FIELDS} fotos={fotos} setFotos={setFotos} progress={progress} fotoGagal={fotoGagal} />
      <div className="flex justify-end border-t border-border pt-4"><button type="submit" disabled={mutation.isPending || !form.tanggal_bongkar || !form.kuantum_bongkar} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim ke UB Jastasma'}</button></div>
    </form>
  )
}

function UbForm({ form, setForm, mutation, error, fotos, setFotos, progress, fotoGagal }: any) {
  const ready = form.ka1 && form.ka2 && form.ka3 && form.hampa && form.butir_hijau
  return (
    <form className="mt-4 @container space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      {error && <div className="alert-danger">{error}</div>}
      {mutation.isSuccess && fotoGagal.length > 0 && <div className="alert-warning">Data tersimpan, tapi {fotoGagal.length} foto gagal terupload.</div>}
      <div className="grid gap-4 @md:grid-cols-2">
        {(['ka1', 'ka2', 'ka3', 'hampa', 'butir_hijau'] as const).map((key) => <Field key={key} label={labelOf(key)}><input required type="number" step="0.01" min="0" max="100" className="input" value={form[key]} onChange={(e) => setForm((prev: any) => ({ ...prev, [key]: e.target.value }))} /></Field>)}
      </div>
      <DokumenGrid fields={UB_FOTO_FIELDS} fotos={fotos} setFotos={setFotos} progress={progress} fotoGagal={fotoGagal} />
      <div className="flex justify-end border-t border-border pt-4"><button type="submit" disabled={mutation.isPending || !ready} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim ke Pengadaan'}</button></div>
    </form>
  )
}

function DokumenGrid({ fields, fotos, setFotos, progress, fotoGagal }: any) {
  return (
    <div className="@container">
      <div className="section-title mb-2">Dokumen</div>
      <div className="grid gap-4 @md:grid-cols-2">
        {fields.map(({ key, label }: { key: string; label: string }) => <FotoPicker key={key} label={label} file={fotos[key] ?? null} onChange={(file) => setFotos((prev: Record<string, File | null>) => ({ ...prev, [key]: file }))} progress={progress[key]} error={fotoGagal.includes(key) ? 'Gagal terupload' : undefined} />)}
      </div>
    </div>
  )
}

function ReviewActions({ stageLabel, catatan, setCatatan, onAccept, onReject, acceptPending, rejectPending, actionError }: any) {
  const [dialog, setDialog] = useState<null | 'terima' | 'tolak'>(null)
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-3 border-t border-border pt-4">
      <button type="button" onClick={() => setDialog('tolak')} className="btn btn-outline-danger">Tolak</button>
      <button type="button" onClick={() => setDialog('terima')} className="btn btn-primary">Terima &amp; Lanjutkan</button>

      <ConfirmDialog
        open={dialog === 'terima'}
        title="Terima data tahap ini?"
        description={<>Data <strong>{stageLabel}</strong> akan dikunci dan tidak bisa diubah lagi setelah diterima. Lanjutkan?</>}
        confirmLabel="Terima & Lanjutkan"
        confirmVariant="primary"
        loading={acceptPending}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={onAccept}
      />

      <ConfirmDialog
        open={dialog === 'tolak'}
        title="Tolak data tahap ini?"
        description={<>Transaksi akan dikembalikan ke tahap <strong>{stageLabel}</strong> untuk direvisi. Lanjutkan?</>}
        confirmLabel="Kirim Penolakan"
        confirmVariant="danger"
        loading={rejectPending}
        confirmDisabled={!catatan.trim()}
        error={actionError}
        onCancel={() => { setDialog(null); setCatatan('') }}
        onConfirm={onReject}
      >
        <textarea className="input mt-3 min-h-24" placeholder="Catatan penolakan (wajib diisi)" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </ConfirmDialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
