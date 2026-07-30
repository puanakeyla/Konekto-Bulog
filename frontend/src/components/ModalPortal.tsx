import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Merender isinya langsung di <body>, bukan di tempat komponen dipanggil.
 *
 * Wajib untuk semua dialog: `position: fixed` berpatokan ke viewport HANYA jika tidak ada
 * leluhur yang punya transform/filter/backdrop-filter -- leluhur seperti itu menjadi containing
 * block baru. Di aplikasi ini `.panel` memakai `animation: sergab-rise ... both`, sehingga
 * transform keyframe terakhir menempel permanen; dialog yang dirender di dalam panel jadi
 * terpaku ke panel itu dan pengguna harus menggulir mencarinya. Portal membuat dialog kebal
 * terhadap CSS leluhur mana pun, sekarang maupun nanti.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
