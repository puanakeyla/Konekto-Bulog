import { useEffect, useState } from 'react'

/**
 * Nilai yang tertinggal di belakang ketikan.
 *
 * Dipakai kotak pencarian yang menyaring di SERVER: tanpa ini tiap ketukan tombol mengirim satu
 * query LIKE '%kata%' -- yang pada puluhan ribu baris berarti pemindaian tabel penuh per huruf.
 * Kotak yang cuma menyaring array di layar tidak butuh ini.
 */
export function useDebounced<T>(value: T, delay = 350): T {
  const [tertunda, setTertunda] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setTertunda(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return tertunda
}
