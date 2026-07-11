import { useMemo, useState } from 'react'
import { useMakloonOptions } from '../hooks/useMakloonOptions'

type Props = {
  value: number | null
  onChange: (id: number | null) => void
}

export default function MakloonCombobox({ value, onChange }: Props) {
  const { data: options, isLoading } = useMakloonOptions()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selected = options?.find((o) => o.id === value) ?? null

  const filtered = useMemo(() => {
    if (!options) return []
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => (o.nama_maklon ?? '').toLowerCase().includes(q))
  }, [options, query])

  return (
    <div className="relative">
      <input
        type="text"
        className="input"
        placeholder={isLoading ? 'Memuat daftar makloon...' : 'Cari nama makloon...'}
        value={open ? query : (selected?.nama_maklon ?? '')}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-white shadow-lg">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">Tidak ditemukan</li>
          )}
          {filtered.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-primary-tint"
                onMouseDown={() => {
                  onChange(option.id)
                  setOpen(false)
                }}
              >
                <span className="font-medium">{option.nama_maklon}</span>
                {(option.kecamatan || option.kabupaten) && (
                  <span className="block text-xs text-gray-500">
                    {[option.kecamatan, option.kabupaten].filter(Boolean).join(', ')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
