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

        self::pastikanMasihDalamTenggat($makloon->id, $tanggalBongkar, (int) $jaminan->batas_hari);

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

    /**
     * Batas hari adalah tenggat, bukan kuota tambahan.
     *
     * Jika jaminan diset 3 hari, maka transaksi yang masih menggantung harus sudah diolah
     * maksimal pada hari ke-3 sejak tanggal bongkar pertamanya. Masuk di hari ke-4 tetap ditolak,
     * walaupun kapasitas kg belum habis, karena yang dilanggar adalah waktu penuntasan.
     */
    private static function pastikanMasihDalamTenggat(int $makloonUserId, ?string $tanggalBaru, int $batasHari): void
    {
        if ($batasHari <= 0 || ! $tanggalBaru) {
            return;
        }

        $tanggalTertua = self::tanggalBongkarTertuaBelumTuntas($makloonUserId);
        if (! $tanggalTertua) {
            return;
        }

        $tanggalMasuk = \Carbon\Carbon::parse($tanggalTertua)->startOfDay();
        $tanggalInput = \Carbon\Carbon::parse($tanggalBaru)->startOfDay();

        if ($tanggalInput->lt($tanggalMasuk->copy()->addDays($batasHari))) {
            return;
        }

        abort(422, sprintf(
            'Batas hari jaminan sudah lewat. Tenggat %d hari sejak %s, jadi input baru pada %s tidak bisa dikirim sampai stok lama selesai diolah.',
            $batasHari,
            $tanggalMasuk->format('d/m/Y'),
            $tanggalInput->format('d/m/Y')
        ));
    }

    private static function tanggalBongkarTertuaBelumTuntas(int $makloonUserId): ?string
    {
        $tjp = DB::table('data_makloon_tjp as mk')
            ->join('transaksi as t', 't.id_transaksi', '=', 'mk.transaksi_id')
            ->join('data_jemput_pangan as jp', 'jp.transaksi_id', '=', 't.id_transaksi')
            ->leftJoin('po_detail as pd', 'pd.transaksi_id', '=', 't.id_transaksi')
            ->leftJoin('data_pengadaan as dp', 'dp.id', '=', 'pd.data_pengadaan_id')
            ->where('t.skema', 'TJP')
            ->where('jp.makloon_user_id', $makloonUserId)
            ->where('mk.status', 'diterima')
            ->whereNotNull('mk.tanggal_bongkar')
            ->whereRaw('COALESCE(mk.kuantum_bongkar, 0) > COALESCE((SELECT SUM(CASE WHEN dp2.status <> "dibatalkan" AND pd2.no_in IS NOT NULL AND pd2.no_in <> "" THEN pd2.kuantum_kontribusi ELSE 0 END) FROM po_detail pd2 JOIN data_pengadaan dp2 ON dp2.id = pd2.data_pengadaan_id WHERE pd2.transaksi_id = t.id_transaksi), 0)')
            ->selectRaw('MIN(mk.tanggal_bongkar) as tanggal')
            ->value('tanggal');

        $mpp = DB::table('data_makloon_mpp as mk')
            ->join('transaksi as t', 't.id_transaksi', '=', 'mk.transaksi_id')
            ->join('data_makloon_terima as mt', 'mt.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'MPP')
            ->where('t.created_by', $makloonUserId)
            ->where('mt.status', 'diterima')
            ->whereNotNull('mk.tanggal_bongkar')
            ->whereRaw('COALESCE(mt.kuantum_bongkar, 0) > COALESCE((SELECT SUM(CASE WHEN l.status = "diterima" THEN l.kuantum_gabah_diolah ELSE 0 END) FROM pengolahan_lhpk l WHERE l.transaksi_pengolahan_id = t.id_transaksi), 0)')
            ->selectRaw('MIN(mk.tanggal_bongkar) as tanggal')
            ->value('tanggal');

        if ($tjp && $mpp) {
            return min($tjp, $mpp);
        }

        return $tjp ?: $mpp;
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
            ->join('data_makloon_terima as mt', 'mt.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'MPP')
            ->where('t.created_by', $makloonUserId)
            ->where('mk.tanggal_bongkar', $tanggal)
            ->whereNotIn('mt.status', ['ditolak'])
            ->when($excludeTransaksiId, fn ($q) => $q->where('t.id_transaksi', '<>', $excludeTransaksiId))
            ->selectRaw('COALESCE(SUM(mt.kuantum_bongkar), 0) as total')
            ->value('total');

        return (float) $tjp + (float) $mpp;
    }

    private static function stokBelumAdmBelumOlah(int $makloonUserId): float
    {
        // JANGAN pakai ->value('nama_kolom') di sini. Pada query yang daftar select-nya sudah
        // diisi (dan keduanya sudah), Laravel mengabaikan nama yang diminta lalu mengembalikan
        // kolom PERTAMA -- yaitu makloon_user_id. Gerbang ini pernah membandingkan ID user
        // dengan batas kilogram karenanya, dan tidak ada yang tampak salah dari luar.
        return self::neracaMakloon($makloonUserId)['belum_adm_belum_olah'];
    }

    /**
     * Dua angka neraca satu makloon, definisinya SAMA PERSIS dengan kolom senama di neraca
     * gabah admin (MonitoringController::rekapMakloon) supaya tidak ada dua versi kebenaran:
     *
     * - stok_real            = gabah sudah IN - yang sudah diolah DAN sudah teradministrasi
     * - belum_adm_belum_olah = gabah sudah IN - seluruh yang sudah diolah
     *
     * Keduanya dipakai baca-saja di tahap UB Jastasma, dan yang kedua juga jadi dasar gerbang
     * kapasitas jaminan.
     */
    public static function neracaMakloon(int $makloonUserId): array
    {
        $sudahIn = (float) (self::agregatGabahSergab($makloonUserId)->first()->gabah_sudah_in ?? 0);
        $olah = self::agregatOlahPengolahan($makloonUserId)->first();

        return [
            'stok_real' => $sudahIn - (float) ($olah->olah_selesai ?? 0),
            'belum_adm_belum_olah' => $sudahIn - (float) ($olah->olah_rekap ?? 0),
        ];
    }

    /**
     * $makloonUserId menyaring DI DALAM, sebelum penggabungan dan pengelompokan.
     *
     * Ini bukan sekadar rapi. Pemanggil per-submit hanya butuh satu makloon, dan menyaring di
     * luar (`->where(...)` pada hasil agregat) memaksa MySQL menghitung seluruh makloon atas
     * seluruh sejarah transaksi lebih dulu, baru membuang 29/30 hasilnya. Terukur 198 ms per
     * submit di 15.000 transaksi. index() tetap memanggil tanpa argumen karena ia memang
     * membutuhkan semua baris.
     */
    private static function agregatGabahSergab(?int $makloonUserId = null): \Illuminate\Database\Query\Builder
    {
        $tjp = DB::table('transaksi as t')
            ->join('data_jemput_pangan as jp', 'jp.transaksi_id', '=', 't.id_transaksi')
            ->join('data_makloon_tjp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'TJP')
            ->where('mk.status', 'diterima')
            ->when($makloonUserId !== null, fn ($q) => $q->where('jp.makloon_user_id', $makloonUserId))
            ->selectRaw('jp.makloon_user_id as makloon_user_id')
            ->selectRaw('COALESCE(mk.kuantum_bongkar, 0) as kuantum');
        self::batasiKeSudahIn($tjp);

        // MPP: pemiliknya pembuat transaksi, bukan data_jemput_pangan (skema ini tidak punya
        // tahap JP) -- jadi kolom penyaringnya pun beda.
        // Stok memakai hasil TIMBANG, jadi sumbernya tahap Makloon Terima -- bukan kuantum
        // kirim di data_makloon_mpp. Statusnya pun status tahap itu: selama hasil timbangnya
        // belum diterima, angkanya belum final dan belum layak dihitung sebagai stok masuk.
        $mpp = DB::table('transaksi as t')
            ->join('data_makloon_terima as mt', 'mt.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'MPP')
            ->where('mt.status', 'diterima')
            ->when($makloonUserId !== null, fn ($q) => $q->where('t.created_by', $makloonUserId))
            ->selectRaw('t.created_by as makloon_user_id')
            ->selectRaw('COALESCE(mt.kuantum_bongkar, 0) as kuantum');
        self::batasiKeSudahIn($mpp);

        return DB::query()
            ->fromSub($tjp->unionAll($mpp), 'g')
            ->groupBy('g.makloon_user_id')
            ->select('g.makloon_user_id')
            ->selectRaw('COALESCE(SUM(g.kuantum), 0) as gabah_sudah_in');
    }

    /**
     * "Sudah masuk" = transaksinya punya po_detail ber-No IN pada PO yang tidak dibatalkan.
     *
     * Ditulis sebagai EXISTS di dalam, bukan LEFT JOIN ke tabel turunan berisi status PO
     * seluruh transaksi. Hasilnya identik -- baris tanpa No IN dulu ikut terbawa lalu
     * dinolkan CASE, sekarang tersaring lebih awal -- tapi EXISTS memakai indeks
     * po_detail.transaksi_id per baris, sedangkan tabel turunan itu dimaterialisasi UTUH
     * untuk setiap pemanggilan, termasuk saat yang ditanya cuma satu makloon.
     */
    private static function batasiKeSudahIn(\Illuminate\Database\Query\Builder $query): void
    {
        $query->whereExists(fn ($ada) => $ada
            ->from('po_detail as pd')
            ->join('data_pengadaan as dp', 'dp.id', '=', 'pd.data_pengadaan_id')
            ->whereColumn('pd.transaksi_id', 't.id_transaksi')
            ->where('dp.status', '<>', 'dibatalkan')
            ->whereNotNull('pd.no_in')
            ->where('pd.no_in', '<>', ''));
    }

    /** Alasan $makloonUserId sama dengan agregatGabahSergab(): saring dulu, baru kelompokkan. */
    private static function agregatOlahPengolahan(?int $makloonUserId = null): \Illuminate\Database\Query\Builder
    {
        return DB::table('transaksi_pengolahan as tp')
            ->join('pengolahan_lhpk as l', 'l.transaksi_pengolahan_id', '=', 'tp.id_pengolahan')
            ->whereNotNull('tp.makloon_user_id')
            ->when($makloonUserId !== null, fn ($q) => $q->where('tp.makloon_user_id', $makloonUserId))
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
