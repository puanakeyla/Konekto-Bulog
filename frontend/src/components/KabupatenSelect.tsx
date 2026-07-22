import { LAMPUNG_KABUPATEN } from '../lib/lampungKabupaten'

type KabupatenSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
}

export default function KabupatenSelect({ value, onChange, required = true }: KabupatenSelectProps) {
  const hasCurrentValue = value === '' || LAMPUNG_KABUPATEN.includes(value)

  return (
    <select required={required} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Pilih kabupaten</option>
      {!hasCurrentValue && <option value={value}>{value}</option>}
      {LAMPUNG_KABUPATEN.map((kabupaten) => (
        <option key={kabupaten} value={kabupaten}>{kabupaten}</option>
      ))}
    </select>
  )
}
