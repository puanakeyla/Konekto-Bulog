<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TransaksiResource;
use App\Models\DataJemputPangan;
use App\Models\DataKeuangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Services\AuditLogService;
use App\Services\Transaksi\KerjaanTransaksi;
use App\Services\Transaksi\TahapPengadaan;
use App\Services\Transaksi\TransaksiStageService;
use App\Services\Transaksi\TransaksiStages;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\MediaLibrary\HasMedia;

class TransaksiController extends Controller
{
    public function __construct(
        private TransaksiStageService $service,
        private AuditLogService $auditLog,
    )
    {
    }

    public function index(Request $request)
    {
        $validated = $request->validate([
            'skema' => ['sometimes', Rule::in(['TJP', 'MPP'])],
            'kerjaan' => ['sometimes', Rule::in(KerjaanTransaksi::SEMUA)],
            'pengadaan_tahap' => ['sometimes', Rule::in(TahapPengadaan::SEMUA)],
            'q' => ['sometimes', 'string', 'max:100'],
        ]);

        // Urut tanggal lalu ID pemasok (ascending) -- keduanya beda tabel per skema, jadi
        // dijoin dan di-COALESCE. Wajib di query, bukan di frontend: daftarnya paginated,
        // pengurutan per halaman akan salah lintas halaman. Tanggal memakai tanggal bongkar
        // (kunci penggabungan PO); transaksi yang tahap Makloon-nya belum diisi jatuh ke
        // tanggal kirim (TJP) lalu tanggal dibuat supaya tidak tercecer di depan.
        $query = Transaksi::query()
            ->select('transaksi.*')
            ->antreanRole($request->user()->role->nama_role)
            ->terlihatOleh($request->user())
            ->leftJoin('data_makloon_mpp', 'data_makloon_mpp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_makloon_tjp', 'data_makloon_tjp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_jemput_pangan', 'data_jemput_pangan.transaksi_id', '=', 'transaksi.id_transaksi')
            // poDetail ikut dimuat BUKAN untuk mengklasifikasi (itu urusan SQL di bawah), melainkan
            // supaya panel "Transaksi ditolak" di dashboard bisa menyebut tahap penolak & catatannya
            // untuk penolakan di level PO. Tanpa ini rejectedStages() selalu kosong untuk baris
            // Pengadaan, sehingga chip "Perlu diperbaiki" berangka tapi panelnya tidak memuat
            // apa-apa. Tiga query tambahan per halaman (bukan N+1), halaman dibatasi 20 baris.
            ->with([
                'dataJemputPangan.makloon', 'dataMakloonMpp', 'dataMakloonTerima', 'dataMakloonTjp', 'dataUbJastasma', 'creator',
                'poDetail.dataPengadaan.poDetail',
                'poDetail.dataPengadaan.dataKeuangan',
            ])
            ->orderByRaw('COALESCE(data_makloon_mpp.tanggal_bongkar, data_makloon_tjp.tanggal_bongkar, data_jemput_pangan.tanggal_kirim, DATE(transaksi.created_at))')
            ->orderByRaw("COALESCE(data_makloon_mpp.id_pemasok, data_jemput_pangan.id_pemasok, '')")
            ->orderBy('transaksi.id_transaksi');

        // Klasifikasi kerjaan dihitung SEKALI di SQL lalu ikut tiap baris, bukan dihitung ulang
        // di browser. Frontend tidak memuat data PO, jadi dulu ia terpaksa melempar Pengadaan &
        // Keuangan ke satu kategori buntu -- sekarang badge, chip, dan filter bersumber sama.
        // joinTahap() HANYA BOLEH dipanggil sekali: alias kj_* akan bentrok kalau didaftarkan dua kali.
        $query = KerjaanTransaksi::joinTahap($query)
            ->addSelect(DB::raw(KerjaanTransaksi::ekspresi().' as kerjaan'));

        // Filter skema & kerjaan dikerjakan di server, bukan di browser: daftarnya paginated,
        // jadi menyaring di frontend hanya akan menyaring halaman yang kebetulan terbuka.
        if (isset($validated['skema'])) {
            $query->where('transaksi.skema', $validated['skema']);
        }

        if (isset($validated['kerjaan'])) {
            KerjaanTransaksi::filter($query, $validated['kerjaan']);
        }

        if (($request->user()->role->nama_role ?? null) === 'pengadaan' && isset($validated['pengadaan_tahap'])) {
            TahapPengadaan::filter($query, $validated['pengadaan_tahap']);
        }

        if (isset($validated['q']) && trim($validated['q']) !== '') {
            $this->filterPencarian($query, trim($validated['q']));
        }

        // Khusus daftar "siap PO" di Pengadaan: hanya transaksi yang UB Jastasma-nya
        // sudah diterima (menunggu_review = belum ditinjau Pengadaan, jangan dimunculkan)
        // DAN belum jadi anggota PO mana pun -- `current_stage` bertahan di 'pengadaan' sampai
        // Sergab selesai, jadi tanpa whereDoesntHave() transaksi yang sudah ber-PO tetap
        // ditawarkan untuk digabung lagi.
        if ($request->boolean('siap_po')) {
            $query->whereHas('dataUbJastasma', fn ($q) => $q->where('status', 'diterima'))
                ->whereDoesntHave('poDetail');
        }

        // Dashboard menampilkan antrean sebagai akordion PER MAKLOON. Kalau halamannya dipotong
        // per sekian BARIS, satu makloon terbelah di batas halaman dan akordionnya muncul lagi
        // di halaman berikutnya -- "PT Jaya Manunggal" terlihat 2-3 kali padahal satu. Karena
        // itu mode ini memotong per MAKLOON: satu halaman memuat seluruh transaksi milik
        // sejumlah makloon, jadi satu makloon mustahil muncul di dua halaman.
        $transaksi = $request->boolean('per_makloon')
            ? $this->halamanPerMakloon($query, $request)
            : $query->paginate($request->integer('per_page', 20));

        return TransaksiResource::collection($transaksi);
    }

    /**
     * Pemilik makloon sebuah transaksi, sebagai ekspresi SQL. MPP dibuat sendiri oleh makloon
     * (transaksi.created_by); TJP dititipkan Jemput Pangan (data_jemput_pangan.makloon_user_id).
     * Padanan sisi PHP: TransaksiResource::makloonUser() -- keduanya WAJIB sepakat, kalau tidak
     * akordion frontend mengelompokkan nama yang berbeda dari yang dipakai memotong halaman.
     */
    private const PEMILIK_MAKLOON = "CASE WHEN transaksi.skema = 'MPP' THEN transaksi.created_by ELSE data_jemput_pangan.makloon_user_id END";

