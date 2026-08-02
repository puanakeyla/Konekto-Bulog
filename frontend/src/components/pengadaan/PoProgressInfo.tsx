type PoProgressInfoProps = {
  posisi: string
  status: string
  berikutnya: string
  keterangan: string
}

export default function PoProgressInfo({ posisi, status, berikutnya, keterangan }: PoProgressInfoProps) {
  return (
    <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="grid gap-3 text-sm @md:grid-cols-3">
        <Info label="Posisi sekarang" value={posisi} />
        <Info label="Status" value={status} highlight />
        <Info label="Berikutnya" value={berikutnya} />
      </div>
      <p className="mt-2 text-xs text-muted">{keterangan}</p>
    </div>
  )
}

function Info({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={highlight ? 'mt-1 font-bold text-primary-dark' : 'mt-1 font-semibold text-slate-600'}>{value}</div>
    </div>
  )
}
