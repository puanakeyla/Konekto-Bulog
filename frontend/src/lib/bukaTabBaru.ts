/**
 * Buka URL yang baru diketahui SETELAH await, di tab baru.
 *
 * window.open() hanya diizinkan selama pemanggilnya masih berada di dalam tumpukan panggilan
 * gesture user. Begitu ada `await` mendahuluinya, popup blocker menolaknya diam-diam -- gejalanya
 * "kadang foto kebuka, kadang tidak": yang kebuka adalah yang URL-nya kebetulan sudah ter-cache
 * sehingga window.open sempat berjalan sinkron. Karena itu tabnya dibuka DULU saat klik, lalu
 * diarahkan setelah URL-nya datang.
 *
 * Catatan: opsi 'noopener' sengaja TIDAK dipakai di window.open -- dengan noopener browser
 * mengembalikan null, jadi tabnya tidak bisa diarahkan lagi. Gantinya `opener` diputus manual.
 */
export async function bukaTabBaru(muatUrl: () => Promise<string | undefined | null>) {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null

  try {
    const url = await muatUrl()

    if (!url) {
      tab?.close()
      return
    }

    // Popup tetap diblokir total (mis. setelan browser ketat): pindah di tab ini saja daripada
    // klik terasa tidak melakukan apa-apa.
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (err) {
    tab?.close()
    throw err
  }
}
