import { useFotoUrl } from '../hooks/useFotoTransaksi'
import { labelFoto } from '../lib/fotoDokumen'

/**
 * Pratinjau satu foto tersimpan. Gambar kecil dimuat lewat konversi thumb (backend jatuh ke
 * berkas asli bila konversinya belum dibuat queue), sedangkan berkas ukuran penuh baru diminta
 * saat diklik -- supaya membuka daftar foto tidak menarik semua file besar sekaligus.
 * Slot yang fotonya tidak bisa diakses role ini (atau belum ada) tidak dirender sama sekali.
 */
export default function FotoThumb({
  transaksiId,
  jenisFoto,
  label,
  size = 'md',
}: {
  transaksiId: string
  jenisFoto: string
  label?: string
  size?: 'sm' | 'md'
}) {
  const { data: thumb, isError } = useFotoUrl(transaksiId, jenisFoto, true, 'thumb')
  const { data: asli, refetch } = useFotoUrl(transaksiId, jenisFoto, false)

  const teks = label ?? labelFoto(jenisFoto)
  const kotak = size === 'sm' ? 'h-20 w-20' : 'h-24 w-24'

  const buka = async () => {
    const url = asli ?? (await refetch()).data
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (isError) return null

  return (
    <button
      type="button"
      onClick={buka}
      title={`Buka ${teks} ukuran penuh`}
      className={`group ${size === 'sm' ? 'w-20' : 'w-24'} shrink-0 text-left`}
    >
      <span className={`relative block ${kotak} overflow-hidden rounded-lg border border-border bg-surface`}>
        {thumb
          ? <img src={thumb} alt={teks} loading="lazy" className={`${kotak} object-cover transition-transform group-hover:scale-105`} />
          : <span className="grid h-full w-full place-items-center text-[0.6rem] text-muted">memuat...</span>}
      </span>
      <span className="mt-1 block truncate text-[0.65rem] leading-tight text-gray-500">{teks}</span>
    </button>
  )
}
