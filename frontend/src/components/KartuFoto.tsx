import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { pesanKegagalan } from '../lib/api'
import { bukaTabBaru } from '../lib/bukaTabBaru'

/**
 * Satu kartu foto: pratinjau + tombol aksinya. SATU bentuk untuk semua tempat foto tampil --
 * galeri Rekap Sergab, galeri Rekap Pengolahan, dan panel dokumen di dalam kedua modal edit.
 * Dulu tiap tempat punya kartunya sendiri, dan panel edit malah tanpa pratinjau sama sekali,
 * sehingga mengganti foto berarti menebak file mana yang sedang dilihat.
 *
 * Kartu ini TIDAK tahu endpoint mana pun: pemanggil yang mengoper cara mengambil URL aslinya dan
 * (kalau boleh) cara mengganti/menghapus, karena rantai Sergab dan Pengolahan memakai jalur API
 * yang berbeda. Tombol Ganti & Hapus muncul hanya kalau callback-nya diberikan.
 */
type Props = {
  label: string
  /** Penanda kecil di kanan label, mis. tahap pemilik foto. */
  badge?: string
  /** URL pratinjau (biasanya konversi 'thumb'). Null berarti fotonya belum ada. */
  thumbUrl?: string | null
  /** URL bertanda tangan untuk ukuran penuh -- dipakai Lihat, Download, dan cadangan pratinjau. */
  ambilAsli: (opts?: { download?: boolean }) => Promise<string | undefined>
  onGanti?: (file: File) => Promise<void>
  onHapus?: () => Promise<void>
}

type Busy = 'lihat' | 'download' | 'ganti' | 'hapus' | null

export default function KartuFoto({ label, badge, thumbUrl, ambilAsli, onGanti, onHapus }: Props) {
  // Thumbnail digenerate lewat queue; di dev tanpa worker berkas 'thumb' bisa belum ada. Karena
  // itu kalau <img> gagal termuat, pratinjaunya jatuh ke gambar ukuran penuh.
  const [urlAsli, setUrlAsli] = useState<string | null>(null)
  const [gagalTampil, setGagalTampil] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const src = urlAsli ?? thumbUrl ?? null

  // Foto baru (setelah Ganti/Hapus, thumbUrl-nya berganti) berhak dicoba dari nol: tanpa ini
  // kartu yang tadinya gagal termuat akan terus menampilkan "Pratinjau tidak tersedia".
  useEffect(() => {
    setUrlAsli(null)
    setGagalTampil(false)
  }, [thumbUrl])

  const jalankan = async (tanda: Exclude<Busy, null>, aksi: () => Promise<unknown>, gagal: string) => {
    setBusy(tanda)
    try {
      await aksi()
    } catch (err) {
      toast.error(pesanKegagalan(err) ?? gagal)
    } finally {
      setBusy(null)
    }
  }

  const pratinjauGagal = async () => {
    if (urlAsli) {
      setGagalTampil(true)
      return
    }
    try {
      const url = await ambilAsli()
      if (url) setUrlAsli(url)
      else setGagalTampil(true)
    } catch {
      setGagalTampil(true)
    }
  }

  // Unduhan tidak kena popup blocker: <a download> yang diklik programatis bukan popup.
  const unduh = () => jalankan('download', async () => {
    const url = await ambilAsli({ download: true })
    if (!url) throw new Error('kosong')
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, 'Dokumen tidak dapat diunduh.')

  const lihat = () => jalankan('lihat', () => bukaTabBaru(() => ambilAsli()), 'Dokumen tidak dapat dibuka.')

  const ganti = (file: File | null) => {
    if (!file || !onGanti) return
    return jalankan('ganti', async () => {
      await onGanti(file)
      toast.success(`${label} diperbarui.`)
    }, 'Gagal mengganti dokumen.')
  }

  const hapus = () => {
    if (!onHapus || !window.confirm(`Hapus ${label}?`)) return
    return jalankan('hapus', async () => {
      await onHapus()
      toast.success(`${label} dihapus.`)
    }, 'Gagal menghapus dokumen.')
  }

  const ada = !!thumbUrl || !!urlAsli

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      {/* Tinggi TETAP, bukan rasio: kartu ini dipakai di grid selebar 2 kolom sampai 3 kolom, dan
          dengan aspect-ratio kartu di grid 2 kolom membengkak sampai menelan seluruh modal edit.
          object-cover tetap membuat gambarnya terisi penuh berapa pun lebar kolomnya. */}
      <div className="flex h-40 items-center justify-center bg-slate-100">
        {!src || gagalTampil ? (
          <span className="px-3 text-center text-xs font-semibold text-slate-400">
            {gagalTampil ? 'Pratinjau tidak tersedia' : 'Belum diunggah'}
          </span>
        ) : (
          <img src={src} alt={label} loading="lazy" className="h-full w-full object-cover" onError={pratinjauGagal} />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold text-primary-dark">{label}</span>
          {badge && <span className="shrink-0 rounded bg-primary-tint px-2 py-0.5 text-[0.6rem] font-bold uppercase text-primary">{badge}</span>}
        </div>
        {/* Grid 2 kolom, bukan flex-wrap: jumlah tombolnya berubah-ubah (2 di galeri baca-saja,
            3 untuk pemegang jatah, 4 untuk admin) dan flex-wrap membuat sisanya jatuh sebagai
            baris ragged selebar penuh. Grid selalu rapi berapa pun jumlahnya. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {/* Tombol yang butuh fotonya ada dimatikan saat slotnya masih kosong -- kalau tidak,
              satu-satunya jawaban server adalah 404 yang muncul sebagai toast gagal. */}
          <button type="button" onClick={lihat} disabled={!ada || busy === 'lihat'} className="btn btn-ghost border border-border bg-white px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'lihat' ? 'Membuka...' : 'Lihat'}
          </button>
          <button type="button" onClick={unduh} disabled={!ada || busy === 'download'} className="btn btn-ghost border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs text-primary disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'download' ? 'Mengunduh...' : 'Download'}
          </button>
          {onGanti && (
            <label className="btn btn-ghost cursor-pointer justify-center border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs text-primary">
              {busy === 'ganti' ? 'Mengunggah...' : ada ? 'Ganti' : 'Unggah'}
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                disabled={busy === 'ganti'}
                onChange={(event) => {
                  ganti(event.target.files?.[0] ?? null)
                  // Memilih file yang sama dua kali berturut-turut tidak memicu onChange kalau
                  // nilainya tidak dikosongkan -- percobaan ulang setelah gagal jadi diam saja.
                  event.target.value = ''
                }}
              />
            </label>
          )}
          {onHapus && (
            <button type="button" onClick={hapus} disabled={!ada || busy === 'hapus'} className="btn btn-ghost border border-danger/20 bg-danger-bg px-3 py-1.5 text-xs text-danger disabled:cursor-not-allowed disabled:opacity-50">
              {busy === 'hapus' ? 'Menghapus...' : 'Hapus'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
