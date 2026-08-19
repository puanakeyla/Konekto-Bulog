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
            ->leftJoinSub(self::agregatBongkar(), 'gm', 'gm.makloon_user_id', '=', 'users.id')
            ->leftJoinSub(self::agregatEstimasiGabah(), 'gk', 'gk.makloon_user_id', '=', 'users.id')
            ->when($request->string('q')->toString(), fn ($q, $search) => $q->where('users.nama_maklon', 'like', "%{$search}%"))
            ->orderBy('users.nama_maklon')
            ->get([
                'users.*',
                DB::raw('COALESCE(gm.gabah_bongkar, 0) as gabah_masuk'),
                DB::raw('COALESCE(gk.estimasi_gabah, 0) as gabah_kembali'),
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
     */
    public function saya(Request $request)
    {
        $user = $request->user();
        $jaminan = JaminanMakloon::where('makloon_user_id', $user->id)->first();

        if (! $jaminan) {
            return response()->json(['data' => null]);
        }

        $kapasitasTotal = (float) $jaminan->kapasitas_per_hari_kg;
        $masuk = self::gabahMasuk($user->id);
        $kembali = self::gabahKembali($user->id);
        $ditangan = self::gabahDitangan($masuk, $kembali);

        return response()->json(['data' => [
            'bentuk_jaminan' => $jaminan->bentuk_jaminan,
            'jaminan_rp' => (float) $jaminan->jaminan_rp,
            'kapasitas_total_kg' => $kapasitasTotal,
            'gabah_masuk_kg' => $masuk,
            'gabah_kembali_kg' => $kembali,
            'gabah_ditangan_kg' => $ditangan,
            'sisa_dapat_diinput_kg' => self::sisaDapatDiinput($kapasitasTotal, $ditangan),
        ]]);
    }

    private static function sisaDapatDiinput(float $kapasitasTotal, float $gabahDitangan): float
    {
        return max(0, $kapasitasTotal - $gabahDitangan);
    }

    /**
     * HUTANG makloon: gabah yang sudah masuk atas namanya, dikurangi yang sudah dibayar dengan
     * setoran hasil olah ke gudang.
     *
     * Nilainya sama persis dengan kolom "Stok Pengurang Penerimaan Gudang" di neraca gabah
     * admin (MonitoringController::barisRekapMakloon) -- keduanya Gabah Sudah IN dikurangi
     * Estimasi Gabah. Itu disengaja: satu angka, dua layar, tidak boleh bercabang.
     *
     * Angkanya BERPUTAR: bertambah saat No IN terbit, berkurang saat hasil olahnya diterima
     * gudang. Makloon yang bekerja normal tidak pernah kehabisan plafon.
     *
     * Ditahan di 0 kalau pembayarannya melampaui hutangnya. Neraca membiarkan kolomnya minus
     * karena di sana minus itu informasi (ada yang diolah melebihi yang ber-IN); di sini minus
     * berbahaya, sebab ia memberi makloon kapasitas LEBIH BESAR daripada jaminan yang dipegang
     * Operasi. Itu satu-satunya perbedaan perlakuan terhadap angka yang sama.
     */
    private static function gabahDitangan(float $masuk, float $kembali): float
    {
        return max(0, $masuk - $kembali);
    }

    /**
     * Gerbang jaminan, dipanggil TransaksiController saat makloon MENGIRIM (bukan menyimpan
     * draft). Kiriman ditolak kalau gabah yang masih di tangan makloon, ditambah kiriman ini,
     * melewati kapasitas total yang dipasang Operasi.
     */
    public static function pastikanKapasitasMakloon(User $makloon, float $kuantumKg): void
    {
        // Gerbang ini BACA-LALU-TULIS: ia membaca sisa kapasitas, lalu pemanggilnya menyimpan
        // kiriman yang menghabiskannya. Tanpa kunci, dua submit yang tiba dalam jeda antara
        // keduanya sama-sama membaca sisa yang belum berkurang dan dua-duanya lolos -- plafon
        // tertembus tanpa error, tanpa jejak, dengan data tersimpan rapi.
        //
        // lockForUpdate hanya berlaku di dalam transaksi; di luar transaksi ia diam-diam tidak
        // menahan apa pun. Karena kegagalannya senyap persis seperti race yang hendak dicegah,
        // ketiadaan transaksi dijadikan error keras alih-alih dibiarkan lewat.
        if (DB::transactionLevel() === 0) {
            throw new \LogicException(
                'pastikanKapasitasMakloon() harus dipanggil di dalam DB::transaction() yang sama '
                .'dengan penyimpanan tahapnya. Di luar transaksi, penguncian barisnya tidak berlaku.'
            );
        }

        // Yang dikunci baris jaminan MAKLOON INI saja, jadi makloon lain tidak ikut mengantre.
        // Dua kiriman dari makloon yang sama memang harus berurutan -- itu justru maksudnya.
        $jaminan = JaminanMakloon::where('makloon_user_id', $makloon->id)->lockForUpdate()->first();
        if (! $jaminan) {
            abort(422, 'Jaminan makloon belum diatur Operasi. Hubungi Operasi sebelum mengirim transaksi.');
        }

        $kapasitasTotal = (float) $jaminan->kapasitas_per_hari_kg;
        $ditangan = self::gabahDitangan(self::gabahMasuk($makloon->id), self::gabahKembali($makloon->id));
        if ($ditangan + $kuantumKg > $kapasitasTotal) {
            abort(422, self::pesanKapasitas($ditangan, $kapasitasTotal, $kuantumKg));
        }
    }

    private static function pesanKapasitas(float $ditangan, float $kapasitasTotal, float $kuantumKg): string
    {
        return sprintf(
            'Kiriman %s kg ditolak: Stok Pengurang Penerimaan Gudang makloon %s kg dari kapasitas '
            .'total jaminan %s kg, jadi sisa yang dapat dikirim tinggal %s kg. '
            .'Angka itu berkurang setelah hasil olahnya ditimbang masuk gudang.',
            self::angka($kuantumKg),
            self::angka($ditangan),
            self::angka($kapasitasTotal),
            self::angka(self::sisaDapatDiinput($kapasitasTotal, $ditangan)),
        );
    }

    private function baris(User $user): array
    {
        $jaminan = $user->jaminanMakloon;
        $kapasitasTotal = (float) ($jaminan?->kapasitas_per_hari_kg ?? 0);
        // Fallback menutup lubang store(), yang memuat ulang User lewat relasi sehingga kolom
        // hasil leftJoinSub tidak ikut terbawa. Di index() kolomnya selalu ada, jadi tidak
        // pernah memicu query tambahan.
        $masuk = (float) ($user->gabah_masuk ?? self::gabahMasuk($user->id));
        $kembali = (float) ($user->gabah_kembali ?? self::gabahKembali($user->id));
        $ditangan = self::gabahDitangan($masuk, $kembali);

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
            ] : null,
            'pantauan' => [
                'gabah_masuk' => $masuk,
                'gabah_kembali' => $kembali,
                'gabah_ditangan' => $ditangan,
                'sisa_dapat_diinput_kg' => $jaminan
                    ? self::sisaDapatDiinput($kapasitasTotal, $ditangan)
                    : 0.0,
                'melewati_batas' => $jaminan ? $ditangan > $kapasitasTotal : false,
            ],
        ];
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
        $sudahIn = (float) (self::agregatBongkar($makloonUserId)->first()->gabah_bongkar ?? 0);
        $olah = self::agregatOlahPengolahan($makloonUserId)->first();

        return [
            'stok_real' => $sudahIn - (float) ($olah->olah_selesai ?? 0),
            'belum_adm_belum_olah' => $sudahIn - (float) ($olah->olah_rekap ?? 0),
        ];
    }

    /**
     * Sisi HUTANG BERTAMBAH: bongkar yang sudah diterima DAN sudah ber-No IN. Definisinya sama
     * dengan kolom "Gabah Sudah IN" di neraca gabah admin.
     *
     * No IN dijadikan syarat supaya kedua sisi berdiri di titik yang sama: yang menambah hutang
     * dan yang membayarnya sama-sama menunggu gabahnya resmi masuk. Sebelum No IN terbit
     * makloon juga belum boleh menggilingnya, jadi membebani lebih awal berarti menagih atas
     * gabah yang belum boleh ia sentuh -- ia akan mentok gara-gara PO yang lambat terbit,
     * sesuatu yang sepenuhnya di luar kendalinya.
     *
     * Konsekuensi yang disadari: ada jendela antara bongkar dan terbitnya No IN ketika gabah
     * sudah menumpuk di makloon tetapi hutangnya belum tercatat. Selama jendela itu gabahnya
     * masih utuh karena belum boleh diolah; panjang-pendeknya ada di tangan Pengadaan.
     */
    private static function gabahMasuk(int $makloonUserId): float
    {
        return (float) (self::agregatBongkar($makloonUserId)->first()->gabah_bongkar ?? 0);
    }

    /**
     * Sisi HUTANG BERKURANG: estimasi gabah, yaitu taksiran gabah di balik HGL yang benar-benar
     * ditimbang masuk gudang. Sama dengan kolom "Estimasi Gabah" di neraca gabah admin, dan
     * pengurang yang sama dengan yang dipakai kolom "Stok Pengurang Penerimaan Gudang" di sana.
     *
     * Penerimaan FISIK gudang, bukan laporan LHPK -- keputusan pemilik. Yang melunasi hutang
     * makloon adalah barang yang nyata sampai ke BULOG; LHPK hanya menyatakan gabahnya sudah
     * digiling, sedangkan berasnya bisa saja masih di makloon.
     *
     * Konsekuensi yang sudah ditimbang dan diterima: konversinya memakai rendemen ACUAN 0,51,
     * sedangkan rendemen tiap makloon berbeda. Yang di atas acuan tercatat membayar sedikit
     * lebih banyak daripada hutangnya, yang di bawah acuan menyisakan sedikit residu. Ini harga
     * dari memakai angka yang sama dengan neraca, dan dipilih dengan sadar.
     */
    private static function gabahKembali(int $makloonUserId): float
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
     *
     * Yang dihasilkan adalah kolom "Gabah Sudah IN" di neraca gabah admin: bongkar yang sudah
     * diterima DAN PO-nya sudah terbit ber-No IN. Dipakai neracaMakloon() maupun sisi hutang
     * gerbang jaminan -- keduanya berdiri di titik yang sama.
     */
    private static function agregatBongkar(?int $makloonUserId = null): \Illuminate\Database\Query\Builder
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
            ->selectRaw('COALESCE(SUM(g.kuantum), 0) as gabah_bongkar');
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
     * Alasan $makloonUserId sama dengan agregatBongkar(): saring dulu, baru kelompokkan.
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

    /**
     * Taksiran gabah di balik HGL yang sudah ditimbang masuk gudang. Dibulatkan PER PENGOLAHAN
     * sebelum dijumlah -- sama persis dengan MonitoringController::agregatGudangPengolahan(),
     * supaya kolom "Estimasi Gabah" di neraca, di Rekap Pengolahan, dan angka bayar di gerbang
     * ini selalu menampilkan bilangan yang sama.
     *
     * Hanya tahap Gudang berstatus `diterima` yang ikut: sebelum diperiksa, barangnya belum
     * tentu benar-benar sampai.
     *
     * Alasan $makloonUserId sama dengan agregatBongkar(): saring dulu, baru kelompokkan.
     */
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
