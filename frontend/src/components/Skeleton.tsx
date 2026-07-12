// Placeholder abu-abu beranimasi pulse. Dipakai untuk meniru bentuk konten saat data
// masih di-fetch, menggantikan teks "Memuat..." polos.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />
}

// Kartu PO (Pengadaan/Keuangan/Operasi/Gudang) -- meniru .po-card.
export function SkeletonPoCards({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="po-card">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="mt-4 flex justify-end"><Skeleton className="h-9 w-40" /></div>
        </div>
      ))}
    </div>
  )
}

// Header grup accordion per makloon (Dashboard grouped & Monitoring makloon).
export function SkeletonMakloonGroups({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-[34px] w-[34px] rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-14 rounded" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  )
}

// Tabel datar (Dashboard non-grouped, Admin user).
export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-border bg-primary-tint px-4 py-3"><Skeleton className="h-4 w-32" /></div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-t border-border px-4 py-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-40' : c === cols - 1 ? 'ml-auto w-16' : 'w-24'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Kartu bar chart sebaran tahap (Monitoring), dua kolom skema.
export function SkeletonSebaranTahap() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }, (_, c) => (
        <div key={c} className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-16 rounded" /></div>
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-5" /></div>
                <Skeleton className="h-2 w-full rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Timeline detail transaksi.
export function SkeletonTimeline() {
  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-[46rem]">
        <div className="mb-6 space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-80" /></div>
        <div className="panel space-y-4 p-4 sm:p-6">
          <Skeleton className="h-16 w-full rounded-lg" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 rounded-lg border border-border p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