    /**
     * Satu halaman = sejumlah MAKLOON beserta SELURUH transaksinya, bukan sejumlah baris.
     *
     * Dua langkah, dan itu disengaja: daftar makloon diambil lebih dulu (satu kolom, DISTINCT,
     * diurut nama) lalu dipotong; baru transaksinya ditarik dengan whereIn. Mengurut lalu
     * memotong barisnya langsung tidak bisa menjamin batas halaman jatuh tepat di pergantian
     * makloon -- dan justru itulah yang bikin satu makloon tampil berulang.
     *
     * `total` pada meta karena itu berisi jumlah MAKLOON, bukan jumlah transaksi. Jumlah
     * transaksi seluruh antrean sudah disediakan DashboardController::ringkasan.
     */
    private function halamanPerMakloon(Builder $query, Request $request): LengthAwarePaginator
    {
        $daftar = DB::query()
            ->fromSub(
                (clone $query)->reorder()->select([DB::raw(self::PEMILIK_MAKLOON.' as makloon_user_id')])->distinct(),
                'm'
            )
            ->leftJoin('users as u', 'u.id', '=', 'm.makloon_user_id')
            // Baris tanpa makloon (data tahap belum terisi) ditaruh paling belakang supaya
            // tidak menempati halaman pertama yang paling sering dibuka.
            ->orderByRaw('CASE WHEN u.nama_maklon IS NULL THEN 1 ELSE 0 END')
            ->orderBy('u.nama_maklon')
            ->pluck('m.makloon_user_id');

        // Dijepit 1-50: satu makloon bisa membawa puluhan transaksi, jadi angka besar di sini
        // menarik ribuan baris sekaligus.
        //
        // ponytail: ukuran halaman dibatasi per MAKLOON, bukan per baris, jadi berat responsnya
        // mengikuti makloon tersibuk -- terukur ~390 baris / 1,0 detik untuk antrean Pengadaan
        // pada data uji 1.000 transaksi. Itu memang harga dari "satu makloon tidak boleh terbelah
        // dua halaman". Kalau satu makloon sampai membawa ribuan baris, batasi barisnya juga
        // (pilih makloon sampai anggaran baris habis) alih-alih mengecilkan angka ini lagi.
        $perPage = max(1, min($request->integer('per_page', 5), 50));
        $halaman = Paginator::resolveCurrentPage();
        $potong = $daftar->forPage($halaman, $perPage)->values();

        $items = $potong->isEmpty()
            ? collect()
            : $query->whereIn(DB::raw(self::PEMILIK_MAKLOON), $potong->all())->get();

        return new LengthAwarePaginator($items, $daftar->count(), $perPage, $halaman, [
            'path' => Paginator::resolveCurrentPath(),
            'pageName' => 'page',
        ]);
    }

    private function filterPencarian(Builder $query, string $keyword): void
    {
        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $keyword).'%';

