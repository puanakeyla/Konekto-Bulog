import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from '../lib/toast'
import AngkaInput from '../components/AngkaInput'
import MakloonCombobox from '../components/MakloonCombobox'
import TautanDashboard from '../components/TautanDashboard'
import ConfirmDialog from '../components/ConfirmDialog'
import { apiErrorMessage } from '../lib/apiError'
import { useAuth } from '../hooks/useAuth'
import { useJaminanMakloon, useSimpanJaminanMakloon } from '../hooks/useJaminanMakloon'

const formatKg = (value: number) => `${new Intl.NumberFormat('id-ID').format(Math.round(value))} kg`
const formatRp = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

type FormState = {
  makloon_user_id: number | null
  bentuk_jaminan: string
  jaminan_rp: string
  kapasitas_total_kg: string
}

const initialForm: FormState = {
  makloon_user_id: null,
  bentuk_jaminan: '',
  jaminan_rp: '',
  kapasitas_total_kg: '',
}

export default function JaminanMakloonPage() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<FormState>(initialForm)
  const [warning, setWarning] = useState<string | null>(null)
  const [konfirmasiTimpa, setKonfirmasiTimpa] = useState(false)
  const { data = [], isLoading } = useJaminanMakloon(q)
  const mutation = useSimpanJaminanMakloon()

  const selected = useMemo(
    () => data.find((item) => item.makloon_user_id === form.makloon_user_id),
    [data, form.makloon_user_id],
  )

  if (user?.role.nama_role !== 'operasi') return <Navigate to="/dashboard" replace />

  const pilihMakloon = (id: number | null) => {
    const item = data.find((row) => row.makloon_user_id === id)
    setForm({
      makloon_user_id: id,
      bentuk_jaminan: item?.jaminan?.bentuk_jaminan ?? '',
      jaminan_rp: item?.jaminan ? String(Math.round(item.jaminan.jaminan_rp)) : '',
      kapasitas_total_kg: item?.jaminan ? String(Math.round(item.jaminan.kapasitas_total_kg)) : '',
    })
    setWarning(null)
  }

  // Satu makloon hanya punya SATU aturan jaminan: menyimpan untuk makloon yang sudah punya
  // berarti menimpa, dan aturan lama tidak disimpan di mana pun. Karena itu penimpaan minta
  // konfirmasi yang menyebut angka lama dan angka barunya -- Operasi harus melihat apa yang
  // akan hilang sebelum menekan, bukan sesudah.
  const makloonTerpilih = data.find((row) => row.makloon_user_id === form.makloon_user_id)
  const jaminanLama = makloonTerpilih?.jaminan ?? null
  const namaMakloonTerpilih = makloonTerpilih?.nama_maklon ?? 'Makloon ini'

  const simpan = () => {
    if (!form.makloon_user_id || !form.jaminan_rp || !form.kapasitas_total_kg) {
      setWarning('Pilih makloon dan lengkapi jaminan serta kapasitas total sebelum menyimpan.')
      toast.error('Data jaminan makloon belum lengkap.')
      return
    }

    if (jaminanLama) {
      setKonfirmasiTimpa(true)
      return
    }

    kirim()
  }

  const kirim = () => {
    // Sudah dijaga simpan(); diulang di sini karena kirim() juga dipanggil dari dialog
    // konfirmasi, dan tanpa guard ini tipenya tetap `number | null`.
    if (!form.makloon_user_id) return

    setKonfirmasiTimpa(false)
    mutation.mutate({
      makloon_user_id: form.makloon_user_id,
      bentuk_jaminan: form.bentuk_jaminan.trim() || null,
      jaminan_rp: Number(form.jaminan_rp),
      kapasitas_total_kg: Number(form.kapasitas_total_kg),
    }, {
      onSuccess: (item) => {
        setWarning(null)
        setForm(initialForm)
        toast.success(`Jaminan ${item.nama_maklon} tersimpan.`)
      },
      onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan jaminan makloon.')),
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <TautanDashboard className="mb-4" />
      <div className="mb-6">
        <h1 className="section-title">Jaminan Makloon</h1>
        <p className="page-subtitle">Atur bentuk jaminan dan kapasitas total untuk makloon aktif.</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <input className="input ml-auto max-w-xs bg-white" placeholder="Cari makloon" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <main className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <form className="panel panel-pad h-fit" onSubmit={(e) => { e.preventDefault(); simpan() }}>
          <h2 className="section-title">Input Jaminan</h2>
          <div className="mt-4 space-y-4">
            {warning && <div className="alert-warning">{warning}</div>}
            <Field label="Makloon">
              <MakloonCombobox value={form.makloon_user_id} onChange={pilihMakloon} />
            </Field>
            <Field label="Bentuk jaminan">
              <input className="input" value={form.bentuk_jaminan} onChange={(e) => setForm((prev) => ({ ...prev, bentuk_jaminan: e.target.value }))} />
            </Field>
            <Field label="Jaminan (Rp)">
              <AngkaInput required prefix="Rp " value={form.jaminan_rp} onChange={(value) => setForm((prev) => ({ ...prev, jaminan_rp: value }))} />
            </Field>
            <Field label="Kapasitas total (kg)">
              <AngkaInput required value={form.kapasitas_total_kg} onChange={(value) => setForm((prev) => ({ ...prev, kapasitas_total_kg: value }))} />
            </Field>

            {selected && (
              <div className="rounded-lg border border-border bg-primary-tint/40 p-3 text-xs text-slate-600">
                <div className="flex justify-between gap-4"><span>Kapasitas total</span><strong className="text-primary-dark">{formatKg(Number(form.kapasitas_total_kg || 0))}</strong></div>
                <div className="mt-2 flex justify-between gap-4">
                  <span>Stok Pengurang Penerimaan Gudang</span>
                  <strong className={selected.pantauan.melewati_batas ? 'text-danger' : 'text-primary-dark'}>{formatKg(selected.pantauan.gabah_ditangan)}</strong>
                </div>
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-slate-500">
                  Sisa dapat dikirim = kapasitas total − Stok Pengurang Penerimaan Gudang.
                </p>
              </div>
            )}

            <button type="submit" disabled={mutation.isPending} className="btn btn-primary w-full">
              {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>

        <section className="panel overflow-hidden">
          <div className="border-b border-border bg-white px-5 py-4">
            <h2 className="section-title">Pantauan Makloon</h2>
          </div>
          {/* Digulung di dalam panelnya: makloon aktif bisa puluhan, dan keterangan rumus di
              kaki panel harus tetap terjangkau tanpa scroll halaman sepanjang tabel. */}
          <div className="overflow-x-auto tabel-scroll">
            <table className="min-w-full text-sm">
              {/* Dua baris kepala: baris atas mengelompokkan kolom jadi tiga blok
                  (identitas / aturan Operasi / posisi makloon saat ini) supaya tabelnya
                  tidak terbaca sebagai deretan angka datar. */}
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr className="bg-primary-tint/60">
                  <th className="px-4 pt-3 pb-1" />
                  <th className="border-l border-border px-4 pt-3 pb-1 font-bold text-primary-dark" colSpan={3}>Aturan dari Operasi</th>
                  <th className="border-l border-border px-4 pt-3 pb-1 font-bold text-primary-dark" colSpan={2}>Posisi Makloon</th>
                </tr>
                <tr className="bg-primary-tint">
                  <th className="px-4 pb-3 pt-1">Makloon</th>
                  <th className="border-l border-border px-4 pb-3 pt-1">Bentuk Jaminan</th>
                  <th className="px-4 pb-3 pt-1 text-right">Nilai</th>
                  <th className="px-4 pb-3 pt-1 text-right">Kapasitas Total</th>
                  <th className="border-l border-border px-4 pb-3 pt-1 text-right">Stok Pengurang<br />Penerimaan Gudang</th>
                  <th className="px-4 pb-3 pt-1 text-right">Sisa Dapat Dikirim</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Memuat data...</td></tr>}
                {!isLoading && data.map((item) => {
                  const j = item.jaminan
                  return (
                    <tr key={item.makloon_user_id} className="border-t border-border odd:bg-white even:bg-surface hover:bg-primary-tint/60">
                      <td className="px-4 py-3">
                        <button type="button" className="text-left font-semibold text-primary-dark hover:text-primary" onClick={() => pilihMakloon(item.makloon_user_id)}>{item.nama_maklon}</button>
                        <div className="text-xs text-slate-500">{[item.kecamatan, item.kabupaten].filter(Boolean).join(', ') || item.username}</div>
                      </td>
                      <td className="border-l border-border px-4 py-3 text-slate-600">{j?.bentuk_jaminan || <span className="text-slate-400">belum dicatat</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{j ? formatRp(j.jaminan_rp) : '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{j ? formatKg(j.kapasitas_total_kg) : '-'}</td>
                      <td className={`border-l border-border px-4 py-3 text-right tabular-nums font-semibold ${item.pantauan.melewati_batas ? 'text-danger' : 'text-primary-dark'}`}>
                        {formatKg(item.pantauan.gabah_ditangan)}
                        {j && <div className="text-xs font-normal text-slate-500">dari {formatKg(j.kapasitas_total_kg)}</div>}
                        <div className="text-xs font-normal text-slate-400">Gabah Sudah IN {formatKg(item.pantauan.gabah_masuk)} · Estimasi Gabah {formatKg(item.pantauan.gabah_kembali)}</div>
                        {/* Nol punya dua sebab yang sangat berbeda: belum ada gabah masuk, atau
                            setoran olahan sudah melampauinya. Tanpa dibedakan, Operasi tidak bisa
                            tahu apakah plafonnya sedang bekerja atau angkanya sekadar macet. */}
                        {item.pantauan.gabah_kembali > item.pantauan.gabah_masuk && (
                          <div className="text-xs font-normal text-success">
                            kelebihan setoran {formatKg(item.pantauan.gabah_kembali - item.pantauan.gabah_masuk)} — plafon belum tersentuh
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {j ? (
                          <>
                            <strong className={item.pantauan.sisa_dapat_diinput_kg <= 0 ? 'text-danger' : 'text-success'}>
                              {formatKg(item.pantauan.sisa_dapat_diinput_kg)}
                            </strong>
                            <div className="text-xs text-slate-500">kapasitas − stok pengurang</div>
                          </>
                        ) : <span className="text-slate-400">jaminan belum diatur</span>}
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && data.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Tidak ada makloon aktif.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border bg-surface px-5 py-3 text-xs leading-relaxed text-slate-500">
            <strong>Stok Pengurang Penerimaan Gudang</strong> = Gabah Sudah IN − Estimasi Gabah.
            <strong> Sisa Dapat Dikirim</strong> = Kapasitas total − Stok Pengurang Penerimaan Gudang.
            Angkanya sama persis dengan kolom bernama sama di neraca gabah, jadi kedua layar bisa
            dicocokkan langsung. <strong>Yang dihitung hanya gabah yang No IN-nya sudah terbit</strong> —
            bongkar yang PO-nya belum keluar belum masuk hitungan. Angkanya berkurang sendiri setiap
            kali hasil olahan makloon ditimbang masuk gudang.
          </p>
        </section>
      </main>

      <ConfirmDialog
        open={konfirmasiTimpa}
        title="Ganti aturan jaminan yang berlaku?"
        confirmLabel="Ganti aturan"
        loading={mutation.isPending}
        onCancel={() => setKonfirmasiTimpa(false)}
        onConfirm={kirim}
        description={
          <>
            <p>
              <strong>{namaMakloonTerpilih}</strong> sudah punya aturan jaminan. Menyimpan akan
              menggantinya, dan aturan lama tidak disimpan di mana pun.
            </p>
            <p className="mt-2">Aturan baru berlaku untuk kiriman berikutnya, terhitung sejak disimpan. Kiriman yang sudah terlanjur masuk tidak ditinjau ulang.</p>
            <dl className="mt-3 space-y-1 rounded-lg border border-border bg-surface px-3 py-2">
              <Perubahan label="Kapasitas total" lama={formatKg(jaminanLama?.kapasitas_total_kg ?? 0)} baru={formatKg(Number(form.kapasitas_total_kg || 0))} />
              <Perubahan label="Nilai jaminan" lama={formatRp(jaminanLama?.jaminan_rp ?? 0)} baru={formatRp(Number(form.jaminan_rp || 0))} />
              <Perubahan label="Bentuk jaminan" lama={jaminanLama?.bentuk_jaminan || 'belum dicatat'} baru={form.bentuk_jaminan.trim() || 'belum dicatat'} />
            </dl>
          </>
        }
      />
    </div>
  )
}

/** Satu baris "lama -> baru". Yang tidak berubah ditulis sekali saja supaya yang berubah menonjol. */
function Perubahan({ label, lama, baru }: { label: string; lama: string; baru: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold">
        {lama === baru ? (
          <span className="text-slate-500">{baru} (tetap)</span>
        ) : (
          <><span className="text-slate-400 line-through">{lama}</span> <span className="text-primary-dark">{baru}</span></>
        )}
      </dd>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
