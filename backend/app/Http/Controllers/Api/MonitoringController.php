<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStages;
use Illuminate\Http\Request;
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
                    'label' => str($stage['role'])->replace('_', ' ')->title()->toString(),
                    'total' => (int) ($stageCounts->get($stage['role'])?->total ?? 0),
                ])->values(),
            ];
        })->values();

        return response()->json(['data' => $data]);
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
