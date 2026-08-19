import { useJaminanSaya } from '../hooks/useJaminanMakloon'

const kg = (value: number) => `${new Intl.NumberFormat('id-ID').format(Math.round(value))} kg`

/**
 * Aturan jaminan yang dipasang Operasi, ditampilkan ke makloon SEBELUM ia mengisi form.
 *
 * Read-only sepenuhnya. Yang boleh mengubah angkanya cuma Operasi.
 */
export default function PanelJaminanMakloon() {
  const { data, isLoading } = useJaminanSaya()

  if (isLoading || !data) return null

  const lewatKapasitas = data.gabah_ditangan_kg > data.kapasitas_total_kg

  return (
    <div className="mt-4 rounded-lg border border-border bg-primary-tint/40 p-4 text-sm">
      <div className="section-title mb-3">Aturan jaminan dari Operasi</div>

      <dl className="grid gap-x-6 gap-y-2 @md:grid-cols-2">
        <Baris label="Bentuk jaminan" nilai={data.bentuk_jaminan || '-'} />
        <Baris label="Kapasitas total" nilai={kg(data.kapasitas_total_kg)} />
        <Baris label="Gabah Sudah IN" nilai={kg(data.gabah_masuk_kg)} />
        <Baris label="Estimasi Gabah" nilai={kg(data.gabah_kembali_kg)} />
        <Baris
          label="Stok Pengurang Penerimaan Gudang"
          nilai={`${kg(data.gabah_ditangan_kg)} dari ${kg(data.kapasitas_total_kg)}`}
          bahaya={lewatKapasitas}
        />
        <Baris label="Sisa dapat dikirim" nilai={kg(data.sisa_dapat_diinput_kg)} bahaya={data.sisa_dapat_diinput_kg <= 0} />
      </dl>

      <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs leading-relaxed text-slate-600">
        <p className="font-mono text-[0.6875rem] leading-5 text-slate-500">
          Stok Pengurang Penerimaan Gudang = Gabah Sudah IN &minus; Estimasi Gabah<br />
          Sisa dapat dikirim = Kapasitas total &minus; Stok Pengurang Penerimaan Gudang
        </p>
        <p>
          <strong>Yang dihitung hanya gabah yang No IN-nya sudah terbit.</strong> Gabah yang sudah
          dibongkar tapi PO-nya belum keluar belum masuk perhitungan.
        </p>
        <p>
          Angkanya berkurang sendiri setiap kali hasil olahan Anda ditimbang masuk gudang, sehingga
          sisa yang dapat dikirim terbuka lagi.
        </p>
      </div>
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
