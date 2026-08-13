import { useJaminanSaya } from '../hooks/useJaminanMakloon'

const kg = (value: number) => `${new Intl.NumberFormat('id-ID').format(Math.round(value))} kg`

const tanggalPendek = (iso: string | null, pakaiTahun = false) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', ...(pakaiTahun ? { year: 'numeric' } : {}) })
    : '-'

/**
 * Aturan jaminan yang dipasang Operasi, ditampilkan ke makloon SEBELUM ia mengisi form.
 *
 * Alasannya koordinasi: dua gerbang jaminan menolak di sisi server, dan tanpa panel ini makloon
 * baru tahu batasnya setelah tertolak. Angka terpakai/sisa mengikuti `tanggalBongkar` yang sedang
 * diketik, bukan hari ini -- kuota dipatok tanggal bongkar, jadi mengubah tanggal mengubah sisa.
 *
 * Read-only sepenuhnya. Yang boleh mengubah angkanya cuma Operasi.
 */
export default function PanelJaminanMakloon({ tanggalBongkar }: { tanggalBongkar: string | null }) {
  const { data, isLoading } = useJaminanSaya(tanggalBongkar)

  if (isLoading || !data) return null

  const lewatPlafon = data.tunggakan_kg > data.plafon_tunggakan_kg

  return (
    <div className="mt-4 rounded-lg border border-border bg-primary-tint/40 p-4 text-sm">
      <div className="section-title mb-3">Aturan jaminan dari Operasi</div>

      <dl className="grid gap-x-6 gap-y-2 @md:grid-cols-2">
        <Baris label="Bentuk jaminan" nilai={data.bentuk_jaminan || '-'} />
        <Baris
          label="Berlaku"
          nilai={`${tanggalPendek(data.berlaku_mulai)} - ${tanggalPendek(data.berlaku_sampai, true)} (${data.batas_hari} hari)`}
        />
        <Baris
          label={`Kuota ${tanggalPendek(data.tanggal, true)}`}
          nilai={`${kg(data.terpakai_kg)} terpakai, sisa ${kg(data.sisa_harian_kg)} dari ${kg(data.kapasitas_per_hari_kg)}`}
        />
        <Baris
          label="Belum diolah UB"
          nilai={`${kg(data.tunggakan_kg)} dari batas ${kg(data.plafon_tunggakan_kg)}`}
          bahaya={lewatPlafon}
        />
        <Baris label="Sisa dapat dikirim" nilai={kg(data.sisa_dapat_diinput_kg)} bahaya={data.sisa_dapat_diinput_kg <= 0} />
      </dl>

      {/* Diukur terhadap tanggal bongkar yang sedang diketik -- tanggal yang sama dengan yang
          dipakai gerbang di server. Jadi kalau kotak ini menyala, kiriman PASTI ditolak; kalau
          tidak menyala, tanggalnya pasti diterima. Peringatan yang tidak cocok dengan kenyataan
          lebih buruk daripada tidak ada peringatan. */}
      {!data.masih_berlaku && (
        <div className="alert-danger mt-3">
          Tanggal bongkar {tanggalPendek(data.tanggal, true)} di luar masa berlaku jaminan. Kiriman akan
          ditolak &mdash; hubungi Operasi untuk memperbarui jaminan.
        </div>
      )}

      <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-slate-600">
        Sisa kuota harian tidak dibawa ke hari berikutnya. Kuota terbuka kembali setelah hasil olahan
        UB Jastasma masuk rekap.
      </p>
    </div>
  )
}

function Baris({ label, nilai, bahaya = false }: { label: string; nilai: string; bahaya?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-semibold ${bahaya ? 'text-danger' : 'text-primary-dark'}`}>{nilai}</dd>
    </div>
  )
}
