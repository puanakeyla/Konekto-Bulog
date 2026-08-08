import { useEffect } from 'react'
import { useFotoPengolahanUrl } from '../hooks/useFotoTransaksi'
import { bukaTabBaru } from '../lib/bukaTabBaru'
import { labelFoto } from '../lib/fotoDokumen'
import ModalPortal from './ModalPortal'

/**
 * Galeri dokumen satu pengolahan, padanan DokumenGaleriModal pada alur SerGab.
 *
 * Sengaja TIDAK memakai endpoint daftar seperti SerGab: rantai pengolahan cuma punya dua slot
 * foto tetap (nota timbang + LHPK), jadi menembak dua link langsung lebih murah daripada
 * menambah endpoint baru. `enabled` mematikan slot yang datanya memang belum ada supaya tidak
 * ada request yang pasti 404.
 */
export type SlotDokumen = { jenisFoto: 'foto_notim' | 'foto_lhpk'; tahap: string; ada: boolean }

export default function DokumenPengolahanModal({
  idPengolahan,
  slots,
  onClose,
}: {
  idPengolahan: string
  slots: SlotDokumen[]
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-primary-dark via-primary to-primary-dark px-6 py-5 text-white">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-accent">Dokumen Pengolahan</p>
              <h2 className="mt-1 text-2xl font-extrabold">{idPengolahan}</h2>
              <p className="mt-1 text-sm text-white/70">Lihat atau unduh foto tahap yang boleh Anda akses.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-bold transition-colors hover:bg-white/20">
              Tutup
            </button>
          </div>

          <div className="overflow-y-auto bg-surface px-6 py-5">
            {slots.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">Belum ada dokumen</div>
                <p className="empty-copy">Pengolahan ini belum punya foto yang dapat Anda lihat.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {slots.map((slot) => (
                  <KartuDokumen key={slot.jenisFoto} idPengolahan={idPengolahan} slot={slot} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function KartuDokumen({ idPengolahan, slot }: { idPengolahan: string; slot: SlotDokumen }) {
  const { data: thumb } = useFotoPengolahanUrl(idPengolahan, slot.jenisFoto, slot.ada, 'thumb')
  const { data: asli, refetch } = useFotoPengolahanUrl(idPengolahan, slot.jenisFoto, false)
  const label = `${slot.tahap} — ${labelFoto(slot.jenisFoto)}`

  return (
    <div className="panel panel-pad">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.06em] text-muted">{label}</p>
      {thumb ? (
        <button type="button" onClick={() => bukaTabBaru(async () => asli ?? (await refetch()).data)} className="group mt-2 block w-full text-left">
          <span className="block h-40 w-full overflow-hidden rounded-lg border border-border bg-surface">
            <img src={thumb} alt={label} loading="lazy" className="h-40 w-full object-cover transition-transform group-hover:scale-105" />
          </span>
          <span className="mt-2 block text-xs font-semibold text-primary">Buka ukuran penuh</span>
        </button>
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-sm text-muted">
          Belum diunggah.
        </p>
      )}
    </div>
  )
}
