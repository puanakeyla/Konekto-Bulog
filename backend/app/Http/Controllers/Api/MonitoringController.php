<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaksi;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use App\Services\Pengolahan\PengolahanStages;
use App\Services\Transaksi\TransaksiStages;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class MonitoringController extends Controller
{
    public function sebaranTahap(Request $request)
    {
        $counts = Transaksi::query()
            ->select('skema', 'current_stage', DB::raw('count(*) as total'))
            ->where('status_keseluruhan', 'berjalan')
            ->groupBy('skema', 'current_stage')
            ->get()
            ->groupBy('skema');

        $data = collect(['TJP', 'MPP'])->map(function (string $skema) use ($counts) {
            $stageCounts = $counts->get($skema, collect())->keyBy('current_stage');

            return [
                'skema' => $skema,
                'stages' => collect(TransaksiStages::sequence($skema))->map(fn (array $stage) => [
                    'stage' => $stage['role'],
                    'label' => TransaksiStages::label($stage),
                    'total' => (int) ($stageCounts->get($stage['role'])?->total ?? 0),
                ])->values(),
            ];
        })->values();

        return response()->json(['data' => $data]);
    }

    /** Jumlah bulan yang ditarik untuk grafik tren. Satu tahun penuh supaya pola musim panen terlihat. */
    private const BULAN_TREN = 12;

    /** Berapa makloon teratas yang ditampilkan di grafik peringkat volume olahan. */
    private const BATAS_PERINGKAT = 8;

    /**
     * Angka pengawasan untuk rantai pengolahan (GDG/UBJ) — padanan sebaranTahap() + makloon()
     * di alur SerGab, tapi dikemas jadi satu permintaan karena keempat blok dibaca satu layar
     * sekaligus dan semuanya dihitung di database.
     *
     * Semua agregat memakai LHPK yang sudah DITERIMA saja: selama masih draft atau menunggu
     * review, kuantumnya belum final dan memasukkannya membuat grafik tren bergoyang mengikuti
     * data yang belum tentu jadi. Aturan yang sama dipakai Rekap Pengolahan.
     */
    public function pengolahan()
    {
        return response()->json(['data' => [
            'ringkasan' => $this->ringkasanPengolahan(),
            'sebaran_tahap' => $this->sebaranTahapPengolahan(),
            'tren_bulanan' => $this->trenBulanan(),
            'makloon_teratas' => $this->makloonTeratas(),
        ]]);
    }

    /** @return array<string, float|int> */
    private function ringkasanPengolahan(): array
    {
        $status = TransaksiPengolahan::query()
            ->selectRaw("SUM(CASE WHEN status_keseluruhan = 'berjalan' THEN 1 ELSE 0 END) as berjalan")
            ->selectRaw("SUM(CASE WHEN status_keseluruhan = 'selesai' THEN 1 ELSE 0 END) as selesai")
            ->first();

        $olahan = DB::table('pengolahan_lhpk')
            ->where('status', 'diterima')
            ->selectRaw('COALESCE(SUM(kuantum_gabah_diolah), 0) as gabah, COALESCE(SUM(kuantum_beras_hgl), 0) as beras')
            ->first();

        $fisik = DB::table('pengolahan_gudang')
            ->where('status', 'diterima')
            ->selectRaw('COALESCE(SUM(kuantum_hgl), 0) as hgl_fisik')
            ->first();

        $gabah = (float) $olahan->gabah;
        $beras = (float) $olahan->beras;

        return [
            'berjalan' => (int) $status->berjalan,
            'selesai' => (int) $status->selesai,
            'gabah_diolah' => $gabah,
            'beras_hgl' => $beras,
            // Rendemen gabungan dihitung dari TOTALNYA, bukan rata-rata rendemen per baris:
            // merata-ratakan persentase memberi bobot sama pada 1 ton dan 100 ton.
            'rendemen' => $gabah > 0 ? round($beras / $gabah * 100, 2) : 0.0,
            // Selisih timbangan gudang dengan hasil olah menurut LHPK -- angka susut yang memang
            // sengaja dibiarkan berbeda per baris (lihat PengolahanGudang).
            'susut' => round((float) $fisik->hgl_fisik - $beras, 2),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function sebaranTahapPengolahan(): array
    {
        $counts = TransaksiPengolahan::query()
            ->select('skema', 'current_stage', DB::raw('count(*) as total'))
            ->where('status_keseluruhan', 'berjalan')
            ->sudahDiisi()
            ->groupBy('skema', 'current_stage')
            ->get()
            ->groupBy('skema');

        return collect(PengolahanStages::SKEMA)->map(function (string $skema) use ($counts) {
            $stageCounts = $counts->get($skema, collect())->keyBy('current_stage');

            return [
                'skema' => $skema,
                'stages' => collect(PengolahanStages::sequence($skema))->map(fn (array $stage) => [
                    'stage' => $stage['role'],
                    'label' => PengolahanStages::label($stage),
                    'total' => (int) ($stageCounts->get($stage['role'])?->total ?? 0),
                ])->values(),
            ];
        })->values()->all();
    }

    /**
     * Tren per bulan LHPK. Bulan tanpa data tetap muncul bernilai nol supaya sumbu grafiknya
     * berjarak sama — tanpa itu jeda panen terbaca sebagai garis yang naik mulus.
     *
     * SUBSTR dipakai, bukan DATE_FORMAT/strftime: yang pertama berjalan sama di MySQL (dev &
     * produksi) maupun SQLite (test), dua lainnya tidak.
     *
     * @return array<int, array<string, mixed>>
     */
    private function trenBulanan(): array
    {
        $mulai = Carbon::now()->startOfMonth()->subMonths(self::BULAN_TREN - 1);

        $rows = DB::table('pengolahan_lhpk')
            ->where('status', 'diterima')
            ->whereNotNull('tanggal_lhpk')
            ->where('tanggal_lhpk', '>=', $mulai->toDateString())
            ->groupBy(DB::raw('SUBSTR(tanggal_lhpk, 1, 7)'))
            ->selectRaw('SUBSTR(tanggal_lhpk, 1, 7) as bulan')
            ->selectRaw('COUNT(*) as jumlah')
            ->selectRaw('COALESCE(SUM(kuantum_gabah_diolah), 0) as gabah_diolah')
            ->selectRaw('COALESCE(SUM(kuantum_beras_hgl), 0) as beras_hgl')
            ->get()
            ->keyBy('bulan');

        return collect(range(0, self::BULAN_TREN - 1))->map(function (int $offset) use ($mulai, $rows) {
            $bulan = $mulai->copy()->addMonths($offset);
            $row = $rows->get($bulan->format('Y-m'));
            $gabah = (float) ($row->gabah_diolah ?? 0);
            $beras = (float) ($row->beras_hgl ?? 0);

            return [
                'bulan' => $bulan->format('Y-m'),
                'label' => $bulan->translatedFormat('M y'),
                'jumlah' => (int) ($row->jumlah ?? 0),
                'gabah_diolah' => $gabah,
                'beras_hgl' => $beras,
                'rendemen' => $gabah > 0 ? round($beras / $gabah * 100, 2) : 0.0,
            ];
        })->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function makloonTeratas(): array
    {
        return DB::table('pengolahan_lhpk as l')
            ->join('transaksi_pengolahan as t', 't.id_pengolahan', '=', 'l.transaksi_pengolahan_id')
            ->join('users as u', 'u.id', '=', 't.makloon_user_id')
            ->where('l.status', 'diterima')
            ->groupBy('u.id', 'u.nama_maklon')
            ->selectRaw('u.nama_maklon as nama_maklon')
            ->selectRaw('COUNT(*) as jumlah')
            ->selectRaw('COALESCE(SUM(l.kuantum_gabah_diolah), 0) as gabah_diolah')
            ->selectRaw('COALESCE(SUM(l.kuantum_beras_hgl), 0) as beras_hgl')
            ->orderByDesc('beras_hgl')
            ->limit(self::BATAS_PERINGKAT)
            ->get()
            ->map(fn ($row) => [
                'nama_maklon' => $row->nama_maklon ?? '-',
                'jumlah' => (int) $row->jumlah,
                'gabah_diolah' => (float) $row->gabah_diolah,
                'beras_hgl' => (float) $row->beras_hgl,
                'rendemen' => (float) $row->gabah_diolah > 0
                    ? round((float) $row->beras_hgl / (float) $row->gabah_diolah * 100, 2)
                    : 0.0,
            ])
            ->all();
    }

    public function makloon(Request $request)
    {
        $activeCounts = DB::query()
            ->fromSub(function ($query) {
                $query->from('transaksi')
                    ->join('data_jemput_pangan', 'data_jemput_pangan.transaksi_id', '=', 'transaksi.id_transaksi')
                    ->where('transaksi.skema', 'TJP')
                    ->where('transaksi.status_keseluruhan', 'berjalan')
                    ->selectRaw('data_jemput_pangan.makloon_user_id as makloon_user_id, transaksi.skema as skema, count(*) as total')
                    ->groupBy('data_jemput_pangan.makloon_user_id', 'transaksi.skema');
            }, 'tjps')
            ->select('makloon_user_id', 'skema', 'total');

        $mppCounts = DB::query()
            ->from('transaksi')
            ->where('skema', 'MPP')
            ->where('status_keseluruhan', 'berjalan')
            ->selectRaw('created_by as makloon_user_id, skema, count(*) as total')
            ->groupBy('created_by', 'skema');

        $counts = DB::query()
            ->fromSub($activeCounts->unionAll($mppCounts), 'makloon_counts')
            ->select('makloon_user_id')
            ->selectRaw("sum(case when skema = 'TJP' then total else 0 end) as tjp_total")
            ->selectRaw("sum(case when skema = 'MPP' then total else 0 end) as mpp_total")
            ->groupBy('makloon_user_id');

        $makloon = User::query()
            ->whereHas('role', fn ($q) => $q->where('nama_role', 'makloon'))
            ->leftJoinSub($counts, 'counts', 'counts.makloon_user_id', '=', 'users.id')
            ->when($request->string('q')->toString(), fn ($q, $search) => $q->where('users.nama_maklon', 'like', "%{$search}%"))
            ->orderBy('users.kabupaten')
            ->orderBy('users.kecamatan')
            ->orderBy('users.nama_maklon')
            ->get([
                'users.id',
                'users.nama_maklon',
                'users.kecamatan',
                'users.kabupaten',
                'users.is_active',
                DB::raw('coalesce(counts.tjp_total, 0) as tjp_total'),
                DB::raw('coalesce(counts.mpp_total, 0) as mpp_total'),
            ]);

        $data = $makloon
            ->groupBy(fn ($item) => $item->kabupaten ?: 'Tanpa wilayah')
            ->map(fn ($items, $wilayah) => [
                'wilayah' => $wilayah,
                'total_makloon' => $items->count(),
                'makloon' => $items->map(fn ($item) => [
                    'id' => $item->id,
                    'nama_maklon' => $item->nama_maklon,
                    'kecamatan' => $item->kecamatan,
                    'kabupaten' => $item->kabupaten,
                    'is_active' => (bool) $item->is_active,
                    'transaksi_aktif' => [
                        'TJP' => (int) $item->tjp_total,
                        'MPP' => (int) $item->mpp_total,
                    ],
                ])->values(),
            ])
            ->values();

        return response()->json(['data' => $data]);
    }
}
