import { useJaminanSaya } from '../hooks/useJaminanMakloon'

const kg = (value: number) => `${new Intl.NumberFormat('id-ID').format(Math.round(value))} kg`

/**
 * Aturan jaminan yang dipasang Operasi, ditampilkan ke makloon SEBELUM ia mengisi form.
 *
 * Read-only sepenuhnya. Yang boleh mengubah angkanya cuma Operasi.
 */
export default function PanelJaminanMakloon({ tanggalBongkar }: { tanggalBongkar: string | null }) {
  const { data, isLoading } = useJaminanSaya(tanggalBongkar)

  if (isLoading || !data) return null

  const lewatKapasitas = data.estimasi_gabah_kg > data.kapasitas_total_kg

  return (
    <div className="mt-4 rounded-lg border border-border bg-primary-tint/40 p-4 text-sm">
      <div className="section-title mb-3">Aturan jaminan dari Operasi</div>

      <dl className="grid gap-x-6 gap-y-2 @md:grid-cols-2">
        <Baris label="Bentuk jaminan" nilai={data.bentuk_jaminan || '-'} />
        <Baris label="Kapasitas total" nilai={kg(data.kapasitas_total_kg)} />
        <Baris
          label="Estimasi gabah"
          nilai={`${kg(data.estimasi_gabah_kg)} dari ${kg(data.kapasitas_total_kg)}`}
          bahaya={lewatKapasitas}
        />
        <Baris label="Sisa dapat dikirim" nilai={kg(data.sisa_dapat_diinput_kg)} bahaya={data.sisa_dapat_diinput_kg <= 0} />
      </dl>

      <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-slate-600">
        Sisa kapasitas dihitung dari kapasitas total dikurangi estimasi gabah.
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
