import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { TransaksiListItem } from '../hooks/useTransaksiList'
import { kunciTransaksi, tanggalTransaksi } from '../lib/transaksiKunci'
import { formatDate, formatNumber } from '../lib/poFormat'
import { HIDDEN_FIELDS, formatValue, labelOf } from '../lib/stageField'
import { useDokumenTransaksi, type FotoTersimpan } from '../hooks/useFotoTransaksi'
import FotoThumb from './FotoThumb'
import ModalPortal from './ModalPortal'

// MPP: surat jalan & nota timbang milik tahap Makloon Terima, sisanya Makloon Kirim
// (mirror DataMakloonMpp::FOTO_TAHAP_TERIMA di backend).
const FOTO_MAKLOON_TERIMA = ['foto_surat_jalan', 'foto_nota_timbang']

/** Foto mana milik tahap mana -- backend hanya menandai role pemiliknya. */
function fotoTahap(t: TransaksiListItem, stageId: string, dokumen: FotoTersimpan[]) {
  return dokumen.filter(({ jenis_foto, role }) => {
    if (role === 'jemput_pangan') return stageId === 'jemput_pangan'
    if (role === 'ub_jastasma') return stageId === 'ub_jastasma'
    if (role !== 'makloon') return false
    if (t.skema === 'TJP') return stageId === 'makloon'
    return FOTO_MAKLOON_TERIMA.includes(jenis_foto) ? stageId === 'makloon_terima' : stageId === 'makloon_kirim'
  })
}


// Lima tahap timeline transaksi per skema (timeline berhenti di Keuangan).
const TAHAP: Record<'TJP' | 'MPP', { id: string; label: string }[]> = {
  TJP: [
    { id: 'jemput_pangan', label: 'Jemput Pangan' },
    { id: 'makloon', label: 'Makloon' },
    { id: 'ub_jastasma', label: 'UB Jastasma' },
    { id: 'pengadaan', label: 'Pengadaan' },
    { id: 'keuangan', label: 'Keuangan' },
  ],
  MPP: [
    { id: 'makloon_kirim', label: 'Makloon Kirim' },
    { id: 'makloon_terima', label: 'Makloon Terima' },
    { id: 'ub_jastasma', label: 'UB Jastasma' },
    { id: 'pengadaan', label: 'Pengadaan' },
    { id: 'keuangan', label: 'Keuangan' },
  ],
}

/** Baris data per tahap, untuk menandai tahap yang ditolak (bukan sekadar belum sampai). */
function statusDataTahap(t: TransaksiListItem, stageId: string): string | undefined {
  if (stageId === 'jemput_pangan') return t.data_jemput_pangan?.status
  if (stageId === 'makloon') return t.data_makloon_tjp?.status
  if (stageId === 'makloon_kirim' || stageId === 'makloon_terima') return t.data_makloon_mpp?.status
  if (stageId === 'ub_jastasma') return t.data_ub_jastasma?.status
  if (stageId === 'pengadaan') return t.data_pengadaan?.review_status ?? undefined
  if (stageId === 'keuangan') return t.data_pengadaan?.data_keuangan?.review_status ?? undefined
  return undefined
}

/**
 * Isi data satu tahap, langsung dari payload daftar transaksi (tidak perlu request detail).
 * Makloon Terima tidak punya tabel sendiri: yang miliknya di record MPP hanya kuantum bongkar,
 * sisanya sudah tampil di Makloon Kirim, jadi tidak diulang. Tahap Pengadaan & Keuangan tidak
 * ikut dimuat di endpoint daftar (datanya level PO), jadi memang kosong di sini.
 */
function dataTahap(t: TransaksiListItem, stageId: string): [string, unknown][] {
  const ambil = (obj: unknown) =>
    Object.entries((obj ?? {}) as Record<string, unknown>).filter(([key]) => !HIDDEN_FIELDS.has(key))

  if (stageId === 'jemput_pangan') return ambil(t.data_jemput_pangan)
  if (stageId === 'makloon') return ambil(t.data_makloon_tjp)
  if (stageId === 'makloon_kirim') return ambil(t.data_makloon_mpp).filter(([key]) => key !== 'kuantum_bongkar')
  if (stageId === 'makloon_terima') {
    const kuantumBongkar = t.data_makloon_mpp?.kuantum_bongkar
    return kuantumBongkar === null || kuantumBongkar === undefined ? [] : [['kuantum_bongkar', kuantumBongkar]]
  }
  if (stageId === 'ub_jastasma') return ambil(t.data_ub_jastasma)
  return []
}

