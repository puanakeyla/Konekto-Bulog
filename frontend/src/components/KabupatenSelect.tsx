import { useState } from 'react'
import { LAMPUNG_KABUPATEN } from '../lib/lampungKabupaten'

const LAIN = '__lain__'

type KabupatenSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
}

/**
 * Dropdown 15 kabupaten/kota Lampung + opsi "Lainnya" untuk mengetik sendiri. Nilai yang
 * dikirim ke pemanggil tetap string biasa (nama kabupaten), jadi form tidak perlu tahu
 * apakah user memilih dari daftar atau mengetik.
 */
export default function KabupatenSelect({ value, onChange, required = true }: KabupatenSelectProps) {
  // Nilai di luar daftar (mis. isian "Lainnya" yang dimuat ulang dari server) langsung membuka
  // mode ketik. State lokal hanya menangani kasus baru memilih "Lainnya" tapi belum mengetik --
  // saat itu value masih kosong sehingga tidak bisa dideteksi dari value saja.
  const [pilihLain, setPilihLain] = useState(false)
  const manual = pilihLain || (value !== '' && !LAMPUNG_KABUPATEN.includes(value))

  return (
    <>
      <select
        required={required}
        className="input"
        value={manual ? LAIN : value}
        onChange={(event) => {
          const dipilih = event.target.value
          setPilihLain(dipilih === LAIN)
          onChange(dipilih === LAIN ? '' : dipilih)
        }}
      >
        <option value="">Pilih kabupaten</option>
        {LAMPUNG_KABUPATEN.map((kabupaten) => (
          <option key={kabupaten} value={kabupaten}>{kabupaten}</option>
        ))}
        <option value={LAIN}>Lainnya&hellip;</option>
      </select>
      {manual && (
        <input
          required={required}
          className="input mt-2"
          placeholder="Ketik nama kabupaten"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </>
  )
}
