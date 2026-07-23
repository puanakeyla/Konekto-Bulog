// Input angka bulat dengan pemisah ribuan langsung saat mengetik (mis. ketik 9385 -> 9.385).
// Dipakai untuk kuantum (kg) & harga (Rp) yang selalu bilangan bulat. Nilai yang dikirim ke
// parent via onChange adalah string angka mentah tanpa pemisah (mis. "9385"), sehingga
// Number(value) di form tetap bekerja seperti input number biasa.

function formatRibuan(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('id-ID')
}

export default function AngkaInput({
  value,
  onChange,
  className = 'input',
  placeholder,
  required,
  disabled,
  readOnly,
}: {
  value: string | number | null | undefined
  onChange: (raw: string) => void
  className?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      value={formatRibuan(value)}
      // Hanya digit yang dipertahankan; pemisah ribuan diabaikan saat parsing.
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  )
}
