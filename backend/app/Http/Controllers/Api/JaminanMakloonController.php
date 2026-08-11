<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JaminanMakloon;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class JaminanMakloonController extends Controller
{
    public function __construct(private AuditLogService $auditLog)
    {
    }

    public function index(Request $request)
    {
        $makloon = User::query()
            ->whereHas('role', fn ($q) => $q->where('nama_role', 'makloon'))
            ->where('is_active', true)
            ->whereNotNull('nama_maklon')
            ->with(['role', 'jaminanMakloon'])
            ->leftJoinSub(self::agregatGabahSergab(), 'sg', 'sg.makloon_user_id', '=', 'users.id')
            ->leftJoinSub(self::agregatOlahPengolahan(), 'pg', 'pg.makloon_user_id', '=', 'users.id')
            ->when($request->string('q')->toString(), fn ($q, $search) => $q->where('users.nama_maklon', 'like', "%{$search}%"))
            ->orderBy('users.nama_maklon')
            ->get([
                'users.*',
                DB::raw('COALESCE(sg.gabah_sudah_in, 0) as gabah_sudah_in'),
                DB::raw('COALESCE(pg.olah_rekap, 0) as olah_rekap'),
                DB::raw('COALESCE(pg.olah_selesai, 0) as olah_selesai'),
            ]);

        return response()->json(['data' => $makloon->map(fn (User $user) => $this->baris($user))->values()]);
    }

    public function store(Request $request)
    {
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $validated = $request->validate([
            'makloon_user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role_id', $makloonRoleId)->where('is_active', true)],
            'jaminan_rp' => ['required', 'numeric', 'min:0', 'max:9999999999999'],
            'kapasitas_per_hari_kg' => ['required', 'numeric', 'min:1', 'max:9999999999999'],
            'batas_hari' => ['required', 'integer', 'min:1', 'max:365'],
        ]);

        $jaminan = JaminanMakloon::firstOrNew(['makloon_user_id' => $validated['makloon_user_id']]);
        $before = $jaminan->exists ? $jaminan->toArray() : null;
        $jaminan->fill([...$validated, 'updated_by' => $request->user()->id]);
        if (! $jaminan->exists) {
            $jaminan->created_by = $request->user()->id;
        }
        $jaminan->save();

        $this->auditLog->log($request->user(), 'operasi_jaminan_makloon_simpan', null, [
            'makloon_user_id' => $jaminan->makloon_user_id,
            'before' => $before,
            'after' => $jaminan->fresh()->toArray(),
        ]);

        return response()->json(['data' => $this->baris($jaminan->makloon()->firstOrFail())]);
    }

    /**
     * Dipakai TransaksiController: satu makloon tidak boleh memasukkan kuantum melewati kapasitas
     * harian, dan stok GKP yang belum di-ADM/belum diolah tidak boleh melewati kapasitas total
     * masa jaminan (kapasitas per hari x batas hari).
     */
    public static function pastikanKapasitasMakloon(User $makloon, float $kuantumKg, ?string $tanggalBongkar, ?string $transaksiId = null): void
    {
        $jaminan = JaminanMakloon::where('makloon_user_id', $makloon->id)->first();
        if (! $jaminan) {
            abort(422, 'Jaminan makloon belum diatur Operasi. Hubungi Operasi sebelum mengirim transaksi.');
        }

        $kapasitasHarian = (float) $jaminan->kapasitas_per_hari_kg;
        $kapasitasTotal = $kapasitasHarian * (int) $jaminan->batas_hari;

        if ($tanggalBongkar) {
            $terpakaiHariIni = self::kuantumBongkarPadaTanggal($makloon->id, $tanggalBongkar, $transaksiId);
            if ($terpakaiHariIni + $kuantumKg > $kapasitasHarian) {
                abort(422, sprintf(
                    'Kuantum melebihi kapasitas harian makloon. Kapasitas %s kg/hari, sudah terpakai %s kg pada tanggal ini, sisa %s kg.',
                    self::angka($kapasitasHarian),
                    self::angka($terpakaiHariIni),
                    self::angka(max(0, $kapasitasHarian - $terpakaiHariIni))
                ));
            }
        }

        $stokBelumAdmBelumOlah = self::stokBelumAdmBelumOlah($makloon->id);
        if ($stokBelumAdmBelumOlah + $kuantumKg > $kapasitasTotal) {
            abort(422, sprintf(
                'Stok GKP belum ADM/belum diolah melewati batas jaminan. Batas %s kg (%s kg x %d hari), posisi stok %s kg, input ini %s kg.',
                self::angka($kapasitasTotal),
                self::angka($kapasitasHarian),
                (int) $jaminan->batas_hari,
                self::angka($stokBelumAdmBelumOlah),
                self::angka($kuantumKg)
            ));
        }
    }

    private function baris(User $user): array
    {
        $jaminan = $user->jaminanMakloon;
        $kapasitasHarian = (float) ($jaminan?->kapasitas_per_hari_kg ?? 0);
        $batasHari = (int) ($jaminan?->batas_hari ?? 0);
        $stok = (float) $user->gabah_sudah_in - (float) $user->olah_rekap;

        return [
            'makloon_user_id' => $user->id,
            'nama_maklon' => $user->nama_maklon,
            'username' => $user->username,
            'kecamatan' => $user->kecamatan,
            'kabupaten' => $user->kabupaten,
            'jaminan' => $jaminan ? [
                'id' => $jaminan->id,
                'jaminan_rp' => (float) $jaminan->jaminan_rp,
                'kapasitas_per_hari_kg' => $kapasitasHarian,
                'batas_hari' => $batasHari,
                'kapasitas_total_kg' => $kapasitasHarian * $batasHari,
            ] : null,
            'pantauan' => [
                'gabah_sudah_in' => (float) $user->gabah_sudah_in,
                'olah_rekap' => (float) $user->olah_rekap,
                'olah_selesai' => (float) $user->olah_selesai,
                'belum_adm_belum_olah' => $stok,
                'melewati_batas' => $jaminan ? $stok > ($kapasitasHarian * $batasHari) : false,
            ],
        ];
    }

    private static function kuantumBongkarPadaTanggal(int $makloonUserId, string $tanggal, ?string $excludeTransaksiId): float
    {
        $tjp = DB::table('transaksi as t')
            ->join('data_jemput_pangan as jp', 'jp.transaksi_id', '=', 't.id_transaksi')
            ->join('data_makloon_tjp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'TJP')
            ->where('jp.makloon_user_id', $makloonUserId)
            ->where('mk.tanggal_bongkar', $tanggal)
            ->whereNotIn('mk.status', ['ditolak'])
            ->when($excludeTransaksiId, fn ($q) => $q->where('t.id_transaksi', '<>', $excludeTransaksiId))
            ->selectRaw('COALESCE(SUM(mk.kuantum_bongkar), 0) as total')
            ->value('total');

        $mpp = DB::table('transaksi as t')
            ->join('data_makloon_mpp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'MPP')
            ->where('t.created_by', $makloonUserId)
            ->where('mk.tanggal_bongkar', $tanggal)
            ->whereNotIn('mk.status', ['ditolak'])
            ->when($excludeTransaksiId, fn ($q) => $q->where('t.id_transaksi', '<>', $excludeTransaksiId))
            ->selectRaw('COALESCE(SUM(COALESCE(mk.kuantum_bongkar, mk.kuantum)), 0) as total')
            ->value('total');

        return (float) $tjp + (float) $mpp;
    }

    private static function stokBelumAdmBelumOlah(int $makloonUserId): float
    {
        $sg = (float) self::agregatGabahSergab()->where('g.makloon_user_id', $makloonUserId)->value('gabah_sudah_in');
        $pg = (float) self::agregatOlahPengolahan()->where('tp.makloon_user_id', $makloonUserId)->value('olah_rekap');

        return $sg - $pg;
    }

    private static function agregatGabahSergab(): \Illuminate\Database\Query\Builder
    {
        $tjp = DB::table('transaksi as t')
            ->join('data_jemput_pangan as jp', 'jp.transaksi_id', '=', 't.id_transaksi')
            ->join('data_makloon_tjp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'TJP')
            ->where('mk.status', 'diterima')
            ->selectRaw('jp.makloon_user_id as makloon_user_id')
            ->selectRaw('t.id_transaksi as transaksi_id')
            ->selectRaw('COALESCE(mk.kuantum_bongkar, 0) as kuantum');

        $mpp = DB::table('transaksi as t')
            ->join('data_makloon_mpp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'MPP')
            ->where('mk.status', 'diterima')
            ->selectRaw('t.created_by as makloon_user_id')
            ->selectRaw('t.id_transaksi as transaksi_id')
            ->selectRaw('COALESCE(mk.kuantum_bongkar, 0) as kuantum');

        return DB::query()
            ->fromSub($tjp->unionAll($mpp), 'g')
            ->leftJoinSub(self::statusPoPerTransaksi(), 'po', 'po.transaksi_id', '=', 'g.transaksi_id')
            ->groupBy('g.makloon_user_id')
            ->select('g.makloon_user_id')
            ->selectRaw('COALESCE(SUM(CASE WHEN po.ada_in = 1 THEN g.kuantum ELSE 0 END), 0) as gabah_sudah_in');
    }

    private static function statusPoPerTransaksi(): \Illuminate\Database\Query\Builder
    {
        return DB::table('po_detail as pd')
            ->join('data_pengadaan as dp', 'dp.id', '=', 'pd.data_pengadaan_id')
            ->where('dp.status', '<>', 'dibatalkan')
            ->groupBy('pd.transaksi_id')
            ->select('pd.transaksi_id')
            ->selectRaw("MAX(CASE WHEN pd.no_in IS NOT NULL AND pd.no_in <> '' THEN 1 ELSE 0 END) as ada_in");
    }

    private static function agregatOlahPengolahan(): \Illuminate\Database\Query\Builder
    {
        return DB::table('transaksi_pengolahan as tp')
            ->join('pengolahan_lhpk as l', 'l.transaksi_pengolahan_id', '=', 'tp.id_pengolahan')
            ->whereNotNull('tp.makloon_user_id')
            ->where('l.status', 'diterima')
            ->groupBy('tp.makloon_user_id')
            ->select('tp.makloon_user_id')
            ->selectRaw('COALESCE(SUM(l.kuantum_gabah_diolah), 0) as olah_rekap')
            ->selectRaw("COALESCE(SUM(CASE WHEN tp.status_keseluruhan = 'selesai' THEN l.kuantum_gabah_diolah ELSE 0 END), 0) as olah_selesai");
    }

    private static function angka(float $value): string
    {
        return number_format($value, 0, ',', '.');
    }
}
