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
            // Teks bebas: daftar bentuk jaminan yang dipakai BULOG belum tentu lengkap, dan kolom
            // ini murni dibaca manusia -- tidak pernah jadi dasar perhitungan gerbang mana pun.
            'bentuk_jaminan' => ['nullable', 'string', 'max:200'],
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

        $validated = $request->validate(['tanggal' => ['nullable', 'date']]);
        $tanggal = $validated['tanggal'] ?? now()->toDateString();

        $kapasitasHarian = (float) $jaminan->kapasitas_per_hari_kg;
        $batasHari = (int) $jaminan->batas_hari;
        $plafon = $kapasitasHarian * $batasHari;
        $terpakai = self::kuantumBongkarPadaTanggal($user->id, $tanggal, null);
        $tunggakan = self::tunggakanBelumDiolah($user->id);
        [$mulai, $sampai] = self::rentangBerlaku($jaminan);

        return response()->json(['data' => [
            'bentuk_jaminan' => $jaminan->bentuk_jaminan,
            'jaminan_rp' => (float) $jaminan->jaminan_rp,
            'kapasitas_per_hari_kg' => $kapasitasHarian,
            'batas_hari' => $batasHari,
            'berlaku_mulai' => $mulai?->toDateString(),
            'berlaku_sampai' => $sampai?->toDateString(),
            // Diukur terhadap TANGGAL BONGKAR yang sedang diketik, bukan hari ini -- itulah
            // tanggal yang dipakai gerbang. Kalau memakai now(), panel bisa menyala merah
            // padahal kiriman akan lolos (atau sebaliknya), dan peringatan yang tidak cocok
            // dengan kenyataan lebih buruk daripada tidak ada peringatan.
            'masih_berlaku' => $mulai && $sampai
                ? \Carbon\Carbon::parse($tanggal)->startOfDay()->betweenIncluded($mulai, $sampai)
                : false,
            'tanggal' => $tanggal,
            'terpakai_kg' => $terpakai,
            'sisa_harian_kg' => max(0, $kapasitasHarian - $terpakai),
            'tunggakan_kg' => $tunggakan,
            'plafon_tunggakan_kg' => $plafon,
            'sisa_dapat_diinput_kg' => self::sisaDapatDiinput($kapasitasHarian, $terpakai, $tunggakan, $plafon),
        ]]);
    }

    /**
     * Berapa kg yang MASIH BISA dikirim makloon saat ini -- angka yang paling ingin diketahui
     * makloon maupun Operasi, dan satu-satunya yang tidak bisa disimpulkan sendiri dari kolom
     * lain karena ditentukan oleh gerbang mana yang lebih dulu mentok.
     *
     * Diambil yang TERKECIL antara sisa kuota harian dan sisa plafon tunggakan: melewati salah
     * satunya saja sudah cukup untuk ditolak.
     */
    private static function sisaDapatDiinput(float $kapasitasHarian, float $terpakaiHariIni, float $tunggakan, float $plafon): float
    {
        $sisaHarian = $kapasitasHarian - $terpakaiHariIni;
        $sisaPlafon = $plafon * self::TOLERANSI_SELISIH_TIMBANG - $tunggakan;

        return max(0, min($sisaHarian, $sisaPlafon));
    }

    /**
     * Toleransi selisih timbang antara kuantum bongkar makloon dan kuantum gabah yang dicatat
     * UB sebagai diolah. Keduanya tidak pernah sama persis (susut, beda alat timbang), dan
     * selisihnya bisa ke atas MAUPUN ke bawah. Karena arahnya tidak pasti, toleransi ini hanya
     * MELONGGARKAN plafon, tidak pernah memperketatnya -- toleransi yang memperketat justru
     * akan menahan makloon yang sudah tertib mengolah.
     */
    private const TOLERANSI_SELISIH_TIMBANG = 1.1;

    /**
     * Dipakai TransaksiController. Tiga gerbang, semuanya dipatok tanggal & kuantum bongkar:
     *
     * 1. Masa berlaku -- tanggal bongkar wajib berada di dalam rentang jaminan yang dipasang
     *    Operasi (tanggal simpan .. + batas_hari). Lewat itu makloon berhenti sampai Operasi
     *    memperbarui.
     * 2. Kuota harian -- sekali jalan per tanggal bongkar, sisanya hangus saat ganti hari
     *    (tidak digulung). Tidak memakai kuota bukan pelanggaran; tidak ada pesan apa pun
     *    selama makloon tidak melewatinya.
     * 3. Plafon tunggakan -- gabah yang belum diolah tidak boleh melewati
     *    kapasitas_per_hari x batas_hari. Inilah aturan "belum mengolah tapi mau input lagi".
     */
    public static function pastikanKapasitasMakloon(User $makloon, float $kuantumKg, ?string $tanggalBongkar, ?string $transaksiId = null): void
    {
        $jaminan = JaminanMakloon::where('makloon_user_id', $makloon->id)->first();
        if (! $jaminan) {
            abort(422, 'Jaminan makloon belum diatur Operasi. Hubungi Operasi sebelum mengirim transaksi.');
        }

        $kapasitasHarian = (float) $jaminan->kapasitas_per_hari_kg;
        $plafonTunggakan = $kapasitasHarian * (int) $jaminan->batas_hari;

        self::pastikanMasihBerlaku($makloon, $tanggalBongkar);

        if ($tanggalBongkar) {
            $terpakaiHariIni = self::kuantumBongkarPadaTanggal($makloon->id, $tanggalBongkar, $transaksiId);
            if ($terpakaiHariIni + $kuantumKg > $kapasitasHarian) {
                abort(422, sprintf(
                    'Kuota harian %s kg. Tanggal %s sudah terpakai %s kg, sisa %s kg.',
                    self::angka($kapasitasHarian),
                    \Carbon\Carbon::parse($tanggalBongkar)->format('d/m/Y'),
                    self::angka($terpakaiHariIni),
                    self::angka(max(0, $kapasitasHarian - $terpakaiHariIni))
                ));
            }
        }

        $tunggakan = self::tunggakanBelumDiolah($makloon->id);
        if ($tunggakan + $kuantumKg > $plafonTunggakan * self::TOLERANSI_SELISIH_TIMBANG) {
            abort(422, self::pesanTunggakan($makloon->id, $tunggakan, $kapasitasHarian, (int) $jaminan->batas_hari, $plafonTunggakan));
        }
    }

    /**
     * Gerbang masa berlaku, DIPISAH dari gerbang kuantum supaya bisa dipanggil lebih awal.
     *
     * Di skema MPP hasil timbang baru ada di tahap Makloon Terima, jadi kuota harian & plafon
     * memang harus menunggu ke sana. Tapi tanggal bongkar sudah diketik sejak tahap Makloon
     * Kirim -- kalau tanggalnya di luar masa berlaku, tidak ada gunanya membiarkan makloon
     * menyelesaikan seluruh tahap Kirim beserta unggah fotonya untuk kemudian ditolak di tahap
     * berikutnya. TransaksiController::makloon() memanggil ini langsung untuk MPP.
     *
     * Diam saja bila tanggal belum diisi atau jaminan belum diatur: keduanya sudah ditangani
     * validasi form dan gerbang pertama pastikanKapasitasMakloon().
     */
    public static function pastikanMasihBerlaku(User $makloon, ?string $tanggalBongkar): void
    {
        if (! $tanggalBongkar) {
            return;
        }

        $jaminan = JaminanMakloon::where('makloon_user_id', $makloon->id)->first();
        if (! $jaminan) {
            return;
        }

        [$mulai, $sampai] = self::rentangBerlaku($jaminan);
        if (! $mulai || ! $sampai) {
            return;
        }

        $tanggal = \Carbon\Carbon::parse($tanggalBongkar)->startOfDay();
        if ($tanggal->betweenIncluded($mulai, $sampai)) {
            return;
        }

        abort(422, sprintf(
            'Jaminan berlaku %s - %s (%d hari). Tanggal bongkar %s di luar masa berlaku. '
            .'Hubungi Operasi untuk memperbarui jaminan sebelum mengirim.',
            $mulai->format('d/m/Y'),
            $sampai->format('d/m/Y'),
            (int) $jaminan->batas_hari,
            $tanggal->format('d/m/Y'),
        ));
    }

    /**
     * Rentang berlaku jaminan: dihitung dari kapan Operasi terakhir menyimpan, bukan kolom
     * tersendiri. Satu sumber kebenaran -- tanggalnya tidak bisa melenceng dari batas_hari.
     * Inklusif: simpan 13 Agu dengan batas 3 hari berarti 13, 14, dan 15 Agu.
     *
     * @return array{0: ?\Carbon\Carbon, 1: ?\Carbon\Carbon}
     */
    private static function rentangBerlaku(JaminanMakloon $jaminan): array
    {
        if (! $jaminan->updated_at) {
            return [null, null];
        }

        $mulai = $jaminan->updated_at->copy()->startOfDay();

        return [$mulai, $mulai->copy()->addDays(max(0, (int) $jaminan->batas_hari - 1))];
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

    /** Pesan gerbang plafon: menjelaskan apa yang harus terjadi supaya kuota terbuka lagi. */
    private static function pesanTunggakan(int $makloonUserId, float $tunggakan, float $kapasitasHarian, int $batasHari, float $plafon): string
    {
        $pesan = sprintf(
            'Gabah Anda yang belum diolah UB sudah %s kg, melewati batas jaminan %s kg (%s kg x %d hari). '
            .'Input baru bisa dilakukan setelah UB Jastasma mengirim hasil olahan (LHPK) ke tahap berikutnya. '
            .'Tidak perlu menunggu sampai masuk rekap -- begitu dikirim, kuota Anda terbuka kembali.',
            self::angka($tunggakan),
            self::angka($plafon),
            self::angka($kapasitasHarian),
            $batasHari,
        );

        $tertua = self::tanggalBongkarTertua($makloonUserId);

        return $tertua
            ? $pesan.' Gabah menunggak paling lama sejak '.\Carbon\Carbon::parse($tertua)->format('d/m/Y').'.'
            : $pesan;
    }


    private function baris(User $user): array
    {
        $jaminan = $user->jaminanMakloon;
        $kapasitasHarian = (float) ($jaminan?->kapasitas_per_hari_kg ?? 0);
        $batasHari = (int) ($jaminan?->batas_hari ?? 0);
        $plafon = $kapasitasHarian * $batasHari;
        $tunggakan = $jaminan ? self::tunggakanBelumDiolah($user->id) : 0.0;
        [$mulai, $sampai] = $jaminan ? self::rentangBerlaku($jaminan) : [null, null];
        // Sisa yang bisa diinput HARI INI: gerbang harian dipatok tanggal, jadi Operasi melihat
        // posisi hari ini -- itu yang relevan saat ia memutuskan perlu memperbarui jaminan.
        $terpakaiHariIni = $jaminan ? self::kuantumBongkarPadaTanggal($user->id, now()->toDateString(), null) : 0.0;

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
                'kapasitas_per_hari_kg' => $kapasitasHarian,
                'batas_hari' => $batasHari,
                'plafon_tunggakan_kg' => $plafon,
                // Tanggal berlaku DIHITUNG dari kapan Operasi terakhir menyimpan, bukan kolom
                // tersendiri: satu sumber kebenaran, tidak bisa melenceng dari batas_hari.
                'berlaku_mulai' => $mulai?->toDateString(),
                'berlaku_sampai' => $sampai?->toDateString(),
                'masih_berlaku' => $mulai && $sampai ? now()->startOfDay()->betweenIncluded($mulai, $sampai) : false,
            ] : null,
            'pantauan' => [
                'gabah_sudah_in' => (float) $user->gabah_sudah_in,
                'olah_rekap' => (float) $user->olah_rekap,
                'olah_selesai' => (float) $user->olah_selesai,
                'tunggakan_kg' => $tunggakan,
                'terpakai_hari_ini_kg' => $terpakaiHariIni,
                'sisa_dapat_diinput_kg' => $jaminan
                    ? self::sisaDapatDiinput($kapasitasHarian, $terpakaiHariIni, $tunggakan, $plafon)
                    : 0.0,
                'melewati_batas' => $jaminan ? $tunggakan > $plafon : false,
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

    /** Tanggal bongkar paling tua milik satu makloon -- dipakai pesan gerbang plafon. */
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
     * Dipakai baca-saja di tahap UB Jastasma dan PengolahanController. TIDAK lagi jadi dasar
     * gerbang jaminan -- gerbangnya memakai tunggakanBelumDiolah(), yang mengukur dari kuantum
     * bongkar, bukan dari gabah yang sudah ber-No IN.
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

    private static function angka(float $value): string
    {
        return number_format($value, 0, ',', '.');
    }
}