        $query->where(function (Builder $q) use ($like) {
            $q->where('transaksi.id_transaksi', 'like', $like)
                ->orWhere('transaksi.skema', 'like', $like)
                ->orWhere('data_makloon_mpp.id_pemasok', 'like', $like)
                ->orWhere('data_jemput_pangan.id_pemasok', 'like', $like)
                ->orWhereHas('creator', fn (Builder $user) => $user
                    ->where('nama_maklon', 'like', $like)
                    ->orWhere('username', 'like', $like))
                ->orWhereHas('dataJemputPangan.makloon', fn (Builder $user) => $user
                    ->where('nama_maklon', 'like', $like)
                    ->orWhere('username', 'like', $like))
                ->orWhereHas('poDetail.dataPengadaan', fn (Builder $po) => $po
                    ->where('no_po', 'like', $like)
                    ->orWhere('no_spp', 'like', $like)
                    ->orWhere('id_pemasok', 'like', $like))
                ->orWhereHas('poDetail', fn (Builder $detail) => $detail
                    ->where('no_in', 'like', $like));
        });
    }

    /**
     * Rekap lintas tahap untuk halaman tabel/ekspor. Beda dari index(): TIDAK difilter
     * `current_stage`, jadi transaksi tetap tampil walau sudah lewat tahap role tersebut.
     * Data tiap tahap ikut dimuat sehingga tabel selalu mencerminkan kondisi terkini —
     * termasuk status kunci tiap tahap (`menunggu_review`/`diterima`/`ditolak`).
     * Visibilitas field tetap dijaga oleh resource masing-masing (lihat FieldVisibility).
     */
    public function rekap(Request $request)
    {
        $query = $this->penyaringRekap($request)
            ->select('transaksi.*')
            ->with([
                'dataJemputPangan.makloon',
                'dataMakloonMpp',
                'dataMakloonTerima',
                'dataMakloonTjp',
                'dataUbJastasma',
                'poDetail.dataPengadaan.poDetail',
                'poDetail.dataPengadaan.dataKeuangan',
                'creator',
            ])
            // Urutan blok skema: TJP dulu, baru MPP. TIDAK memakai orderBy('skema') biasa --
            // kolom `skema` adalah ENUM di MySQL (urut sesuai deklarasi ['TJP', 'MPP']),
            // tapi di SQLite (test) ENUM cuma jadi TEXT + CHECK constraint yang diurutkan
            // alfabetis, sehingga 'MPP' < 'TJP' dan blok MPP malah nongol di depan. CASE
            // eksplisit ini menghasilkan urutan yang sama persis di kedua engine.
            ->orderByRaw("CASE skema WHEN 'TJP' THEN 0 WHEN 'MPP' THEN 1 ELSE 2 END")
            // Kunci urut satu PO = TANGGAL TERAWAL di antara anggotanya, BUKAN no_po dan bukan
            // pula id_transaksi terkecil seperti dulu. `no_po` teks bebas yang diketik user
            // ("PO lala", "jaja", "PO1234") -- alfabetisnya tidak berhubungan dengan waktu.
            // Sedangkan id terkecil membuat blok PO tersusun acak menurut tanggal: satu blok
            // 25-27 Juli bisa disusul blok 30 Juli lalu tiba-tiba 24 Juli.
            //
            // Seluruh anggota satu PO memakai kunci yang SAMA, jadi mereka tetap berdampingan
            // -- itu prasyarat sel gabungan No. PO/Harga/Total di tabel frontend. Yang berubah
            // cuma urutan antar-blok. Transaksi tanpa PO memakai tanggalnya sendiri lewat
            // COALESCE. JANGAN disederhanakan jadi orderBy tanggal per baris: itu memecah
            // anggota satu PO dan membuat angka PO tampil berulang.
            ->orderByRaw('COALESCE(kunci_po.kunci, '.self::tanggalUrut().')')
            // Di dalam satu blok PO, baris ikut urut tanggal lalu id.
            ->orderByRaw(self::tanggalUrut())
            ->orderBy('id_transaksi');

        return TransaksiResource::collection($this->halamanRekap($query, $request));
    }

    /**
     * Penyaring baris rekap, tanpa select/urutan/eager-load.
     *
     * Dipakai berdua oleh daftar berhalaman dan kartu ringkasannya. Sengaja satu tempat: kalau
     * penyaringnya bercabang, kartu akan menjumlahkan himpunan yang berbeda dari baris yang
     * bisa dibuka pengguna -- selisih yang tidak menimbulkan error dan karena itu tidak pernah
     * ketahuan.
     */
    private function penyaringRekap(Request $request): Builder
    {
        $role = $request->user()->role->nama_role;

        $query = Transaksi::query()->terlihatOleh($request->user());

        // Role Jemput Pangan hanya relevan dengan skema TJP (MPP tidak punya tahap JP).
        if ($role === 'jemput_pangan') {
            $query->where('skema', 'TJP');
        }

        // Tabel rekap dipisah per skema DI BROWSER, tapi halamannya dipotong DI SERVER dan
        // urutannya menaruh seluruh blok TJP lebih dulu. Dengan 670 TJP dan per_page 200,
        // tabel MPP kosong di halaman 1-3 -- terbaca sebagai "MPP tidak ada sama sekali".
        // Karena itu tiap tabel sekarang meminta skemanya sendiri dan punya halamannya sendiri.
        if (in_array($request->query('skema'), ['TJP', 'MPP'], true)) {
            $query->where('skema', $request->query('skema'));
        }

        $this->terapkanFilterTerkunci($query, $role);

        return $query;
    }

    /**
     * Kartu angka di atas tabel Rekap, dihitung DI DATABASE atas seluruh baris yang berhak
     * dilihat pemanggil -- bukan atas satu halaman.
     *
     * Sebelumnya kartu-kartu ini dijumlah di browser dari baris yang sedang dimuat. Selama
     * datanya masih di bawah satu halaman angkanya kebetulan benar; lewat dari itu ia diam-diam
     * melaporkan sebagian, tanpa error dan tanpa tanda apa pun di layar.
     *
     * Kuantum MPP diambil dari `data_makloon_terima`, BUKAN `data_makloon_mpp.kuantum_bongkar`.
     * Kolom yang belakangan itu sudah tidak diisi siapa pun sejak tahap Makloon Terima punya
     * tabel sendiri -- sumber yang sama dipakai PoGroupingService dan neraca makloon.
     */
    public function ringkasanRekap(Request $request)
    {
        $angka = $this->penyaringRekap($request)
            ->leftJoin('data_makloon_tjp as rk_tjp', 'rk_tjp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_makloon_terima as rk_mt', 'rk_mt.transaksi_id', '=', 'transaksi.id_transaksi')
            ->selectRaw("COALESCE(SUM(CASE WHEN transaksi.skema = 'TJP' THEN rk_tjp.kuantum_bongkar ELSE 0 END), 0) as bongkar_tjp")
            ->selectRaw("COALESCE(SUM(CASE WHEN transaksi.skema = 'MPP' THEN rk_mt.kuantum_bongkar ELSE 0 END), 0) as bongkar_mpp")
            ->selectRaw("COALESCE(SUM(CASE WHEN transaksi.skema = 'TJP' THEN 1 ELSE 0 END), 0) as jumlah_tjp")
            ->selectRaw("COALESCE(SUM(CASE WHEN transaksi.skema = 'MPP' THEN 1 ELSE 0 END), 0) as jumlah_mpp")
            ->first();

        // PO dihitung dari no_po yang BERBEDA, bukan dari jumlah baris po_detail: satu PO
        // menggabungkan banyak transaksi, dan tabelnya pun menampilkannya sebagai satu blok.
        $totalPo = $this->penyaringRekap($request)
            ->join('po_detail as rk_pd', 'rk_pd.transaksi_id', '=', 'transaksi.id_transaksi')
            ->join('data_pengadaan as rk_dp', 'rk_dp.id', '=', 'rk_pd.data_pengadaan_id')
            ->distinct()
            ->count('rk_dp.no_po');

        return response()->json(['data' => [
            'bongkar_tjp' => (float) $angka->bongkar_tjp,
            'bongkar_mpp' => (float) $angka->bongkar_mpp,
            'jumlah_tjp' => (int) $angka->jumlah_tjp,
            'jumlah_mpp' => (int) $angka->jumlah_mpp,
            'total_po' => $totalPo,
        ]]);
    }

    /**
     * Pagination rekap yang memisahkan JUMLAH dari URUTAN.
     *
     * paginate() bawaan mengkloning seluruh query untuk COUNT(*), termasuk join yang semata-mata
     * dibutuhkan ORDER BY. Di 15.000 transaksi itu 812 ms terbuang hanya untuk menghitung baris
     * -- jumlahnya sama persis dengan atau tanpa join, karena join-nya LEFT dan kuncinya unik
     * per transaksi. Jadi: hitung dulu tanpa join, baru pasang join pengurut untuk satu halaman.
     */
    private function halamanRekap(Builder $query, Request $request): LengthAwarePaginator
    {
        // Dijepit 1-500. Tanpa batas atas, `?per_page=100000` menarik seluruh rekap beserta
        // relasinya ke memori PHP dalam satu permintaan -- persis kondisi yang dulu membuat
        // rekap pengolahan fatal di 512 MB. 500 adalah ukuran yang dipakai ekspor CSV.
        $perPage = max(1, min($request->integer('per_page', 100), 500));
        $halaman = Paginator::resolveCurrentPage();
        $total = (clone $query)->reorder()->count();

        $items = $query
            // Join khusus pengurutan, dipasang di sini saja supaya COUNT di atas tidak ikut
            // menanggungnya. Keduanya satu-baris-per-transaksi, jadi tidak menggandakan baris.
            ->leftJoin('data_jemput_pangan as ur_jp', 'ur_jp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_makloon_mpp as ur_mpp', 'ur_mpp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoinSub($this->kunciUrutPo(), 'kunci_po', 'kunci_po.transaksi_id', '=', 'transaksi.id_transaksi')
            ->forPage($halaman, $perPage)
            ->get();

        return new LengthAwarePaginator($items, $total, $perPage, $halaman, [
            'path' => Paginator::resolveCurrentPath(),
            'pageName' => 'page',
        ]);
    }

    /**
     * Kunci urut per transaksi = id_transaksi TERKECIL di antara sesama anggota PO-nya.
     *
     * Bertingkat, dan itu disengaja: MIN per PO dulu (satu baris per PO), baru dipetakan ke
     * tiap anggotanya. Men-self-join po_detail secara langsung menghasilkan anggota x anggota
     * baris antara -- 75.000 baris untuk 15.000 po_detail -- sebelum sempat dikelompokkan.
     *
     * GROUP BY pd.transaksi_id di lapis luar menjamin satu baris per transaksi, sehingga join
     * di halamanRekap() tidak pernah menggandakan baris andai satu transaksi tercatat di lebih
     * dari satu PO.
     */
    /**
     * Tanggal yang memandu urutan rekap: tanggal KIRIM untuk TJP (milik tahap Jemput Pangan),
     * tanggal BONGKAR untuk MPP. MPP tidak lewat Jemput Pangan sehingga tidak punya tanggal
     * kirim, dan bongkar adalah satu-satunya tanggal lapangan yang dimilikinya. Jatuh ke
     * tanggal transaksi dibuat kalau keduanya belum diisi, supaya baris yang datanya masih
     * kosong tidak menumpuk di depan sebagai NULL.
     */
    private static function tanggalUrut(string $transaksi = 'transaksi', string $jp = 'ur_jp', string $mpp = 'ur_mpp'): string
    {
        return "COALESCE({$jp}.tanggal_kirim, {$mpp}.tanggal_bongkar, DATE({$transaksi}.created_at))";
    }

    private function kunciUrutPo(): \Illuminate\Database\Query\Builder
    {
        $minPerPo = DB::table('po_detail as pdx')
            ->join('transaksi as tx', 'tx.id_transaksi', '=', 'pdx.transaksi_id')
            ->leftJoin('data_jemput_pangan as jpx', 'jpx.transaksi_id', '=', 'tx.id_transaksi')
            ->leftJoin('data_makloon_mpp as mppx', 'mppx.transaksi_id', '=', 'tx.id_transaksi')
            ->groupBy('pdx.data_pengadaan_id')
            ->select('pdx.data_pengadaan_id')
            ->selectRaw('MIN('.self::tanggalUrut('tx', 'jpx', 'mppx').') as kunci');

        return DB::table('po_detail as pd')
            ->joinSub($minPerPo, 'm', 'm.data_pengadaan_id', '=', 'pd.data_pengadaan_id')
            ->groupBy('pd.transaksi_id')
            ->select('pd.transaksi_id')
            ->selectRaw('MIN(m.kunci) as kunci');
    }

    /**
     * Hanya data terkunci yang boleh masuk rekap. "Terkunci" = sudah disimpan dan sudah
     * diterima role berikutnya, sehingga tidak bisa diubah lagi kecuali oleh admin —
     * persis kondisi yang ditolak TransaksiStageService::submitStage().
     *
     * Tahap per transaksi memakai kolom `status`; tahap level PO (pengadaan/keuangan)
     * memakai `review_status` karena datanya milik PO gabungan, bukan satu transaksi.
     * Admin memakai aturan paling longgar (tahap awal saja) karena justru admin yang
     * bertugas memperbaiki transaksi bermasalah di tahap-tahap lanjut.
     */
    private function terapkanFilterTerkunci(Builder $query, string $role): void
    {
        match ($role) {
            'jemput_pangan' => $query->whereHas('dataJemputPangan',
                fn (Builder $q) => $q->where('status', 'diterima')),
            'ub_jastasma' => $query->whereHas('dataUbJastasma',
                fn (Builder $q) => $q->where('status', 'diterima')),
            'makloon' => $query->where(function (Builder $q) {
                $q->where(fn (Builder $t) => $t->where('skema', 'TJP')
                    ->whereHas('dataMakloonTjp', fn (Builder $m) => $m->where('status', 'diterima')))
                    ->orWhere(fn (Builder $t) => $t->where('skema', 'MPP')
                        ->whereHas('dataMakloonMpp', fn (Builder $m) => $m->where('status', 'diterima')));
            }),
            'pengadaan' => $query->whereHas('poDetail.dataPengadaan',
                fn (Builder $q) => $q->where('review_status', 'diterima')),
            // Keuangan terkunci ketika pembayaran sudah difinalisasi. updatePembayaran()
            // menandai data_keuangan.review_status = 'diterima' bersamaan saat status_bayar
            // jadi 'dibayarkan', jadi 'diterima' itulah penanda final (konsisten dengan
            // filter 'pengadaan' di atas). Memakai status_bayar saja akan ikut menampilkan
            // baris pembayaran yang belum difinalisasi.
            'keuangan' => $query->whereHas('poDetail.dataPengadaan.dataKeuangan',
                fn (Builder $q) => $q->where('review_status', 'diterima')),
            // Tahap awal: Jemput Pangan untuk TJP, Makloon untuk MPP (lihat TransaksiStages::sequence()).
            'admin' => $query->where(function (Builder $q) {
                $q->where(fn (Builder $t) => $t->where('skema', 'TJP')
                    ->whereHas('dataJemputPangan', fn (Builder $m) => $m->where('status', 'diterima')))
                    ->orWhere(fn (Builder $t) => $t->where('skema', 'MPP')
                        ->whereHas('dataMakloonMpp', fn (Builder $m) => $m->where('status', 'diterima')));
            }),
            default => null,
        };
    }

    public function show(Request $request, Transaksi $transaksi)
    {
        // 404 dan bukan 403: id_transaksi berpola urut, jadi 403 tetap membocorkan transaksi
        // makloon lain itu ADA. Bagi peminta yang tak berhak, transaksinya seolah tidak pernah ada.
        abort_unless($transaksi->bolehDilihatOleh($request->user()), 404);

        $transaksi->load([
            'dataJemputPangan.makloon',
            'dataMakloonMpp',
                'dataMakloonTerima',
            'dataMakloonTjp',
            'dataUbJastasma',
            'creator',
            'riwayatPenolakan.penolak',
            // PO tempat transaksi ini bernaung (bila sudah tergabung). Dimuat lengkap dengan
            // seluruh transaksi anggota + data keuangan supaya panel Pengadaan/Keuangan bisa
            // dirender inline di timeline tanpa memanggil endpoint /po terpisah.
            'poDetail.dataPengadaan.poDetail.transaksi',
            'poDetail.dataPengadaan.dataKeuangan',
            'poDetail.dataPengadaan.makloon',
        ]);

        $transaksi->setRelation('riwayatPenolakan', $transaksi->riwayatPenolakan->sortBy('ditolak_pada')->values());

        return response()->json(['data' => new TransaksiResource($transaksi)]);
    }

    /**
     * Blok data yang boleh disentuh tiap role saat aksesnya dibuka admin. Nilai `null`
     * berarti seluruh field blok itu; array berarti hanya field tersebut (Pengadaan dan
     * Keuangan berbagi blok `data_pengadaan` tapi memiliki field yang berbeda).
     * Admin tidak lewat peta ini -- dia boleh semuanya.
     */
    private const SCOPE_EDIT_REKAP = [
        'jemput_pangan' => ['data_jemput_pangan' => null],
        // Makloon Terima ikut blok 'makloon': pelakunya role yang sama, cuma tahapnya beda.
        'makloon' => ['data_makloon_tjp' => null, 'data_makloon_mpp' => null, 'data_makloon_terima' => null],
        'ub_jastasma' => ['data_ub_jastasma' => null],
        'pengadaan' => ['data_pengadaan' => ['no_po', 'no_in', 'harga']],
        'keuangan' => ['data_pengadaan' => ['no_spp', 'tanggal_bayar']],
    ];

    /**
     * Koreksi data yang sudah terkunci. Dulu admin-only; kini juga terbuka untuk user yang
     * aksesnya dibuka admin di Kelola User -- dengan tiga pembatas: hanya blok field milik
     * role-nya (SCOPE_EDIT_REKAP), hanya transaksi yang dia tangani (dimilikiOleh), dan
     * aksesnya tertutup otomatis begitu satu penyimpanan berhasil.
     */
    public function adminUpdateRekap(Request $request, Transaksi $transaksi)
    {
        $user = $request->user();
        $role = $user->role->nama_role;

        abort_unless($user->bolehEditRekap(), 403, 'Akses edit rekap Anda belum dibuka Admin.');

        if ($role !== 'admin') {
            abort_unless($transaksi->dimilikiOleh($user), 403, 'Anda hanya boleh memperbaiki transaksi yang Anda tangani.');
        }

        $validated = $request->validate([
            'data_jemput_pangan' => ['sometimes', 'array'],
            'data_jemput_pangan.id_pemasok' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.supir' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.plat_mobil' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.nama_poktan_gapoktan' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.desa' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.kecamatan' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.kabupaten' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.makloon_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'data_jemput_pangan.tanggal_kirim' => ['nullable', 'date'],
            'data_jemput_pangan.kuantum' => ['nullable', 'integer', 'min:0', 'max:9999999999999'],
            'data_jemput_pangan.jarak_ke_makloon_km' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],

            'data_makloon_tjp' => ['sometimes', 'array'],
            'data_makloon_tjp.tanggal_bongkar' => ['nullable', 'date'],
            'data_makloon_tjp.kuantum_bongkar' => ['nullable', 'integer', 'min:0', 'max:9999999999999'],

            'data_makloon_mpp' => ['sometimes', 'array'],
            'data_makloon_mpp.id_pemasok' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.supir' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.plat_mobil' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.desa' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.kecamatan' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.kabupaten' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.tanggal_bongkar' => ['nullable', 'date'],
            'data_makloon_mpp.kuantum' => ['nullable', 'integer', 'min:0', 'max:9999999999999'],
            'data_makloon_mpp.jarak_ke_makloon_km' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],

            // Hasil timbang pindah ke tahapnya sendiri; koreksinya pun ikut ke sana.
            'data_makloon_terima' => ['sometimes', 'array'],
            'data_makloon_terima.kuantum_bongkar' => ['nullable', 'integer', 'min:0', 'max:9999999999999'],

            'data_ub_jastasma' => ['sometimes', 'array'],
            'data_ub_jastasma.ka1' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.ka2' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.ka3' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.hampa' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.butir_hijau' => ['nullable', 'numeric', 'min:0', 'max:100'],

            'data_pengadaan' => ['sometimes', 'array'],
            'data_pengadaan.no_po' => ['nullable', 'string', 'max:255'],
            'data_pengadaan.no_in' => ['nullable', 'string', 'max:255'],
            'data_pengadaan.harga' => ['nullable', 'integer', 'min:0', 'max:9999999999999'],
            'data_pengadaan.no_spp' => ['nullable', 'string', 'max:255'],
            'data_pengadaan.tanggal_bayar' => ['nullable', 'date'],
        ]);

        // Penjaga sebenarnya ada di sini, bukan di UI: apa pun yang dikirim non-admin
        // disaring ke blok miliknya dulu, jadi payload yang dirakit manual pun tidak bisa
        // menyentuh tahap role lain.
        if ($role !== 'admin') {
            $validated = $this->batasiScopeRekap($validated, $role);
            abort_if($validated === [], 403, 'Tidak ada data tahap Anda yang bisa diubah di transaksi ini.');
        }

        return DB::transaction(function () use ($request, $user, $role, $transaksi, $validated) {
            $before = $this->adminSnapshot($transaksi);

            if (array_key_exists('data_jemput_pangan', $validated) && $transaksi->dataJemputPangan) {
                $transaksi->dataJemputPangan->update($validated['data_jemput_pangan']);
            }

            if (array_key_exists('data_makloon_tjp', $validated) && $transaksi->dataMakloonTjp) {
                $transaksi->dataMakloonTjp->update($validated['data_makloon_tjp']);
            }

            if (array_key_exists('data_makloon_terima', $validated) && $transaksi->dataMakloonTerima) {
                $transaksi->dataMakloonTerima->update($validated['data_makloon_terima']);
            }

            if (array_key_exists('data_makloon_mpp', $validated) && $transaksi->dataMakloonMpp) {
                $transaksi->dataMakloonMpp->update($validated['data_makloon_mpp']);
            }

            if (array_key_exists('data_ub_jastasma', $validated) && $transaksi->dataUbJastasma) {
                $transaksi->dataUbJastasma->update($validated['data_ub_jastasma']);
            }

            if (array_key_exists('data_pengadaan', $validated)) {
                $poDetail = $transaksi->poDetail()->with('dataPengadaan.dataKeuangan')->first();
                $pengadaan = $poDetail?->dataPengadaan;
                $payload = $validated['data_pengadaan'];

                if ($pengadaan) {
                    $pengadaanData = array_intersect_key($payload, array_flip(['no_po', 'harga', 'no_spp']));
                    if (array_key_exists('harga', $pengadaanData)) {
                        $pengadaanData['total_harga'] = number_format((float) $pengadaan->total_kuantum * (float) $pengadaanData['harga'], 2, '.', '');
                    }
                    if ($pengadaanData !== []) {
                        $pengadaan->update($pengadaanData);
                    }

                    if (array_key_exists('no_in', $payload) && $poDetail) {
                        $poDetail->update(['no_in' => $payload['no_in']]);
                    }

                    if (array_key_exists('tanggal_bayar', $payload)) {
                        DataKeuangan::updateOrCreate(
                            ['data_pengadaan_id' => $pengadaan->id],
                            ['tanggal_bayar' => $payload['tanggal_bayar'], 'status_bayar' => $payload['tanggal_bayar'] ? 'dibayarkan' : 'belum']
                        );
                    }
                }
            }

            $this->sinkronkanKuantumPo($transaksi);

            $this->auditLog->log($request->user(), $role === 'admin' ? 'admin_rekap_update' : 'rekap_update_akses', $transaksi->id_transaksi, [
                'before' => $before,
                'after' => $this->adminSnapshot($transaksi->fresh()),
                'role' => $role,
            ]);

            // Jatah berkurang satu tiap koreksi yang benar-benar tersimpan; begitu habis,
            // kuncinya balik seperti semula tanpa admin harus ingat menutupnya.
            $user->pakaiJatahEdit();

            $transaksi->load(['dataJemputPangan.makloon', 'dataMakloonMpp', 'dataMakloonTerima', 'dataMakloonTjp', 'dataUbJastasma', 'poDetail.dataPengadaan.poDetail', 'poDetail.dataPengadaan.dataKeuangan', 'creator']);

            return response()->json(['data' => new TransaksiResource($transaksi)]);
        });
    }

    public function destroy(Request $request, Transaksi $transaksi)
    {
        abort_unless($request->user()->role->nama_role === 'admin', 403);

        return DB::transaction(function () use ($request, $transaksi) {
            $transaksiId = $transaksi->id_transaksi;
            $poIds = $transaksi->poDetail()->pluck('data_pengadaan_id')->unique()->values();

            $this->auditLog->log($request->user(), 'admin_rekap_delete', $transaksiId, [
                'transaksi' => $this->adminSnapshot($transaksi),
            ]);

            $transaksi->delete();

            foreach ($poIds as $poId) {
                $pengadaan = \App\Models\DataPengadaan::with('poDetail')->find($poId);
                if (! $pengadaan) {
                    continue;
                }

                $totalKuantum = (float) $pengadaan->poDetail->sum('kuantum_kontribusi');
                if ($totalKuantum <= 0) {
                    $pengadaan->delete();
                    continue;
                }

                $pengadaan->update([
                    'total_kuantum' => number_format($totalKuantum, 2, '.', ''),
                    'total_harga' => number_format($totalKuantum * (float) $pengadaan->harga, 2, '.', ''),
                ]);
            }

            return response()->json(['message' => 'Transaksi dihapus dari rekap.']);
        });
    }

    /**
     * Samakan kembali PO dengan kuantum transaksi setelah dikoreksi lewat rekap. Tanpa ini
     * PO tetap memakai angka lama: mengoreksi 100 kg jadi 80 kg mengubah baris transaksi
     * tapi total PO (dan total harganya) masih menghitung 100 kg.
     *
     * Sumber kuantum PO berbeda per skema — MPP memakai kuantum makloon, TJP memakai
     * kuantum bongkar makloon — persis seperti PoGroupingService::resolveMakloonData().
     * Kalau aturan di sana berubah, ubah di sini juga.
     */
    private function sinkronkanKuantumPo(Transaksi $transaksi): void
    {
        $poDetail = $transaksi->poDetail()->with('dataPengadaan')->first();
        $pengadaan = $poDetail?->dataPengadaan;

        if (! $pengadaan) {
            return;
        }

        $transaksi->refresh();
        $kuantum = $transaksi->skema === 'MPP'
            ? $transaksi->dataMakloonTerima?->kuantum_bongkar ?? $transaksi->dataMakloonMpp?->kuantum
            : $transaksi->dataMakloonTjp?->kuantum_bongkar;

        if ($kuantum !== null) {
            $poDetail->update(['kuantum_kontribusi' => number_format((float) $kuantum, 2, '.', '')]);
        }

        // Harga bisa ikut diubah di request yang sama, jadi baca ulang sebelum mengalikan.
        $pengadaan->refresh();
        $totalKuantum = (float) $pengadaan->poDetail()->sum('kuantum_kontribusi');

        $pengadaan->update([
            'total_kuantum' => number_format($totalKuantum, 2, '.', ''),
            'total_harga' => number_format($totalKuantum * (float) $pengadaan->harga, 2, '.', ''),
        ]);
    }

    /**
     * Buang seluruh blok/field di luar jatah role. Blok yang tidak dikirim tetap tidak
     * dikirim (bukan dikosongkan), sehingga hasilnya aman dioper apa adanya ke update().
     */
    private function batasiScopeRekap(array $validated, string $role): array
    {
        $hasil = [];

        foreach (self::SCOPE_EDIT_REKAP[$role] ?? [] as $blok => $fields) {
            if (! array_key_exists($blok, $validated)) {
                continue;
            }

            $isi = $fields === null ? $validated[$blok] : Arr::only($validated[$blok], $fields);
            if ($isi !== []) {
                $hasil[$blok] = $isi;
            }
        }

        return $hasil;
    }

    private function adminSnapshot(Transaksi $transaksi): array
    {
        $transaksi->loadMissing(['dataJemputPangan', 'dataMakloonMpp', 'dataMakloonTerima', 'dataMakloonTjp', 'dataUbJastasma', 'poDetail.dataPengadaan.dataKeuangan']);
        $pengadaan = $transaksi->poDetail->first()?->dataPengadaan;

        return [
            'id_transaksi' => $transaksi->id_transaksi,
            'skema' => $transaksi->skema,
            'current_stage' => $transaksi->current_stage,
            'status_keseluruhan' => $transaksi->status_keseluruhan,
            'data_jemput_pangan' => $transaksi->dataJemputPangan?->only(['id_pemasok', 'supir', 'plat_mobil', 'nama_poktan_gapoktan', 'desa', 'kecamatan', 'kabupaten', 'makloon_user_id', 'tanggal_kirim', 'kuantum', 'jarak_ke_makloon_km']),
            'data_makloon_tjp' => $transaksi->dataMakloonTjp?->only(['tanggal_bongkar', 'kuantum_bongkar']),
            'data_makloon_mpp' => $transaksi->dataMakloonMpp?->only(['id_pemasok', 'supir', 'plat_mobil', 'desa', 'kecamatan', 'kabupaten', 'tanggal_bongkar', 'kuantum', 'kuantum_bongkar', 'jarak_ke_makloon_km']),
            'data_makloon_terima' => $transaksi->dataMakloonTerima?->only(['kuantum_bongkar']),
            'data_ub_jastasma' => $transaksi->dataUbJastasma?->only(['ka1', 'ka2', 'ka3', 'hampa', 'butir_hijau']),
            'data_pengadaan' => $pengadaan ? [
                'no_po' => $pengadaan->no_po,
                'no_in' => $transaksi->poDetail->first()?->no_in,
                'harga' => $pengadaan->harga,
                'no_spp' => $pengadaan->no_spp,
                'tanggal_bayar' => $pengadaan->dataKeuangan?->tanggal_bayar,
            ] : null,
        ];
    }

    public function store(Request $request)
    {
        $transaksi = $this->service->createTransaksi($request->user());

        return response()->json(['data' => $transaksi], 201);
    }

    public function jemputPangan(Request $request, Transaksi $transaksi)
    {
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $aksi = $this->aksiSimpan($request);
        $required = $aksi === 'submit' ? 'required' : 'nullable';

        $data = $request->validate([
            'aksi' => ['sometimes', Rule::in(['draft', 'submit'])],
            'id_pemasok' => [$required, 'string', 'max:255'],
            'supir' => [$required, 'string', 'max:255'],
            'plat_mobil' => [$required, 'string', 'max:255'],
            'nama_poktan_gapoktan' => [$required, 'string', 'max:255'],
            'desa' => [$required, 'string', 'max:255'],
            'kecamatan' => [$required, 'string', 'max:255'],
            'kabupaten' => [$required, 'string', 'max:255'],
            'makloon_user_id' => [$required, Rule::exists('users', 'id')->where('role_id', $makloonRoleId)],
            'tanggal_kirim' => [$required, 'date'],
            'kuantum' => [$required, 'integer', 'min:0', 'max:9999999999999'],
            'jarak_ke_makloon_km' => [$required, 'numeric', 'min:0', 'max:99999999.99'],
        ]);
        unset($data['aksi']);

        if ($aksi === 'draft') {
            $record = $this->service->saveDraft($transaksi, $request->user(), 'jemput_pangan', DataJemputPangan::class, $data);
        } else {
            $this->pastikanDokumenLengkap($transaksi, DataJemputPangan::class);
            $record = $this->service->submitStage($transaksi, $request->user(), 'jemput_pangan', DataJemputPangan::class, $data);
        }

        return response()->json(['data' => $record]);
    }

    public function makloon(Request $request, Transaksi $transaksi)
    {
        $aksi = $this->aksiSimpan($request);
        $required = $aksi === 'submit' ? 'required' : 'nullable';

        if ($transaksi->skema === 'TJP') {
            $data = $request->validate([
                'aksi' => ['sometimes', Rule::in(['draft', 'submit'])],
                'tanggal_bongkar' => [$required, 'date'],
                'kuantum_bongkar' => [$required, 'integer', 'min:0', 'max:9999999999999'],
            ]);
            $model = DataMakloonTjp::class;
        } else {
            $data = $request->validate([
                'aksi' => ['sometimes', Rule::in(['draft', 'submit'])],
                'id_pemasok' => [$required, 'string', 'max:255'],
                'supir' => [$required, 'string', 'max:255'],
                'plat_mobil' => [$required, 'string', 'max:255'],
                'desa' => [$required, 'string', 'max:255'],
                'kecamatan' => [$required, 'string', 'max:255'],
                'kabupaten' => [$required, 'string', 'max:255'],
                'tanggal_bongkar' => [$required, 'date'],
                'kuantum' => [$required, 'integer', 'min:0', 'max:9999999999999'],
                'jarak_ke_makloon_km' => [$required, 'numeric', 'min:0', 'max:99999999.99'],
            ]);
            $model = DataMakloonMpp::class;
        }
        unset($data['aksi']);

        $stage = $transaksi->skema === 'MPP' ? 'makloon_kirim' : 'makloon';
        if ($aksi === 'draft') {
            $record = $this->service->saveDraft($transaksi, $request->user(), $stage, $model, $data);
        } else {
            // Gerbang jaminan dan penyimpanannya WAJIB satu transaksi: gerbangnya mengunci baris
            // jaminan makloon, dan kunci itu baru bermakna kalau ia bertahan sampai kiriman ini
            // tersimpan. Lihat JaminanMakloonController::pastikanKapasitasMakloon().
            $record = DB::transaction(function () use ($request, $transaksi, $data, $model, $stage) {
                // TJP baru punya kuantum final di tahap Makloon, jadi gerbang jaminan ada di sini.
                // MPP tidak diperiksa di sini: kuantum kirim masih angka rencana, dan gerbangnya
                // menunggu hasil timbang di tahap Makloon Terima.
                if ($transaksi->skema === 'TJP') {
                    $this->pastikanKapasitasJaminanMakloon($request, $transaksi, $data);
                }
                // MPP: surat jalan & nota timbang bukan dokumen tahap Makloon Kirim -- keduanya
                // diunggah nanti di tahap Makloon Terima, jadi jangan dituntut di sini.
                $this->pastikanDokumenLengkap($transaksi, $model, $transaksi->skema === 'MPP' ? DataMakloonMpp::FOTO_TAHAP_KIRIM : null);

                return $this->service->submitStage($transaksi, $request->user(), $stage, $model, $data);
            });
        }

        return response()->json(['data' => $record]);
    }

    /**
     * Tahap Makloon Terima (MPP): hasil timbang setelah bongkar, beserta surat jalan & nota
     * timbang. Baru bisa diisi setelah data Makloon Kirim diterima -- penjagaannya ada di
     * TransaksiStageService lewat current_stage, sama seperti tahap lain.
     *
     * Kapasitas jaminan MPP dicek DI SINI, bukan di Makloon Kirim. Kuantum kirim masih angka
     * rencana/awal; gerbang kapasitas harus memakai hasil timbang bongkar yang final.
     */
    public function makloonTerima(Request $request, Transaksi $transaksi)
    {
        if ($transaksi->skema !== 'MPP') {
            abort(422, 'Tahap Makloon Terima hanya ada pada skema MPP.');
        }

        $aksi = $this->aksiSimpan($request);
        $required = $aksi === 'submit' ? 'required' : 'nullable';

        $data = $request->validate([
            'aksi' => ['sometimes', Rule::in(['draft', 'submit'])],
            'kuantum_bongkar' => [$required, 'integer', 'min:0', 'max:9999999999999'],
        ]);
        unset($data['aksi']);

        if ($aksi === 'draft') {
            $record = $this->service->saveDraft($transaksi, $request->user(), 'makloon_terima', DataMakloonTerima::class, $data);
        } else {
            // Satu transaksi dengan gerbangnya -- alasan yang sama seperti di makloon().
            $record = DB::transaction(function () use ($request, $transaksi, $data) {
                $this->pastikanKapasitasJaminanMakloon($request, $transaksi, $data);
                $this->pastikanDokumenLengkap($transaksi, DataMakloonTerima::class);

                return $this->service->submitStage($transaksi, $request->user(), 'makloon_terima', DataMakloonTerima::class, $data);
            });
        }

        return response()->json(['data' => $record]);
    }

    public function ubJastasma(Request $request, Transaksi $transaksi)
    {
        $aksi = $this->aksiSimpan($request);
        $required = $aksi === 'submit' ? 'required' : 'nullable';

        $data = $request->validate([
            'aksi' => ['sometimes', Rule::in(['draft', 'submit'])],
            'ka1' => [$required, 'numeric', 'min:0', 'max:100'],
            'ka2' => [$required, 'numeric', 'min:0', 'max:100'],
            'ka3' => [$required, 'numeric', 'min:0', 'max:100'],
            'hampa' => [$required, 'numeric', 'min:0', 'max:100'],
            'butir_hijau' => [$required, 'numeric', 'min:0', 'max:100'],
        ]);
        unset($data['aksi']);

        if ($aksi === 'draft') {
            $record = $this->service->saveDraft($transaksi, $request->user(), 'ub_jastasma', DataUbJastasma::class, $data);
        } else {
            $this->pastikanDokumenLengkap($transaksi, DataUbJastasma::class);
            $record = $this->service->submitStage($transaksi, $request->user(), 'ub_jastasma', DataUbJastasma::class, $data);
        }

        return response()->json(['data' => $record]);
    }

    private function aksiSimpan(Request $request): string
    {
        return $request->input('aksi') === 'draft' ? 'draft' : 'submit';
    }

    /**
     * @param  list<string>|null  $jenis  Batasi pengecekan ke koleksi ini saja; null = semua
     *                                    koleksi milik model. Dipakai skema MPP yang dokumennya
     *                                    terbagi dua tahap (lihat DataMakloonMpp::FOTO_TAHAP_*).
     */
    private function pastikanDokumenLengkap(Transaksi $transaksi, string $modelClass, ?array $jenis = null): void
    {
        /** @var (Model&HasMedia)|null $record */
        $record = $modelClass::where('transaksi_id', $transaksi->id_transaksi)->first();

        if (! $record) {
            abort(422, 'Dokumen belum lengkap. Simpan draft dan unggah semua dokumen terlebih dahulu.');
        }

        $missing = $record->getRegisteredMediaCollections()
            ->when($jenis !== null, fn ($collections) => $collections->filter(fn ($collection) => in_array($collection->name, $jenis, true)))
            ->filter(fn ($collection) => ! $record->getFirstMedia($collection->name))
            ->map(fn ($collection) => self::FOTO_LABELS[$collection->name] ?? str($collection->name)->replace('_', ' ')->title()->toString())
            ->values();

        if ($missing->isNotEmpty()) {
            abort(422, 'Dokumen belum lengkap: '.$missing->implode(', ').'.');
        }
    }

    private const FOTO_LABELS = [
        'foto_petani' => 'Foto Petani',
        'foto_gabah' => 'Foto Gabah',
        'foto_serah_terima' => 'Foto Serah Terima',
        'foto_kwitansi' => 'Foto Kwitansi',
        'foto_pembayaran' => 'Foto Pembayaran',
        'foto_surat_pernyataan' => 'Foto Surat Pernyataan',
        'foto_surat_jalan' => 'Foto Surat Jalan',
        'foto_surat_jalan_paraf' => 'Foto Surat Jalan (Diparaf)',
        'foto_nota_timbang' => 'Foto Nota Timbang',
        'foto_lhpk_hpk' => 'Foto LHPK/HPK',
    ];

    /**
     * Terima polos untuk SEMUA tahap.
     *
     * Dulu ada cabang khusus di sini: pada MPP, aksi Terima sekaligus menuntut dokumen tahap
     * Makloon Terima dan menyimpan kuantum bongkarnya -- satu tombol untuk tiga pekerjaan.
     * Sejak Makloon Terima punya tabel sendiri, ia mengisi dan mengirim lewat endpoint
     * makloonTerima() seperti tahap lain, dan Terima kembali berarti satu hal saja: menerima
     * data tahap sebelumnya.
     */
    public function terima(Request $request, Transaksi $transaksi)
    {
        $record = $this->service->terima($transaksi, $request->user());

        return response()->json(['data' => $record, 'transaksi' => $transaksi->fresh()]);
    }

    public function tolak(Request $request, Transaksi $transaksi)
    {
        $validated = $request->validate([
            'catatan' => ['required', 'string'],
        ]);

        $record = $this->service->tolak($transaksi, $request->user(), $validated['catatan']);

        return response()->json(['data' => $record, 'transaksi' => $transaksi->fresh()]);
    }

    private function pastikanKapasitasJaminanMakloon(Request $request, Transaksi $transaksi, array $data): void
    {
        $kuantum = $transaksi->skema === 'TJP'
            ? ($data['kuantum_bongkar'] ?? null)
            : ($data['kuantum_bongkar'] ?? $data['kuantum'] ?? null);

        if ($kuantum === null || $kuantum === '') {
            return;
        }

        if ($transaksi->skema === 'TJP') {
            $transaksi->loadMissing('dataJemputPangan.makloon');
            $makloon = $transaksi->dataJemputPangan?->makloon;
        } else {
            $makloon = $request->user();
        }

        if (! $makloon) {
            return;
        }

        JaminanMakloonController::pastikanKapasitasMakloon($makloon, (float) $kuantum);
    }
}
