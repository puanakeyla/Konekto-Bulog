import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { formatNumber } from '../lib/poFormat'
import { useOperasiList, type PermintaanOperasi } from '../hooks/useOperasiList'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'

export default function PengadaanPage() {
  const { data: operasiResult, isLoading: loadingOperasi } = useOperasiList()

  // Halaman ini KHUSUS keputusan pengeluaran stok (OUT). Penggabungan PO & pengisian
  // nomor IN dikerjakan langsung dari timeline transaksi, jadi tidak diduplikasi di sini.
  const permintaan = operasiResult?.items ?? []
  const permintaanMenunggu = permintaan.filter((i) => i.status_out === 'menunggu_pengadaan')
  const sudahDikeluarkan = permintaan.filter((i) => i.status_out === 'dikeluarkan')
  const dikembalikan = permintaan.filter((i) => i.status_out === 'dikembalikan')
  const totalDiminta = permintaanMenunggu.reduce((sum, i) => sum + Number(i.gabah_diolah_kg || 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role Pengadaan"
        title="Keputusan Pengeluaran Stok"
        subtitle="Putuskan permintaan pengeluaran stok dari Operasi: keluarkan dengan menerbitkan No. OUT, atau kembalikan dengan catatan."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu keputusan</div><div className="stat-value">{permintaanMenunggu.length}</div></div>
            <div className="stat-card"><div className="stat-label">Gabah diminta (kg)</div><div className="stat-value">{formatNumber(totalDiminta)}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah dikeluarkan</div><div className="stat-value">{sudahDikeluarkan.length}</div></div>
            <div className="stat-card"><div className="stat-label">Dikembalikan</div><div className="stat-value">{dikembalikan.length}</div></div>
          </div>


          <section className="panel panel-pad @container">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">Keputusan Pengeluaran Stok (OUT)</h2><p className="page-subtitle">Permintaan Operasi: keluarkan dengan mengisi No. OUT, atau kembalikan dengan catatan.</p></div>
              <span className="badge badge-warning">{permintaanMenunggu.length} menunggu</span>
            </div>

            {loadingOperasi && <SkeletonPoCards />}
            {!loadingOperasi && permintaanMenunggu.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada permintaan OUT</div><p className="empty-copy">Permintaan muncul setelah Operasi mengajukan pengeluaran stok.</p></div>
            )}

            <div className="space-y-4">{permintaanMenunggu.map((item) => <OutApprovalForm key={item.id} item={item} />)}</div>
          </section>
      </div>
    </div>
  )
}

type Keputusan = '' | 'dikeluarkan' | 'dikembalikan'

// Keputusan Pengadaan atas SATU permintaan pengeluaran stok dari Operasi (modul mandiri).
function OutApprovalForm({ item }: { item: PermintaanOperasi }) {
  const queryClient = useQueryClient()
  const [keputusan, setKeputusan] = useState<Keputusan>('')
  const [noOut, setNoOut] = useState('')
  const [catatan, setCatatan] = useState('')
  const [confirmOut, setConfirmOut] = useState(false)

  const valid = keputusan === 'dikeluarkan' ? !!noOut.trim() : keputusan === 'dikembalikan' ? !!catatan.trim() : false

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/operasi/${item.id}/out`,
        keputusan === 'dikeluarkan'
          ? { keputusan: 'dikeluarkan', no_out: noOut }
          : { keputusan: 'dikembalikan', catatan },
      ),
    onSuccess: () => {
      setConfirmOut(false)
      queryClient.invalidateQueries({ queryKey: ['operasi-list'] })
      toast.success(
        keputusan === 'dikeluarkan'
          ? `Nomor OUT ${noOut} dikirim ke Operasi.`
          : 'Permintaan dikembalikan ke Operasi.',
      )
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan keputusan OUT.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmOut(true) }}>
      <div className="po-card-header">
        <div>
          <div className="po-title">Permintaan {formatNumber(item.gabah_diolah_kg)} kg gabah</div>
          <div className="po-meta">
            Diajukan {new Date(item.created_at).toLocaleDateString('id-ID')}
            {item.creator ? ` oleh ${item.creator.username}` : ''}
          </div>
        </div>
        <span className="badge badge-warning">Menunggu keputusan</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setKeputusan('dikeluarkan')} className={`btn ${keputusan === 'dikeluarkan' ? 'btn-primary' : 'btn-ghost border border-border bg-white'}`}>Dikeluarkan</button>
        <button type="button" onClick={() => setKeputusan('dikembalikan')} className={`btn ${keputusan === 'dikembalikan' ? 'btn-danger' : 'btn-ghost border border-border bg-white'}`}>Dikembalikan</button>
      </div>

      {keputusan === 'dikeluarkan' && (
        <label className="mt-3 block max-w-sm">
          <span className="label">Nomor OUT</span>
          <input className="input" placeholder="Masukkan nomor OUT" value={noOut} onChange={(e) => setNoOut(e.target.value)} />
        </label>
      )}
      {keputusan === 'dikembalikan' && (
        <label className="mt-3 block">
          <span className="label">Catatan pengembalian</span>
          <textarea className="input min-h-16" placeholder="Alasan dikembalikan ke Operasi" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </label>
      )}

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={!valid || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Mengirim...' : 'Kirim Keputusan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOut}
        title="Kirim keputusan OUT?"
        description={
          keputusan === 'dikeluarkan'
            ? <>Permintaan <strong>{formatNumber(item.gabah_diolah_kg)} kg</strong> akan <strong>dikeluarkan</strong> dengan No. OUT <strong>{noOut}</strong>. Operasi lanjut mengisi hasil produksi. Lanjutkan?</>
            : <>Permintaan <strong>{formatNumber(item.gabah_diolah_kg)} kg</strong> akan <strong>dikembalikan</strong> ke Operasi untuk diajukan ulang. Lanjutkan?</>
        }
        confirmLabel="Kirim Keputusan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
