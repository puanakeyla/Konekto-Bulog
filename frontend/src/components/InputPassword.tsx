import { useState, type InputHTMLAttributes } from 'react'

/**
 * Kotak password dengan tombol mata: klik untuk melihat, klik lagi untuk menutup.
 *
 * Satu komponen dipakai bertiga (login, buat user, ganti password) supaya tombolnya tidak
 * berperilaku beda-beda antar layar -- dan supaya "Password" & "Konfirmasi Password" bisa
 * dibuka SENDIRI-SENDIRI. Itu justru gunanya: yang mau dicek pengguna adalah apakah keduanya
 * benar-benar sama, jadi satu saklar bersama malah menghilangkan gunanya.
 *
 * `type="button"` wajib: di dalam <form>, tombol tanpa type ikut men-submit saat diklik.
 */
export default function InputPassword(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [terlihat, setTerlihat] = useState(false)
  const { className = 'input', ...sisa } = props

  return (
    <div className="relative">
      <input {...sisa} type={terlihat ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setTerlihat((prev) => !prev)}
        aria-label={terlihat ? 'Sembunyikan password' : 'Tampilkan password'}
        aria-pressed={terlihat}
        title={terlihat ? 'Sembunyikan password' : 'Tampilkan password'}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 transition-colors hover:text-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
          {/* Garis coret hanya muncul saat password SEDANG terlihat -- ikonnya menggambarkan
              apa yang terjadi kalau diklik, bukan keadaan sekarang. */}
          {terlihat && <path d="M4 20 20 4" />}
        </svg>
      </button>
    </div>
  )
}
