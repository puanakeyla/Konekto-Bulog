import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useKandidatMo, type PengolahanItem } from '../hooks/usePengolahan'
import { useMoList, useMoMutations, type MoItem, type StatusMo } from '../hooks/useMo'
import { pesanError } from '../lib/pesanError'

const CONTOH_NOMOR = 'MO/00832/02/2026/ADA08001'

function angka(value: string | null | undefined) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
}

function StatusMoBadge({ mo }: { mo: MoItem }) {
  if (mo.status === 'dibatalkan') return <span className="badge badge-danger">Dibatalkan</span>
  if (mo.status === 'lengkap') return <span className="badge badge-success">Selesai</span>
  const map: Record<string, string> = {
    draft: 'badge',
    menunggu_review: 'badge badge-warning',
    diterima: 'badge badge-success',
    ditolak: 'badge badge-danger',
  }
  const label: Record<string, string> = {
    draft: 'Draft di Operasi',
    menunggu_review: 'Menunggu Pengadaan',
    diterima: 'Diterima, isi OUT',
    ditolak: 'Ditolak Pengadaan',
  }
  return <span className={map[mo.review_status]}>{label[mo.review_status]}</span>
}

export default function MoPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const isOperasi = role === 'operasi' || role === 'admin'
  const isPengadaan = role === 'pengadaan' || role === 'admin'

  const [status, setStatus] = useState<StatusMo | 'semua'>('semua')
  const [search, setSearch] = useState('')
  const [pilih, setPilih] = useState<string[]>([])
  const [cariLhpk, setCariLhpk] = useState('')
  const [filterMakloon, setFilterMakloon] = useState('')
  const [nomor, setNomor] = useState({ no_mo: '', no_tm_ada: '', no_tm_gudang: '' })
  const [editId, setEditId] = useState<number | null>(null)
  const [outForm, setOutForm] = useState<Record<number, { no_out: string; tanggal_out: string }>>({})
  const [catatan, setCatatan] = useState<Record<number, string>>({})

  const { data: kandidat } = useKandidatMo()
  const { data: daftar, isLoading } = useMoList({ status, search })
  const { gabungkan, ubahAnggota, kirim, batalkan, terima, tolak, isiOut } = useMoMutations()

  // Anggota MO yang sedang diedit ikut jadi kandidat -- tanpa ini baris yang sudah tergabung
  // hilang dari tabel dan mustahil dipertahankan saat menyimpan.
  const moEdit = editId ? daftar?.data.find((m) => m.id === editId) : null
  const barisEdit = useMemo(
    () => (moEdit?.mo_detail ?? []).map((d) => d.transaksi_pengolahan).filter((t): t is PengolahanItem => !!t),
    [moEdit],
  )

  const semuaKandidat = useMemo(() => {
    const map = new Map<string, PengolahanItem>()
    for (const item of [...(kandidat ?? []), ...barisEdit]) map.set(item.id_pengolahan, item)
    return Array.from(map.values())
  }, [kandidat, barisEdit])

  const makloonTerpilih = useMemo(() => {
    const pertama = semuaKandidat.find((item) => pilih.includes(item.id_pengolahan))
    return pertama?.makloon_user_id ?? null
  }, [semuaKandidat, pilih])

  const kandidatTampil = semuaKandidat.filter((item) => {
    const cocokCari = !cariLhpk || (item.data_lhpk?.no_lhpk ?? '').toLowerCase().includes(cariLhpk.toLowerCase())
    const cocokMakloon = !filterMakloon || String(item.makloon_user_id) === filterMakloon
    return cocokCari && cocokMakloon
  })

  const opsiMakloon = Array.from(
    new Map(semuaKandidat.map((item) => [item.makloon_user_id, item.makloon?.nama_maklon ?? '-'])).entries(),
  )

  const total = semuaKandidat
    .filter((item) => pilih.includes(item.id_pengolahan))
    .reduce(
      (acc, item) => ({
        gabah: acc.gabah + Number(item.data_lhpk?.kuantum_gabah_diolah ?? 0),
        hgl: acc.hgl + Number(item.data_lhpk?.kuantum_beras_hgl ?? 0),
      }),
      { gabah: 0, hgl: 0 },
    )

  const resetPanel = () => {
    setPilih([])
    setNomor({ no_mo: '', no_tm_ada: '', no_tm_gudang: '' })
    setEditId(null)
  }

  const mulaiEdit = (mo: MoItem) => {
    setEditId(mo.id)
    setPilih((mo.mo_detail ?? []).map((d) => d.transaksi_pengolahan?.id_pengolahan ?? '').filter(Boolean))
    setNomor({ no_mo: mo.no_mo, no_tm_ada: mo.no_tm_ada ?? '', no_tm_gudang: mo.no_tm_gudang ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const simpanGabungan = (e: React.FormEvent) => {
    e.preventDefault()

    if (editId) {
      ubahAnggota.mutate(
        { id: editId, pengolahan_ids: pilih },
        { onSuccess: () => { toast.success('Anggota MO diperbarui.'); resetPanel() }, onError: (err) => toast.error(pesanError(err)) },
      )
      return
    }

    gabungkan.mutate(
      {
        pengolahan_ids: pilih,
        no_mo: nomor.no_mo,
        no_tm_ada: nomor.no_tm_ada || null,
        no_tm_gudang: nomor.no_tm_gudang || null,
      },
      { onSuccess: (mo) => { toast.success(`MO ${mo.no_mo} dibuat.`); resetPanel() }, onError: (err) => toast.error(pesanError(err)) },
    )
  }

  const aksi = (fn: { mutate: (v: never, o: object) => void }, nilai: unknown, pesan: string) =>
    fn.mutate(nilai as never, {
      onSuccess: () => toast.success(pesan),
      onError: (err: unknown) => toast.error(pesanError(err)),
    })

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="section-title">Movement Order (MO)</h1>
        <p className="page-subtitle">
          Operasi menggabungkan LHPK satu makloon jadi satu MO; Pengadaan memeriksanya lalu menerbitkan Nomor OUT.
        </p>
      </div>

      {isOperasi && (
        <form onSubmit={simpanGabungan} className="panel panel-pad mb-8">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">{editId ? 'Ubah anggota MO' : 'Gabungkan LHPK jadi MO'}</h2>
              <p className="page-subtitle">Semua anggota harus dari makloon yang sama.</p>
            </div>
            {editId && <button type="button" className="btn btn-ghost" onClick={resetPanel}>Batal ubah</button>}
          </div>

          <div className="mb-3 flex flex-wrap gap-3">
            <select className="input max-w-xs" value={filterMakloon} onChange={(e) => setFilterMakloon(e.target.value)}>
              <option value="">Semua makloon</option>
              {opsiMakloon.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}
            </select>
            <input
              className="input max-w-xs"
              value={cariLhpk}
              onChange={(e) => setCariLhpk(e.target.value)}
              placeholder="Cari No. LHPK"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-primary-tint text-left text-primary-dark">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">No. LHPK</th>
                  <th className="px-3 py-2">Makloon</th>
                  <th className="px-3 py-2 text-right">Gabah Diolah</th>
                  <th className="px-3 py-2 text-right">Kuantum HGL</th>
                </tr>
              </thead>
              <tbody>
                {kandidatTampil.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Belum ada LHPK yang siap digabung.</td></tr>
                )}
                {kandidatTampil.map((item) => {
                  const dicentang = pilih.includes(item.id_pengolahan)
                  // Begitu satu baris dicentang, makloon lain dikunci -- aturannya jadi terlihat
                  // sebelum tombol ditekan, bukan muncul belakangan sebagai error 422.
                  const terkunci = makloonTerpilih !== null && item.makloon_user_id !== makloonTerpilih

                  return (
                    <tr key={item.id_pengolahan} className={`border-t border-border ${terkunci ? 'opacity-40' : ''}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={dicentang}
                          disabled={terkunci}
                          onChange={(e) =>
                            setPilih((prev) =>
                              e.target.checked ? [...prev, item.id_pengolahan] : prev.filter((id) => id !== item.id_pengolahan),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-primary-dark">{item.data_lhpk?.no_lhpk ?? item.id_pengolahan}</td>
                      <td className="px-3 py-2 text-gray-600">{item.makloon?.nama_maklon ?? '-'}</td>
                      <td className="px-3 py-2 text-right">{angka(item.data_lhpk?.kuantum_gabah_diolah)}</td>
                      <td className="px-3 py-2 text-right">{angka(item.data_lhpk?.kuantum_beras_hgl)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="no_mo">Nomor MO</label>
              <input
                id="no_mo"
                className="input"
                value={nomor.no_mo}
                onChange={(e) => setNomor({ ...nomor, no_mo: e.target.value })}
                placeholder={CONTOH_NOMOR}
                required
                disabled={!!editId}
              />
            </div>
            <div>
              <label className="label" htmlFor="no_tm_ada">Nomor TM ADA</label>
              <input
                id="no_tm_ada"
                className="input"
                value={nomor.no_tm_ada}
                onChange={(e) => setNomor({ ...nomor, no_tm_ada: e.target.value })}
                disabled={!!editId}
              />
            </div>
            <div>
              <label className="label" htmlFor="no_tm_gudang">Nomor TM Gudang</label>
              <input
                id="no_tm_gudang"
                className="input"
                value={nomor.no_tm_gudang}
                onChange={(e) => setNomor({ ...nomor, no_tm_gudang: e.target.value })}
                disabled={!!editId}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total Gabah Diolah</div>
              <div className="mt-1 text-2xl font-extrabold text-primary-dark">{angka(String(total.gabah))}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total Kuantum HGL</div>
              <div className="mt-1 text-2xl font-extrabold text-primary-dark">{angka(String(total.hgl))}</div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={pilih.length === 0 || gabungkan.isPending || ubahAnggota.isPending}>
              {editId ? 'Simpan anggota' : 'Buat MO'}
            </button>
          </div>
        </form>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-primary-tint p-1 text-xs font-semibold text-primary">
          {(['semua', 'proses', 'lengkap', 'dibatalkan'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={'rounded px-4 py-2 capitalize ' + (status === item ? 'bg-white shadow-sm' : 'hover:bg-white/60')}
            >
              {item}
            </button>
          ))}
        </div>
        <input
          className="input ml-auto max-w-xs bg-white"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari No. MO, OUT, TM"
        />
      </div>

      {isLoading && <div className="panel px-4 py-3 text-sm text-gray-400">Memuat...</div>}
      {!isLoading && (daftar?.data ?? []).length === 0 && (
        <div className="panel px-4 py-3 text-sm text-gray-400">Belum ada MO.</div>
      )}

      <div className="space-y-3">
        {(daftar?.data ?? []).map((mo) => (
          <section key={mo.id} className="panel panel-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-primary-dark">{mo.no_mo}</h3>
                <p className="page-subtitle">
                  {mo.makloon?.nama_maklon ?? '-'} · {mo.mo_detail?.length ?? 0} LHPK · HGL {angka(mo.total_kuantum_hgl)} kg
                </p>
              </div>
              <StatusMoBadge mo={mo} />
            </div>

            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">TM ADA</dt><dd className="font-medium text-primary-dark">{mo.no_tm_ada ?? '-'}</dd></div>
              <div><dt className="text-muted">TM Gudang</dt><dd className="font-medium text-primary-dark">{mo.no_tm_gudang ?? '-'}</dd></div>
              <div><dt className="text-muted">No. OUT</dt><dd className="font-medium text-primary-dark">{mo.no_out ?? '-'}</dd></div>
              <div><dt className="text-muted">Tgl OUT</dt><dd className="font-medium text-primary-dark">{mo.tanggal_out?.slice(0, 10) ?? '-'}</dd></div>
            </dl>

            {mo.review_status === 'ditolak' && mo.catatan_penolakan && (
              <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">Ditolak: {mo.catatan_penolakan}</p>
            )}

            {isOperasi && mo.status === 'proses' && mo.review_status !== 'diterima' && (
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => mulaiEdit(mo)}>Ubah anggota</button>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => aksi(batalkan, mo.id, 'MO dibatalkan.')}
                >
                  Batalkan MO
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={mo.review_status === 'menunggu_review'}
                  onClick={() => aksi(kirim, mo.id, 'MO dikirim ke Pengadaan.')}
                >
                  Kirim ke Pengadaan
                </button>
              </div>
            )}

            {isPengadaan && mo.review_status === 'menunggu_review' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div>
                  <label className="label" htmlFor={`catatan-${mo.id}`}>Catatan penolakan</label>
                  <input
                    id={`catatan-${mo.id}`}
                    className="input"
                    value={catatan[mo.id] ?? ''}
                    onChange={(e) => setCatatan({ ...catatan, [mo.id]: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  disabled={!(catatan[mo.id] ?? '').trim()}
                  onClick={() => aksi(tolak, { id: mo.id, catatan: catatan[mo.id] }, 'MO ditolak.')}
                >
                  Tolak
                </button>
                <button type="button" className="btn btn-primary" onClick={() => aksi(terima, mo.id, 'MO diterima.')}>
                  Terima
                </button>
              </div>
            )}

            {isPengadaan && mo.review_status === 'diterima' && mo.status !== 'lengkap' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label className="label" htmlFor={`out-${mo.id}`}>Nomor OUT</label>
                  <input
                    id={`out-${mo.id}`}
                    className="input"
                    value={outForm[mo.id]?.no_out ?? ''}
                    onChange={(e) => setOutForm({ ...outForm, [mo.id]: { ...(outForm[mo.id] ?? { tanggal_out: '' }), no_out: e.target.value } })}
                    placeholder="OUT/00832/02/2026/ADA08001"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`tgl-out-${mo.id}`}>Tanggal OUT</label>
                  <input
                    id={`tgl-out-${mo.id}`}
                    type="date"
                    className="input"
                    value={outForm[mo.id]?.tanggal_out ?? ''}
                    onChange={(e) => setOutForm({ ...outForm, [mo.id]: { ...(outForm[mo.id] ?? { no_out: '' }), tanggal_out: e.target.value } })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!outForm[mo.id]?.no_out || !outForm[mo.id]?.tanggal_out}
                  onClick={() => aksi(isiOut, { id: mo.id, ...outForm[mo.id] }, 'Nomor OUT diterbitkan; pengolahan selesai.')}
                >
                  Terbitkan OUT
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
