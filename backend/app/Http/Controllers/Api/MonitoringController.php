<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PengolahanGudang;
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

    /**
     * Neraca gabah per makloon: satu baris per mitra, menggabungkan rantai SerGab (gabah masuk,
     * IN, SPP) dengan rantai Pengolahan (olahan, hasil olah, MO/OUT). Padanan kertas kerja Excel
     * yang sebelumnya disusun tangan tiap minggu.
     *
     * Semuanya dihitung DI DATABASE dan dikembalikan satu baris per makloon (jumlahnya puluhan),
     * bukan baris transaksi yang dijumlah di browser -- itu pola yang sudah pernah membuat agregat
     * Admin salah begitu datanya lewat satu halaman.
     *
     * Rantai SerGab TIDAK disentuh sama sekali di sini: endpoint ini hanya membaca.
     */
    public function rekapMakloon()
    {
        $rows = User::query()
            ->whereHas('role', fn ($q) => $q->where('nama_role', 'makloon'))
            ->leftJoinSub($this->agregatGabahSergab(), 'sg', 'sg.makloon_user_id', '=', 'users.id')
            ->leftJoinSub($this->agregatOlahPengolahan(), 'pg', 'pg.makloon_user_id', '=', 'users.id')
            ->leftJoinSub($this->agregatGudangPengolahan(), 'gd', 'gd.makloon_user_id', '=', 'users.id')
            ->orderBy('users.nama_maklon')
            ->get([
                'users.id',
                'users.nama_maklon',
                'users.kecamatan',
                'users.kabupaten',
                DB::raw('COALESCE(sg.gabah_diterima, 0) as gabah_diterima'),
                DB::raw('COALESCE(sg.gabah_sudah_in, 0) as gabah_sudah_in'),
                DB::raw('COALESCE(sg.gabah_spp, 0) as gabah_spp'),
                DB::raw('COALESCE(pg.olah_rekap, 0) as olah_rekap'),
                DB::raw('COALESCE(pg.olah_selesai, 0) as olah_selesai'),
                DB::raw('COALESCE(pg.hgl, 0) as hgl'),
                DB::raw('COALESCE(pg.broken, 0) as broken'),
                DB::raw('COALESCE(pg.menir, 0) as menir'),
                DB::raw('COALESCE(pg.katul, 0) as katul'),
                DB::raw('COALESCE(pg.reject, 0) as reject'),
                DB::raw('COALESCE(pg.hgl_operasi, 0) as hgl_operasi'),
                DB::raw('COALESCE(gd.estimasi_gabah, 0) as estimasi_gabah'),
            ]);

        $data = $rows
            ->map(fn (User $row) => $this->barisRekapMakloon($row))
            // Makloon tanpa aktivitas apa pun dibuang: daftar mitra jauh lebih panjang daripada
            // yang benar-benar bergerak, dan puluhan baris nol membuat tabelnya tidak terbaca.
            ->filter(fn (array $baris) => $baris['gabah_diterima'] != 0 || $baris['olah_rekap'] != 0 || $baris['estimasi_gabah'] != 0)
            ->values();

        return response()->json(['data' => $data]);
    }

    /**
     * Satu baris tabel: angka mentah dari database + kolom turunan. Turunannya dihitung di sini,
     * SATU tempat, supaya rumusnya tidak bercabang antara tabel dan baris totalnya.
     *
     * @return array<string, mixed>
     */
    private function barisRekapMakloon(User $row): array
    {
        $diterima = (float) $row->gabah_diterima;
        $sudahIn = (float) $row->gabah_sudah_in;
        $spp = (float) $row->gabah_spp;
        $olahRekap = (float) $row->olah_rekap;
        $olahSelesai = (float) $row->olah_selesai;
        $hgl = (float) $row->hgl;
        $hglOperasi = (float) $row->hgl_operasi;
        // Sudah dibulatkan per pengolahan di dalam agregatnya -- lihat alasannya di sana.
        $estimasiGabah = (float) $row->estimasi_gabah;

        return [
            'makloon_user_id' => $row->id,
            'nama_maklon' => $row->nama_maklon ?? '-',
            'kecamatan' => $row->kecamatan,
            'kabupaten' => $row->kabupaten,
            'gabah_diterima' => $diterima,
            'gabah_sudah_in' => $sudahIn,
            'gabah_belum_in' => $diterima - $sudahIn,
            'gabah_spp' => $spp,
            'gabah_belum_spp' => $diterima - $spp,
            'estimasi_gabah' => $estimasiGabah,
            'olah_rekap' => $olahRekap,
            'belum_adm_belum_olah' => $sudahIn - $olahRekap,
            'stok_pengurang_gudang' => $sudahIn - $estimasiGabah,
            'olah_selesai' => $olahSelesai,
            'stok_real' => $sudahIn - $olahSelesai,
            'hgl' => $hgl,
            
            'broken' => (float) $row->broken,
            'menir' => (float) $row->menir,
            'katul' => (float) $row->katul,
            'reject' => (float) $row->reject,
            // Rendemen dibagi olahan yang SUDAH teradministrasi (MO+OUT keluar), sesuai definisi
            // kertas kerjanya -- bukan dibagi seluruh olahan.
            'rendemen' => $olahSelesai > 0 ? round($hgl / $olahSelesai * 100, 2) : 0.0,
            'hgl_operasi' => $hglOperasi,
            'hgl_belum_adm' => $hglOperasi - $hgl,
            'persentase_olah' => $sudahIn > 0 ? round($olahSelesai / $sudahIn * 100, 2) : 0.0,
        ];
    }

    /**
     * Gabah rantai SerGab per makloon, dari kuantum BONGKAR kedua skema -- ukuran yang sama untuk
     * TJP dan MPP sehingga boleh dijumlahkan (alasan yang sama dipakai kartu total Rekap Sergab).
     * Hanya tahap makloon yang sudah DITERIMA yang ikut: sebelum itu kuantumnya belum final.
     *
     * Pemilik makloon berbeda per skema, persis seperti makloon(): TJP lewat
     * data_jemput_pangan.makloon_user_id, MPP lewat transaksi.created_by.
     */
    private function agregatGabahSergab(): \Illuminate\Database\Query\Builder
    {
        $tjp = DB::table('transaksi as t')
            ->join('data_jemput_pangan as jp', 'jp.transaksi_id', '=', 't.id_transaksi')
            ->join('data_makloon_tjp as mk', 'mk.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'TJP')
            ->where('mk.status', 'diterima')
            ->selectRaw('jp.makloon_user_id as makloon_user_id')
            ->selectRaw('t.id_transaksi as transaksi_id')
            ->selectRaw('COALESCE(mk.kuantum_bongkar, 0) as kuantum');

        // MPP: hasil timbang milik tahap Makloon Terima, bukan data_makloon_mpp yang hanya
        // memuat kuantum kirim. Sejalan dengan JaminanMakloonController::agregatGabahSergab().
        $mpp = DB::table('transaksi as t')
            ->join('data_makloon_terima as mt', 'mt.transaksi_id', '=', 't.id_transaksi')
            ->where('t.skema', 'MPP')
            ->where('mt.status', 'diterima')
            ->selectRaw('t.created_by as makloon_user_id')
            ->selectRaw('t.id_transaksi as transaksi_id')
            ->selectRaw('COALESCE(mt.kuantum_bongkar, 0) as kuantum');

        // Status PO di-join SEKALI di luar union, bukan di dalam tiap cabangnya. Waktu ia berada
        // di dalam, MySQL memateralisasi subquery yang sama dua kali (EXPLAIN memperlihatkan
        // derived4 DAN derived6, masing-masing memindai penuh data_pengadaan).
        return DB::query()
            ->fromSub($tjp->unionAll($mpp), 'g')
            ->leftJoinSub($this->statusPoPerTransaksi(), 'po', 'po.transaksi_id', '=', 'g.transaksi_id')
            ->groupBy('g.makloon_user_id')
            ->select('g.makloon_user_id')
            ->selectRaw('COALESCE(SUM(g.kuantum), 0) as gabah_diterima')
            ->selectRaw('COALESCE(SUM(CASE WHEN po.ada_in = 1 THEN g.kuantum ELSE 0 END), 0) as gabah_sudah_in')
            ->selectRaw('COALESCE(SUM(CASE WHEN po.po_diterima = 1 THEN g.kuantum ELSE 0 END), 0) as gabah_spp');
    }

    /**
     * Status PO satu transaksi, diringkas jadi SATU baris per transaksi lebih dulu.
     *
     * Sengaja tidak di-join langsung ke po_detail: "satu transaksi maksimal satu PO" di modul
     * Pengadaan dijaga lewat pemeriksaan manual, bukan indeks unik seperti pengolahan_mo_detail,
     * dan pernah bocor. Kalau bocor lagi, join langsung akan menggandakan kuantum makloonnya --
     * MAX() di sini membuat kebocoran itu tidak sampai memalsukan angka laporan.
     *
     * `po_diterima` = PO sudah diterima Keuangan (PoReviewService::terima hanya bisa dijalankan
     * role keuangan), yaitu titik "Keuangan terima dan lanjutkan" pada kertas kerjanya.
     */
    private function statusPoPerTransaksi(): \Illuminate\Database\Query\Builder
    {
        return DB::table('po_detail as pd')
            ->join('data_pengadaan as dp', 'dp.id', '=', 'pd.data_pengadaan_id')
            ->where('dp.status', '<>', 'dibatalkan')
            ->groupBy('pd.transaksi_id')
            ->select('pd.transaksi_id')
            ->selectRaw("MAX(CASE WHEN pd.no_in IS NOT NULL AND pd.no_in <> '' THEN 1 ELSE 0 END) as ada_in")
            ->selectRaw("MAX(CASE WHEN dp.review_status = 'diterima' THEN 1 ELSE 0 END) as po_diterima");
    }

    /**
     * Hasil olah per makloon dari LHPK yang sudah DITERIMA -- himpunan yang sama dengan yang
     * tampil di Rekap Pengolahan, jadi angka tabel ini selalu bisa ditelusuri ke barisnya.
     *
     * mo_detail boleh di-join langsung: kolom transaksi_pengolahan_id-nya ber-indeks UNIQUE,
     * jadi satu pengolahan tidak bisa menggandakan barisnya.
     */
    private function agregatOlahPengolahan(): \Illuminate\Database\Query\Builder
    {
        return DB::table('transaksi_pengolahan as tp')
            ->join('pengolahan_lhpk as l', 'l.transaksi_pengolahan_id', '=', 'tp.id_pengolahan')
            ->leftJoin('pengolahan_mo_detail as md', 'md.transaksi_pengolahan_id', '=', 'tp.id_pengolahan')
            ->leftJoin('pengolahan_mo as mo', 'mo.id', '=', 'md.pengolahan_mo_id')
            ->whereNotNull('tp.makloon_user_id')
            ->where('l.status', 'diterima')
            ->groupBy('tp.makloon_user_id')
            ->select('tp.makloon_user_id')
            ->selectRaw('COALESCE(SUM(l.kuantum_gabah_diolah), 0) as olah_rekap')
            // "Selesai" = Nomor OUT sudah terbit; itulah penanda MO+OUT beres pada rantai ini.
            ->selectRaw("COALESCE(SUM(CASE WHEN tp.status_keseluruhan = 'selesai' THEN l.kuantum_gabah_diolah ELSE 0 END), 0) as olah_selesai")
            ->selectRaw('COALESCE(SUM(l.kuantum_beras_hgl), 0) as hgl')
            // Angka mutu dijumlahkan apa adanya; isian non-angka ikut terbaca sebagai nol
            ->selectRaw('COALESCE(SUM(l.broken), 0) as broken')
            ->selectRaw('COALESCE(SUM(l.menir), 0) as menir')
            ->selectRaw('COALESCE(SUM(l.katul), 0) as katul')
            ->selectRaw('COALESCE(SUM(l.reject), 0) as reject')
            ->selectRaw("COALESCE(SUM(CASE WHEN mo.review_status = 'diterima' THEN l.kuantum_beras_hgl ELSE 0 END), 0) as hgl_operasi");
    }

    /**
     * HGL fisik per makloon dari tahap Gudang yang sudah DITERIMA -- himpunan yang sama dengan
     * kolom "Kuantum HGL (fisik)" di Rekap Pengolahan. Berdiri sendiri, tidak digabung ke
     * agregatOlahPengolahan(): tahap Gudang bisa selesai lebih dulu daripada LHPK (skema GDG),
     * dan menumpangkannya di join LHPK akan menghilangkan HGL yang LHPK-nya belum diterima.
     *
     * pengolahan_gudang.transaksi_pengolahan_id ber-indeks UNIQUE, jadi join ini tidak bisa
     * menggandakan kuantum.
     *
     * ROUND() dipasang PER BARIS, sebelum SUM(), bukan sesudahnya. Rekap Pengolahan menampilkan
     * estimasi satu per satu dalam kilogram utuh; kalau di sini dijumlah dulu baru dibulatkan,
     * kolom yang dijumlah tangan di sana tidak akan pernah ketemu dengan total di neraca ini --
     * dan selisih beberapa kilogram tanpa penjelasan lebih merepotkan daripada pecahan yang
     * hilang. Sisi frontend membulatkan di titik yang sama (lib/estimasiGabah.ts).
     *
     * ROUND(x) berperilaku sama di MySQL (dev & produksi) dan SQLite (test); kuantum tidak
     * pernah negatif, jadi perbedaan arah pembulatan setengah tidak pernah terpakai.
     */
    private function agregatGudangPengolahan(): \Illuminate\Database\Query\Builder
    {
        return DB::table('transaksi_pengolahan as tp')
            ->join('pengolahan_gudang as g', 'g.transaksi_pengolahan_id', '=', 'tp.id_pengolahan')
            ->whereNotNull('tp.makloon_user_id')
            ->where('g.status', 'diterima')
            ->groupBy('tp.makloon_user_id')
            ->select('tp.makloon_user_id')
            ->selectRaw('COALESCE(SUM(ROUND(g.kuantum_hgl / '.PengolahanGudang::RENDEMEN_ESTIMASI.')), 0) as estimasi_gabah');
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
