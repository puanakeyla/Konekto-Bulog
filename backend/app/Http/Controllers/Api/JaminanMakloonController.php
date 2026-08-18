<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JaminanMakloon;
use App\Models\PengolahanGudang;
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
            ->leftJoinSub(self::agregatEstimasiGabah(), 'eg', 'eg.makloon_user_id', '=', 'users.id')
            ->when($request->string('q')->toString(), fn ($q, $search) => $q->where('users.nama_maklon', 'like', "%{$search}%"))
            ->orderBy('users.nama_maklon')
            ->get([
                'users.*',
                DB::raw('COALESCE(sg.gabah_sudah_in, 0) as gabah_sudah_in'),
                DB::raw('COALESCE(pg.olah_rekap, 0) as olah_rekap'),
                DB::raw('COALESCE(pg.olah_selesai, 0) as olah_selesai'),
                DB::raw('COALESCE(eg.estimasi_gabah, 0) as estimasi_gabah'),
            ]);

        return response()->json(['data' => $makloon->map(fn (User $user) => $this->baris($user))->values()]);
    }

    public function store(Request $request)
    {
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $validated = $request->validate([
            'makloon_user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role_id', $makloonRoleId)->where('is_active', true)],
            // Teks bebas: daftar bentuk jaminan yang dipakai BULOG belum tentu lengkap, dan kolom
            // ini murni dibaca manusia -- tidak pernah jadi dasar perhitungan gerbang mana pun.
            'bentuk_jaminan' => ['nullable', 'string', 'max:200'],
            'jaminan_rp' => ['required', 'numeric', 'min:0', 'max:9999999999999'],
            'kapasitas_total_kg' => ['required_without:kapasitas_per_hari_kg', 'numeric', 'min:1', 'max:9999999999999'],
            'kapasitas_per_hari_kg' => ['required_without:kapasitas_total_kg', 'numeric', 'min:1', 'max:9999999999999'],
        ]);

        $jaminan = JaminanMakloon::firstOrNew(['makloon_user_id' => $validated['makloon_user_id']]);
        $before = $jaminan->exists ? $jaminan->toArray() : null;
        $jaminan->fill([
            'makloon_user_id' => $validated['makloon_user_id'],
            'bentuk_jaminan' => $validated['bentuk_jaminan'] ?? null,
            'jaminan_rp' => $validated['jaminan_rp'],
            // Nama kolom lama dipertahankan agar data lama tidak perlu dimigrasi besar-besaran.
            // Secara bisnis sekarang nilainya adalah kapasitas TOTAL, bukan kapasitas harian.
            'kapasitas_per_hari_kg' => $validated['kapasitas_total_kg'] ?? $validated['kapasitas_per_hari_kg'],
            'batas_hari' => 1,
            'updated_by' => $request->user()->id,
        ]);
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
     * Aturan jaminan milik PEMANGGIL sendiri, untuk panel read-only di form Makloon.
     *
     * Sengaja TIDAK menerima makloon_user_id: kalau bisa ditembak per id, endpoint ini jadi
     * jalan keluar baru dari isolasi makloon (bandingkan Transaksi::scopeTerlihatOleh). Satu
     * makloon hanya boleh melihat aturannya sendiri.
     *
     * `tanggal` mengikuti tanggal bongkar yang sedang diketik makloon, supaya angka
     * terpakai/sisa di layar bergerak saat ia mengubah tanggal -- bukan selalu hari ini.
     */
    public function saya(Request $request)
    {
        $user = $request->user();
        $jaminan = JaminanMakloon::where('makloon_user_id', $user->id)->first();

        if (! $jaminan) {
            return response()->json(['data' => null]);
        }

        $kapasitasTotal = (float) $jaminan->kapasitas_per_hari_kg;
        $tunggakan = self::tunggakanBelumDiolah($user->id);
        $estimasiGabah = self::estimasiGabah($user->id);

        return response()->json(['data' => [
            'bentuk_jaminan' => $jaminan->bentuk_jaminan,
            'jaminan_rp' => (float) $jaminan->jaminan_rp,
            'kapasitas_total_kg' => $kapasitasTotal,
            'kapasitas_per_hari_kg' => $kapasitasTotal,
            'batas_hari' => 1,
            'estimasi_gabah_kg' => $estimasiGabah,
            'tunggakan_kg' => $tunggakan,
            'plafon_tunggakan_kg' => $kapasitasTotal,
            'sisa_dapat_diinput_kg' => self::sisaDapatDiinput($kapasitasTotal, $estimasiGabah),
        ]]);
    }

    private static function sisaDapatDiinput(float $kapasitasTotal, float $estimasiGabah): float
    {
        return max(0, $kapasitasTotal - $estimasiGabah);
    }

    /**
     * Dipakai TransaksiController. Aturan baru memakai kapasitas total makloon.
     * Sisa jaminan dibaca dari kapasitas total dikurangi estimasi gabah hasil pengolahan.
     */
    public static function pastikanKapasitasMakloon(User $makloon, float $kuantumKg, ?string $tanggalBongkar, ?string $transaksiId = null): void
    {
        $jaminan = JaminanMakloon::where('makloon_user_id', $makloon->id)->first();
        if (! $jaminan) {
            abort(422, 'Jaminan makloon belum diatur Operasi. Hubungi Operasi sebelum mengirim transaksi.');
        }

        $kapasitasTotal = (float) $jaminan->kapasitas_per_hari_kg;
        $estimasiGabah = self::estimasiGabah($makloon->id);
        if ($estimasiGabah + $kuantumKg > $kapasitasTotal) {
            abort(422, self::pesanKapasitasTotal($makloon->id, $estimasiGabah, $kapasitasTotal));
        }
    }

    /** Batas hari sudah tidak dipakai, tetapi method ini tetap ada karena dipanggil alur MPP. */
    public static function pastikanMasihBerlaku(User $makloon, ?string $tanggalBongkar): void
    {
        return;
    }

    /**
     * Gabah yang belum diolah, DENGAN DEFINISI YANG SAMA PERSIS dengan kolom "Belum
     * Administrasi, Belum Olah" di neraca makloon (RekapMakloonTabel) -- keputusan pemilik,
     * supaya tidak ada dua angka bernama mirip yang isinya beda.
     *
     * Konsekuensi yang disadari dan diterima pemilik, JANGAN dilaporkan sebagai bug:
     *
     * - Angkanya BISA MINUS (neraca memang menandainya `bisaMinus: true`), yaitu ketika rantai
     *   Pengolahan mencatat olahan lebih besar daripada gabah yang sudah ber-No IN. Saat minus,
     *   gerbang plafon praktis tidak menahan apa pun.
     * - Basisnya `gabah_sudah_in`, yang baru terisi SETELAH Pengadaan menerbitkan No IN. Gabah
     *   yang sudah dibongkar tapi belum ber-PO tidak terhitung di sini, jadi belum membebani
     *   plafon walau fisiknya sudah menumpuk di makloon.
     */
    private static function tunggakanBelumDiolah(int $makloonUserId): float
    {
        return self::neracaMakloon($makloonUserId)['belum_adm_belum_olah'];
    }

    private static function pesanKapasitasTotal(int $makloonUserId, float $estimasiGabah, float $kapasitasTotal): string
    {
        $pesan = sprintf(
            'Estimasi gabah makloon sudah %s kg, melewati kapasitas total jaminan %s kg. '
            .'Sisa kapasitas dihitung dari kapasitas total dikurangi estimasi gabah.',
            self::angka($estimasiGabah),
            self::angka($kapasitasTotal),
        );

        $tertua = self::tanggalBongkarTertua($makloonUserId);

        return $tertua
            ? $pesan.' Gabah menunggak paling lama sejak '.\Carbon\Carbon::parse($tertua)->format('d/m/Y').'.'
            : $pesan;
    }


    private function baris(User $user): array
    {
        $jaminan = $user->jaminanMakloon;
        $kapasitasTotal = (float) ($jaminan?->kapasitas_per_hari_kg ?? 0);
        $tunggakan = $jaminan ? self::tunggakanBelumDiolah($user->id) : 0.0;
        $estimasiGabah = (float) ($user->estimasi_gabah ?? 0);

        return [
            'makloon_user_id' => $user->id,
            'nama_maklon' => $user->nama_maklon,
            'username' => $user->username,
            'kecamatan' => $user->kecamatan,
            'kabupaten' => $user->kabupaten,
            'jaminan' => $jaminan ? [
                'id' => $jaminan->id,
                'bentuk_jaminan' => $jaminan->bentuk_jaminan,
                'jaminan_rp' => (float) $jaminan->jaminan_rp,
                'kapasitas_total_kg' => $kapasitasTotal,
                'kapasitas_per_hari_kg' => $kapasitasTotal,
                'batas_hari' => 1,
                'plafon_tunggakan_kg' => $kapasitasTotal,
            ] : null,
            'pantauan' => [
                'gabah_sudah_in' => (float) $user->gabah_sudah_in,
                'olah_rekap' => (float) $user->olah_rekap,
                'olah_selesai' => (float) $user->olah_selesai,
                'estimasi_gabah' => $estimasiGabah,
                'tunggakan_kg' => $tunggakan,
                'sisa_dapat_diinput_kg' => $jaminan
                    ? self::sisaDapatDiinput($kapasitasTotal, $estimasiGabah)
                    : 0.0,
                'melewati_batas' => $jaminan ? $estimasiGabah > $kapasitasTotal : false,
            ],
        ];
    }

    /** Tanggal bongkar paling tua milik satu makloon -- dipakai sebagai konteks pesan penolakan. */
    private static function tanggalBongkarTertua(int $makloonUserId): ?string
    {
        $tjp = DB::table('transaksi as t')
            ->join('data_jemput_pangan as jp', 'jp.transaksi_id', '=', 't.id_transaksi')
            ->join('data_makloon_tjp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'TJP')
            ->where('jp.makloon_user_id', $makloonUserId)
            ->whereNotIn('mk.status', ['ditolak'])
            ->whereNotNull('mk.tanggal_bongkar')
            ->min('mk.tanggal_bongkar');

        $mpp = DB::table('transaksi as t')
            ->join('data_makloon_mpp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->join('data_makloon_terima as mt', 'mt.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'MPP')
            ->where('t.created_by', $makloonUserId)
            ->whereNotIn('mt.status', ['ditolak'])
            ->whereNotNull('mk.tanggal_bongkar')
            ->min('mk.tanggal_bongkar');

        if ($tjp && $mpp) {
            return min($tjp, $mpp);
        }

        return $tjp ?: $mpp;
    }

    /**
     * Dua angka neraca satu makloon, definisinya SAMA PERSIS dengan kolom senama di neraca
     * gabah admin (MonitoringController::rekapMakloon) supaya tidak ada dua versi kebenaran:
     *
     * - stok_real            = gabah sudah IN - yang sudah diolah DAN sudah teradministrasi
     * - belum_adm_belum_olah = gabah sudah IN - seluruh yang sudah diolah
     *
     * Dua pemakainya: panel baca-saja di tahap UB Jastasma (lewat PengolahanController), DAN
     * gerbang plafon jaminan -- tunggakanBelumDiolah() mengembalikan belum_adm_belum_olah apa
     * adanya. Karena itu mengubah rumus di sini ikut menggeser gerbang yang menahan kiriman
     * makloon; keduanya memang sengaja satu angka.
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

    private static function estimasiGabah(int $makloonUserId): float
    {
        return (float) (self::agregatEstimasiGabah($makloonUserId)->first()->estimasi_gabah ?? 0);
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

    /**
     * Alasan $makloonUserId sama dengan agregatGabahSergab(): saring dulu, baru kelompokkan.
     *
     * Rantai Pengolahan tidak terhubung ke satu transaksi SerGab tertentu -- kaitannya hanya ke
     * MAKLOON, lewat transaksi_pengolahan.makloon_user_id. Mencocokkan
     * pengolahan_lhpk.transaksi_pengolahan_id (id berakhiran /GDG atau /UBJ) dengan
     * transaksi.id_transaksi (/TJP atau /MPP) tidak akan pernah ketemu.
     *
     * Hanya LHPK berstatus `diterima` yang dihitung -- keputusan pemilik: gabah baru dianggap
     * terolah setelah MASUK REKAP, bukan begitu UB mengirimnya. Konsekuensinya makloon ikut
     * menunggu antrean pemeriksaan sebelum kuotanya terbuka lagi, dan itu memang diinginkan.
     * Sama persis dengan MonitoringController::agregatOlahPengolahan supaya angka neraca dan
     * angka gerbang tidak pernah berbeda.
     */
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

    private static function agregatEstimasiGabah(?int $makloonUserId = null): \Illuminate\Database\Query\Builder
    {
        return DB::table('transaksi_pengolahan as tp')
            ->join('pengolahan_gudang as g', 'g.transaksi_pengolahan_id', '=', 'tp.id_pengolahan')
            ->whereNotNull('tp.makloon_user_id')
            ->when($makloonUserId !== null, fn ($q) => $q->where('tp.makloon_user_id', $makloonUserId))
            ->where('g.status', 'diterima')
            ->groupBy('tp.makloon_user_id')
            ->select('tp.makloon_user_id')
            ->selectRaw('COALESCE(SUM(ROUND(g.kuantum_hgl / '.PengolahanGudang::RENDEMEN_ESTIMASI.')), 0) as estimasi_gabah');
    }

    private static function angka(float $value): string
    {
        return number_format($value, 0, ',', '.');
    }
}