/**
 * Pop-up ringkas progres 5 tahap sebuah transaksi. Dipakai Pengadaan saat memilih transaksi
 * untuk digabung jadi PO -- supaya bisa mengintip posisi tahapnya tanpa meninggalkan halaman.
 * Status tahap diturunkan dari posisi terhadap `current_stage`; tahap yang datanya berstatus
 * ditolak ditandai khusus karena posisinya saja tidak menunjukkan itu.
 */
export default function TahapDialog({ transaksi, onClose }: { transaksi: TransaksiListItem | null; onClose: () => void }) {
  const { data: dokumen = [] } = useDokumenTransaksi(transaksi?.id_transaksi)

  useEffect(() => {
    if (!transaksi) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [transaksi, onClose])

  if (!transaksi) return null

  const tahap = TAHAP[transaksi.skema]
  const currentIndex = tahap.findIndex((s) => s.id === transaksi.current_stage)
  const kunci = kunciTransaksi(transaksi)

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Progres tahap ${transaksi.id_transaksi}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="my-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-primary-dark">{transaksi.id_transaksi}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {transaksi.skema} · {transaksi.nama_maklon ?? 'Tanpa makloon'} · {kunci.id_pemasok ?? '-'} · {formatDate(tanggalTransaksi(transaksi))}
              {kunci.kuantum ? ` · ${formatNumber(kunci.kuantum)} kg` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost border border-border px-2 py-1 text-xs">Tutup</button>
        </div>

        <ol className="mt-4 space-y-3">
          {tahap.map((stage, index) => {
            const ditolak = statusDataTahap(transaksi, stage.id) === 'ditolak'
            const selesai = !ditolak && currentIndex >= 0 && index < currentIndex
            const berjalan = !ditolak && index === currentIndex
            const isi = dataTahap(transaksi, stage.id)
            const foto = fotoTahap(transaksi, stage.id, dokumen)
            return (
              <li key={stage.id}>
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.68rem] font-bold ${
                      ditolak ? 'bg-danger-bg text-danger'
                        : selesai ? 'bg-success text-white'
                        : berjalan ? 'bg-accent text-primary-dark'
                        : 'bg-surface text-slate-400 ring-1 ring-inset ring-border'
                    }`}
                  >
                    {selesai ? '✓' : index + 1}
                  </span>
                  <span className={`text-sm ${berjalan ? 'font-bold text-primary-dark' : selesai ? 'text-gray-600' : 'text-slate-400'}`}>
                    {stage.label}
                  </span>
                  {ditolak && <span className="badge-danger text-[0.68rem]">Ditolak</span>}
                  {berjalan && <span className="badge text-[0.68rem]">Tahap aktif</span>}
                </div>
                {isi.length > 0 && (
                  <dl className="ml-9 mt-1.5 grid gap-x-5 gap-y-1 rounded-lg bg-surface px-3 py-2 text-xs sm:grid-cols-2">
                    {isi.map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-4 border-t border-border/60 pt-1">
                        <dt className="text-gray-500">{labelOf(key)}</dt>
                        <dd className="text-right font-medium text-primary-dark">{formatValue(key, value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {foto.length > 0 && (
                  <div className="ml-9 mt-2 flex flex-wrap gap-2">
                    {foto.map((item) => (
                      <FotoThumb key={item.jenis_foto} transaksiId={transaksi.id_transaksi} jenisFoto={item.jenis_foto} thumbUrl={item.thumb_url} />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>

        <div className="mt-5 flex justify-end">
          {/* onClose WAJIB: berpindah dari /transaksi/A ke /transaksi/B memakai komponen route
              yang sama, jadi dialog ini tidak ikut ter-unmount. Tanpa menutupnya, halaman tujuan
              memang sudah termuat tapi tertutup penuh oleh dialog -- terlihat seperti tombolnya
              tidak mengarah ke mana pun. */}
          <Link
            to={`/transaksi/${encodeURIComponent(transaksi.id_transaksi)}`}
            onClick={onClose}
            className="btn btn-ghost border border-border"
          >
            Buka halaman transaksi
          </Link>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
