import { Outlet } from 'react-router-dom'
import AppNav from './AppNav'

// Kerangka halaman terproteksi: nav global ber-logo + isi halaman (Outlet).
export default function AppLayout() {
  return (
    <>
      <AppNav />
      <Outlet />
    </>
  )
}
