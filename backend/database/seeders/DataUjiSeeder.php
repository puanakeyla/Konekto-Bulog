<?php

namespace Database\Seeders;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
use App\Models\DataMakloonTjp;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\Gudang;
use App\Models\JaminanMakloon;
use App\Models\PengolahanGudang;
use App\Models\PengolahanLhpk;
use App\Models\Role;
use App\Models\User;
use App\Services\Pengolahan\KerjaanPengolahan;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Data uji end-to-end: 1.000 transaksi SerGab (TJP + MPP) + 400 transaksi Pengolahan
 * (GDG + UBJ), lengkap dengan master data, PO, MO, penolakan, notifikasi, audit log,
 * dan sampel foto.
 *
 * Jalankan: php artisan db:seed --class=DataUjiSeeder
 *
 * TIDAK idempoten -- tiap kali dijalankan ia MENAMBAH 1.400 transaksi baru bernomor lanjutan
 * (counter dibaca dari id tertinggi yang sudah ada), jadi aman dijalankan di atas DemoSeeder
 * maupun di atas dirinya sendiri; tapi kalau yang diinginkan tepat 1.400 baris, jalankan sekali
 * di atas database yang baru di-migrate:fresh.
 *
 * Tiap profil di PROFIL_SERGAB / PROFIL_PENGOLAHAN memetakan SATU kondisi yang benar-benar bisa
 * dicapai lewat UI. Kombinasi yang tidak punya jalur di aplikasi sengaja TIDAK dibuat, karena
 * data yang mustahil justru menyesatkan pengujian:
 *   - transaksi.status_keseluruhan = 'dibatalkan' -- tidak ada endpoint yang memproduksinya;
 *   - data_keuangan.review_status = 'ditolak' -- Keuangan tahap terakhir, tak ada peninjaunya.
 */
class DataUjiSeeder extends Seeder
{
    public const TOTAL_SERGAB = 1000;

    public const TOTAL_PENGOLAHAN = 400;

    /** Transaksi yang dapat foto sungguhan. Dibatasi supaya seed tetap cepat & disk tidak membengkak. */
    public const SAMPEL_FOTO = 40;

    private const HARGA_PER_KG = 6500;

    /** PNG 1x1 valid -- cukup untuk menguji tampilan, unduhan, dan penggantian foto. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    /** profil => bobot. Bobot besar = kondisi yang wajar sering muncul di produksi. */
    private const PROFIL_SERGAB = [
        't0_draft' => 4, 't0_kirim' => 5, 't0_ditolak' => 3,
        't1_draft' => 4, 't1_kirim' => 5, 't1_ditolak' => 3,
        'ub_draft' => 4, 'ub_kirim' => 5, 'ub_ditolak' => 3,
        'siap_po' => 5,
        'po_in_sebagian' => 5, 'po_spp_kosong' => 5, 'po_menunggu_keuangan' => 7,
        'po_ditolak_keuangan' => 4, 'keuangan_belum_bayar' => 6,
        'sergab_kwitansi' => 4, 'sergab_foto' => 4, 'lunas_sergab_terbuka' => 4,
        'po_dibatalkan' => 3,
        'selesai' => 26,
    ];

    private const PROFIL_PENGOLAHAN = [
        't0_draft' => 5, 't0_kirim' => 6, 't0_ditolak' => 4,
        't1_draft' => 5, 't1_kirim' => 6, 't1_ditolak' => 4,
        'siap_mo' => 6, 'mo_draft' => 5, 'mo_menunggu_pengadaan' => 7,
        'mo_ditolak' => 4, 'mo_diterima_belum_out' => 6, 'mo_dibatalkan' => 3,
        'selesai' => 25,
    ];

    /** Profil pengolahan yang TIDAK punya MO -- sisanya punya. */
    private const TANPA_MO = ['t0_draft', 't0_kirim', 't0_ditolak', 't1_draft', 't1_kirim', 't1_ditolak', 'siap_mo'];

    private const MAKLOON = [
        ['mk_jaya', 'PT. JAYA MANUNGGAL PANGAN', 'Cikupa', 'Tangerang'],
        ['mk_sumber', 'PT. SUMBER PANGAN LESTARI', 'Natar', 'Lampung Selatan'],
        ['mk_tani', 'CV. TANI MAKMUR SEJAHTERA', 'Seputih Raman', 'Lampung Tengah'],
        ['mk_padi', 'PT. PADI EMAS NUSANTARA', 'Palas', 'Lampung Selatan'],
        ['mk_karya', 'CV. KARYA BOGA PANGAN', 'Punggur', 'Lampung Tengah'],
        ['mk_sentosa', 'PT. SENTOSA GRAHA PANGAN', 'Gadingrejo', 'Pringsewu'],
        ['mk_agro', 'PT. AGRO NIAGA SELARAS', 'Way Seputih', 'Lampung Tengah'],
        ['mk_bumi', 'CV. BUMI SUBUR MANDIRI', 'Terbanggi Besar', 'Lampung Tengah'],
    ];

    private const GUDANG = [
        ['GDG-CR1', 'Campang Raya I'], ['GDG-CR2', 'Campang Raya 2'],
        ['GDG-PB', 'Putra Bali'], ['GDG-YPX', 'Yapindex'],
        ['GDG-AS', 'Abadi Sakti'], ['GDG-KTP', 'Ketapang'],
        ['GDG-LPN', 'Lempeneng'],
    ];

    private const PEMASOK = ['419119', '419120', '419127', '419131', '420008', '420117'];

    private const SUPIR = [
        'SURYA', 'RIYAN', 'TULUS', 'YONO', 'EPAN', 'ERLANGGA', 'WIDI', 'RUSLAN', 'FIRMAN',
        'AGUS', 'BUDI', 'CANDRA', 'DEDI', 'ERI', 'GUNAWAN', 'HARIS', 'IWAN', 'JOKO',
        'KOMANG', 'LUKMAN', 'MARDI', 'NANANG', 'OKI', 'PRIYONO', 'QOMAR', 'RAHMAT',
        'SAIFUL', 'TARMIZI', 'UNTUNG', 'VERI', 'WAHYU', 'YUSUF', 'ZAINAL', 'BAMBANG',
        'DARMAWAN', 'FAUZI', 'HENDRA', 'IMRON', 'KURNIAWAN', 'MUKHLIS',
    ];

    private const POKTAN = [
        'Gapoktan Sumber Rejeki', 'Poktan Tani Jaya', 'Gapoktan Karya Tani',
        'Poktan Sri Rejeki', 'Gapoktan Margo Mulyo', 'Poktan Harapan Baru',
        'Gapoktan Subur Makmur', 'Poktan Tunas Harapan', 'Gapoktan Sido Dadi',
        'Poktan Amanah Tani', 'Gapoktan Mekar Sari', 'Poktan Bina Usaha',
    ];

    private const LOKASI = [
        ['Sukamaju', 'Cikupa', 'Tangerang'], ['Merak Batin', 'Natar', 'Lampung Selatan'],
        ['Rukti Harjo', 'Seputih Raman', 'Lampung Tengah'], ['Bandan Hurip', 'Palas', 'Lampung Selatan'],
        ['Tanggul Angin', 'Punggur', 'Lampung Tengah'], ['Wates', 'Gadingrejo', 'Pringsewu'],
        ['Sri Basuki', 'Way Seputih', 'Lampung Tengah'], ['Yukum Jaya', 'Terbanggi Besar', 'Lampung Tengah'],
        ['Purworejo', 'Kotagajah', 'Lampung Tengah'], ['Fajar Baru', 'Jati Agung', 'Lampung Selatan'],
        ['Sidomulyo', 'Sidomulyo', 'Lampung Selatan'], ['Karang Anyar', 'Jati Agung', 'Lampung Selatan'],
    ];

    private const CATATAN_TOLAK = [
        'Foto nota timbang tidak terbaca, mohon diunggah ulang.',
        'Kuantum tidak cocok dengan surat jalan.',
        'Plat mobil berbeda dengan yang tercatat di pos.',
        'Kadar air di luar batas toleransi, mohon diperiksa ulang.',
        'Tanggal bongkar mendahului tanggal kirim.',
        'Nama supir kosong pada surat jalan.',
        'Foto kwitansi belum diunggah.',
        'Nomor IN tidak sesuai dengan data gudang.',
        'Rendemen di luar kewajaran, mohon dihitung ulang.',
        'ID pemasok salah ketik.',
    ];

    /** @var array<string,int> counter nomor urut id transaksi per "SKEMA|MM/YYYY" */
    private array $urut = [];

    private int $seqIn = 19500;

    private int $seqPo = 100;

    private int $seqSpp = 60;

    private int $seqLhpk = 1200;

    private int $seqMo = 3700;

    private int $seqOut = 80;

    private int $seqTm = 8700;

    public function run(): void
    {
        mt_srand(20260823);

        $this->call(RoleSeeder::class);
        $master = $this->master();
        $this->muatCounter();

        $stok = $this->sergab($master);
        $this->kalibrasiJaminan($master['makloon'], $stok);
        $this->pengolahan($master, $stok);
        $this->simpanCounter();
        $this->segarkanKerjaan();
        $this->foto();

        $this->command?->info(sprintf(
            'Total sekarang: %d transaksi SerGab, %d transaksi Pengolahan, %d PO, %d MO.',
            DB::table('transaksi')->count(),
            DB::table('transaksi_pengolahan')->count(),
            DB::table('data_pengadaan')->count(),
            DB::table('pengolahan_mo')->count(),
        ));
    }

    // ------------------------------------------------------------------ master

    /**
     * @return array{jp:list<User>,makloon:list<User>,ubj:list<User>,pengadaan:list<User>,
     *               keuangan:list<User>,operasi:list<User>,gudang:list<User>,admin:User,
     *               gudangMaster:list<Gudang>}
     */
    private function master(): array
    {
        foreach (self::GUDANG as [$kode, $nama]) {
            // Satu gudang sengaja nonaktif supaya filter "hanya gudang aktif" ada yang menyaring.
            Gudang::firstOrCreate(['kode' => $kode], ['nama' => $nama, 'aktif' => $kode !== 'GDG-LPN']);
        }

        $makloon = [];
        foreach (self::MAKLOON as [$username, $nama, $kec, $kab]) {
            $makloon[] = $this->user($username, 'makloon', $nama, $kec, $kab);
        }

        // Akun nonaktif supaya penolakan login bisa diuji.
        $this->user('jp_nonaktif', 'jemput_pangan', aktif: false);

        $master = [
            'jp' => [
                $this->user('jp_utara', 'jemput_pangan'),
                $this->user('jp_selatan', 'jemput_pangan'),
                $this->user('jp_timur', 'jemput_pangan'),
            ],
            'makloon' => $makloon,
            'ubj' => [$this->user('ubj_lab1', 'ub_jastasma'), $this->user('ubj_lab2', 'ub_jastasma')],
            'pengadaan' => [$this->user('pengadaan1', 'pengadaan'), $this->user('pengadaan2', 'pengadaan')],
            'keuangan' => [$this->user('keuangan1', 'keuangan'), $this->user('keuangan2', 'keuangan')],
            'operasi' => [$this->user('operasi1', 'operasi'), $this->user('operasi2', 'operasi')],
            'gudang' => [$this->user('gudang1', 'gudang'), $this->user('gudang2', 'gudang'), $this->user('gudang3', 'gudang')],
            'admin' => $this->user('admin_uji', 'admin'),
            'gudangMaster' => Gudang::whereIn('kode', array_column(self::GUDANG, 0))->get()->all(),
        ];

        // Jatah edit rekap dibuka untuk dua akun non-admin supaya fitur "tembus kunci" bisa diuji.
        $master['jp'][0]->update(['akses_edit_sisa' => 5]);
        $master['ubj'][0]->update(['akses_edit_sisa' => 3]);

        foreach ($makloon as $i => $m) {
            JaminanMakloon::updateOrCreate(['makloon_user_id' => $m->id], [
                'bentuk_jaminan' => ['Bank Garansi', 'Deposito', 'Tunai', 'Sertifikat Tanah'][$i % 4],
                'jaminan_rp' => (500 + $i * 250) * 1_000_000,
                'kapasitas_per_hari_kg' => 60_000 + $i * 15_000,
                'created_by' => $master['admin']->id,
                'updated_by' => $master['admin']->id,
            ]);
        }

        return $master;
    }

    private function user(string $username, string $role, ?string $namaMaklon = null, ?string $kec = null, ?string $kab = null, bool $aktif = true): User
    {
        $user = User::firstOrCreate(['username' => $username], [
            'password' => 'password',
            'role_id' => Role::where('nama_role', $role)->value('id'),
            'nama_maklon' => $namaMaklon,
            'kecamatan' => $kec,
            'kabupaten' => $kab,
            'is_active' => $aktif,
        ]);
        $user->syncRoles($role);

        return $user;
    }

    // ------------------------------------------------------------------ sergab

    /**
     * @return array<int,float> gabah diterima per makloon -- jadi plafon kuantum Pengolahan
     *                          supaya angka olahan tidak melebihi yang pernah masuk.
     */
    private function sergab(array $master): array
    {
        $t = $jp = $tjp = $mpp = $mt = $ub = $po = $tolak = $audit = $notif = [];
        $stok = [];
        $dibuat = 0;
        $profil = $this->bobot(self::PROFIL_SERGAB);

        while ($dibuat < self::TOTAL_SERGAB) {
            $nama = $profil[array_rand($profil)];
            $resepPo = $this->resepPo($nama);

            // Satu iterasi = satu KELOMPOK PO: PoGroupingService mensyaratkan seluruh anggota
            // berbagi (tanggal_bongkar, id_pemasok, makloon), jadi ketiganya dipilih sekali di
            // sini dan dipakai bersama oleh seluruh transaksi dalam kelompok.
            $ukuran = min(self::TOTAL_SERGAB - $dibuat, $resepPo ? mt_rand(2, 8) : mt_rand(1, 3));

            $skema = mt_rand(1, 100) <= 60 ? 'TJP' : 'MPP';
            $mk = $master['makloon'][array_rand($master['makloon'])];
            $jpUser = $master['jp'][array_rand($master['jp'])];
            $ubUser = $master['ubj'][array_rand($master['ubj'])];
            $pgUser = $master['pengadaan'][array_rand($master['pengadaan'])];
            $keuUser = $master['keuangan'][array_rand($master['keuangan'])];
            $pemasok = self::PEMASOK[array_rand(self::PEMASOK)];
            $bongkar = $this->tanggalAcak();
            $kirim = $bongkar->copy()->subDay();

            [$s0, $s1] = $skema === 'TJP' ? ['jemput_pangan', 'makloon'] : ['makloon_kirim', 'makloon_terima'];
            $r = $this->resepSergab($nama, $s0, $s1);

            // MPP dibuat oleh makloon sendiri (Transaksi::dimilikiOleh & PoGroupingService
            // memakai created_by sebagai identitas makloon); TJP dibuat Jemput Pangan.
            $pembuat = $skema === 'TJP' ? $jpUser : $mk;

            $ids = [];
            $kuantumPo = [];

            for ($i = 0; $i < $ukuran; $i++) {
                $id = $this->idBaru($skema, $bongkar);
                $ids[] = $id;
                $kirimKg = (float) mt_rand(9200, 10400);
                $bongkarKg = $r['t1'] === null ? null : $kirimKg - mt_rand(0, 120);
                [$desa, $kec, $kab] = self::LOKASI[array_rand(self::LOKASI)];
                $ts = $bongkar->copy()->addHours(mt_rand(7, 18));

                $t[] = [
                    'id_transaksi' => $id,
                    'skema' => $skema,
                    'current_stage' => $r['stage'],
                    'status_keseluruhan' => $r['selesai'] ? 'selesai' : 'berjalan',
                    'created_by' => $pembuat->id,
                    'created_at' => $ts,
                    'updated_at' => $ts,
                ];

                if ($skema === 'TJP') {
                    $jp[] = $this->tahap([
                        'transaksi_id' => $id,
                        'id_pemasok' => $pemasok,
                        'supir' => self::SUPIR[array_rand(self::SUPIR)],
                        'plat_mobil' => $this->plat(),
                        'nama_poktan_gapoktan' => self::POKTAN[array_rand(self::POKTAN)],
                        'desa' => $desa, 'kecamatan' => $kec, 'kabupaten' => $kab,
                        'makloon_user_id' => $mk->id,
                        'tanggal_kirim' => $kirim->toDateString(),
                        'kuantum' => $kirimKg,
                        'jarak_ke_makloon_km' => mt_rand(35, 950) / 10,
                    ], $r['t0'], $jpUser, $mk, $ts);

                    if ($r['t1'] !== null) {
                        $tjp[] = $this->tahap([
                            'transaksi_id' => $id,
                            'tanggal_bongkar' => $bongkar->toDateString(),
                            'kuantum_bongkar' => $bongkarKg,
                        ], $r['t1'], $mk, $ubUser, $ts);
                    }
                } else {
                    $mpp[] = $this->tahap([
                        'transaksi_id' => $id,
                        'id_pemasok' => $pemasok,
                        'supir' => self::SUPIR[array_rand(self::SUPIR)],
                        'plat_mobil' => $this->plat(),
                        'desa' => $desa, 'kecamatan' => $kec, 'kabupaten' => $kab,
                        'tanggal_bongkar' => $bongkar->toDateString(),
                        'kuantum' => $kirimKg,
                        'jarak_ke_makloon_km' => mt_rand(35, 950) / 10,
                    ], $r['t0'], $mk, $mk, $ts);

                    // kuantum_bongkar milik MPP sengaja dibiarkan NULL: sejak tahap Makloon Terima
                    // punya tabel sendiri, angka bongkar yang dipakai PO diambil dari sana.
                    if ($r['t1'] !== null) {
                        $mt[] = $this->tahap([
                            'transaksi_id' => $id,
                            'kuantum_bongkar' => $bongkarKg,
                        ], $r['t1'], $mk, $ubUser, $ts);
                    }
                }

                if ($r['ub'] !== null) {
                    $ka = mt_rand(2300, 2980) / 100;
                    $ub[] = $this->tahap([
                        'transaksi_id' => $id,
                        'ka1' => $ka,
                        'ka2' => round($ka + mt_rand(-10, 10) / 100, 2),
                        'ka3' => round($ka + mt_rand(-10, 10) / 100, 2),
                        'hampa' => mt_rand(480, 660) / 100,
                        'butir_hijau' => mt_rand(400, 680) / 100,
                    ], $r['ub'], $ubUser, $pgUser, $ts);
                }

                if ($r['tolak'] !== null) {
                    $tolak[] = [
                        'transaksi_id' => $id,
                        'pengolahan_id' => null,
                        'tahap' => $r['tolak'],
                        'catatan' => self::CATATAN_TOLAK[array_rand(self::CATATAN_TOLAK)],
                        'ditolak_oleh' => $this->penolak($r['tolak'], $master)->id,
                        'ditolak_pada' => $ts->copy()->addHours(3),
                    ];
                }

                $audit[] = $this->audit($id, null, $pembuat->id, 'buat_transaksi', ['skema' => $skema], $ts);
                if ($r['t0'] !== 'draft') {
                    $audit[] = $this->audit($id, null, $pembuat->id, 'kirim_tahap', ['stage' => $s0], $ts->copy()->addHour());
                }

                if ($r['t1'] === 'diterima' && $bongkarKg !== null) {
                    $stok[$mk->id] = ($stok[$mk->id] ?? 0) + $bongkarKg;
                }
                if ($resepPo !== null) {
                    $kuantumPo[$id] = $bongkarKg;
                }
            }

            if ($resepPo !== null) {
                $bulan = (int) $bongkar->format('n');
                $tahun = (int) $bongkar->format('Y');
                $total = array_sum($kuantumPo);
                $noPo = sprintf('PO/%03d/%02d/%04d/08001', $this->seqPo++, $bulan, $tahun);
                $tsPo = $bongkar->copy()->addDay()->addHours(10);
                $direview = in_array($resepPo['review'], ['diterima', 'ditolak'], true);

                $po[$noPo] = [
                    'tanggal_bongkar' => $bongkar->toDateString(),
                    'id_pemasok' => $pemasok,
                    'makloon_user_id' => $mk->id,
                    'total_kuantum' => $total,
                    'harga' => self::HARGA_PER_KG,
                    'total_harga' => $total * self::HARGA_PER_KG,
                    'no_po' => $noPo,
                    'no_spp' => $resepPo['spp'] ? sprintf('SPP-%04d/08010/%02d/%04d', $this->seqSpp++, $bulan, $tahun) : null,
                    'status' => $resepPo['status'],
                    'review_status' => $resepPo['review'],
                    'catatan_penolakan' => $resepPo['review'] === 'ditolak' ? self::CATATAN_TOLAK[array_rand(self::CATATAN_TOLAK)] : null,
                    'reviewed_by' => $direview ? $keuUser->id : null,
                    'reviewed_at' => $direview ? $tsPo : null,
                    'created_at' => $tsPo,
                    'updated_at' => $tsPo,
                    '__detail' => $resepPo['detail'] ? $kuantumPo : [],
                    '__in' => $resepPo['in'],
                    '__bulan' => $bulan,
                    '__tahun' => $tahun,
                    '__keuangan' => $resepPo['keuangan'],
                    '__keuUser' => $keuUser->id,
                    '__ts' => $tsPo,
                ];

                $audit[] = $this->audit($ids[0], null, $pgUser->id, 'gabungkan_po', ['no_po' => $noPo, 'anggota' => count($ids)], $tsPo);

                if ($resepPo['review'] === 'ditolak') {
                    foreach ($ids as $id) {
                        $tolak[] = [
                            'transaksi_id' => $id,
                            'pengolahan_id' => null,
                            'tahap' => 'pengadaan',
                            'catatan' => $po[$noPo]['catatan_penolakan'],
                            'ditolak_oleh' => $keuUser->id,
                            'ditolak_pada' => $tsPo,
                        ];
                    }
                }
            }

            // Notifikasi hanya untuk sebagian kejadian -- inbox penuh duplikat tidak membantu uji.
            if (mt_rand(1, 100) <= 22) {
                $notif[] = $this->notifikasi($nama, $ids[0], $master, $bongkar);
            }

            $dibuat += $ukuran;
        }

        $this->sisipkan('transaksi', $t);
        $this->sisipkan('data_jemput_pangan', $jp);
        $this->sisipkan('data_makloon_tjp', $tjp);
        $this->sisipkan('data_makloon_mpp', $mpp);
        $this->sisipkan('data_makloon_terima', $mt);
        $this->sisipkan('data_ub_jastasma', $ub);
        $this->simpanPo($po);
        $this->sisipkan('riwayat_penolakan', $tolak);
        $this->sisipkan('audit_logs', $audit);
        $this->sisipkan('notifikasi', $notif);

        $this->command?->info(self::TOTAL_SERGAB.' transaksi SerGab dibuat.');

        return $stok;
    }

    /** PO disimpan terpisah karena po_detail & data_keuangan butuh id auto-increment-nya. */
    private function simpanPo(array $po): void
    {
        if ($po === []) {
            return;
        }

        $bersih = array_map(
            fn (array $row) => array_filter($row, fn (string $k) => ! str_starts_with($k, '__'), ARRAY_FILTER_USE_KEY),
            $po,
        );
        $this->sisipkan('data_pengadaan', array_values($bersih));

        $idPo = DB::table('data_pengadaan')->whereIn('no_po', array_keys($po))->pluck('id', 'no_po');
        $detail = [];
        $keuangan = [];

        foreach ($po as $noPo => $row) {
            $id = $idPo[$noPo];
            $anggota = $row['__detail'];
            $sisaTanpaIn = $row['__in'] === 'sebagian' ? 1 : 0;
            $ke = 0;

            foreach ($anggota as $transaksiId => $kuantum) {
                // 'sebagian' meninggalkan baris TERAKHIR tanpa No. IN -- itulah yang menahan PO
                // di chip "PO & IN" milik Pengadaan (lihat TahapPengadaan::filter).
                $isiIn = $ke < count($anggota) - $sisaTanpaIn;
                $this->seqIn += mt_rand(1, 9);

                $detail[] = [
                    'data_pengadaan_id' => $id,
                    'transaksi_id' => $transaksiId,
                    'kuantum_kontribusi' => $kuantum,
                    'no_in' => $isiIn ? sprintf('IN/%05d/%02d/%04d/ADA08001', $this->seqIn, $row['__bulan'], $row['__tahun']) : null,
                    'created_at' => $row['__ts'],
                    'updated_at' => $row['__ts'],
                ];
                $ke++;
            }

            if ($row['__keuangan'] !== null) {
                [$statusBayar, $review] = $row['__keuangan'];
                $keuangan[] = [
                    'data_pengadaan_id' => $id,
                    'status_bayar' => $statusBayar,
                    'tanggal_bayar' => $statusBayar === 'dibayarkan'
                        ? $row['__ts']->copy()->addDays(mt_rand(2, 10))->toDateString()
                        : null,
                    'review_status' => $review,
                    'catatan_penolakan' => null,
                    'reviewed_by' => $review === 'diterima' ? $row['__keuUser'] : null,
                    'reviewed_at' => $review === 'diterima' ? $row['__ts']->copy()->addDays(2) : null,
                    'created_at' => $row['__ts'],
                    'updated_at' => $row['__ts'],
                ];
            }
        }

        $this->sisipkan('po_detail', $detail);
        $this->sisipkan('data_keuangan', $keuangan);
    }

    /** @return array{t0:string,t1:?string,ub:?string,stage:string,selesai:bool,tolak:?string} */
    private function resepSergab(string $profil, string $s0, string $s1): array
    {
        $d = ['t0' => 'diterima', 't1' => 'diterima', 'ub' => 'diterima', 'stage' => 'pengadaan', 'selesai' => false, 'tolak' => null];

        return match ($profil) {
            't0_draft' => [...$d, 't0' => 'draft', 't1' => null, 'ub' => null, 'stage' => $s0],
            't0_kirim' => [...$d, 't0' => 'menunggu_review', 't1' => null, 'ub' => null, 'stage' => $s1],
            't0_ditolak' => [...$d, 't0' => 'ditolak', 't1' => null, 'ub' => null, 'stage' => $s0, 'tolak' => $s0],
            't1_draft' => [...$d, 't1' => 'draft', 'ub' => null, 'stage' => $s1],
            't1_kirim' => [...$d, 't1' => 'menunggu_review', 'ub' => null, 'stage' => 'ub_jastasma'],
            't1_ditolak' => [...$d, 't1' => 'ditolak', 'ub' => null, 'stage' => $s1, 'tolak' => $s1],
            'ub_draft' => [...$d, 'ub' => 'draft', 'stage' => 'ub_jastasma'],
            'ub_kirim' => [...$d, 'ub' => 'menunggu_review', 'stage' => 'pengadaan'],
            'ub_ditolak' => [...$d, 'ub' => 'ditolak', 'stage' => 'ub_jastasma', 'tolak' => 'ub_jastasma'],
            // Sejak No. SPP yang mengirim PO ke Keuangan, transaksinya berdiri di tahap 'keuangan'
            // walaupun Status Sergab-nya masih digarap Pengadaan (Transaksi::scopeAntreanRole).
            'po_menunggu_keuangan', 'keuangan_belum_bayar', 'sergab_kwitansi',
            'sergab_foto', 'lunas_sergab_terbuka' => [...$d, 'stage' => 'keuangan'],
            // PO yang ditolak Keuangan memundurkan anggotanya ke Pengadaan (PoReviewService::tolak).
            'po_ditolak_keuangan' => [...$d, 'stage' => 'pengadaan', 'tolak' => 'pengadaan'],
            'selesai' => [...$d, 'stage' => 'keuangan', 'selesai' => true],
            default => $d, // siap_po, po_in_sebagian, po_spp_kosong, po_dibatalkan
        };
    }

    /** @return array{status:string,review:string,in:string,spp:bool,detail:bool,keuangan:?array}|null */
    private function resepPo(string $profil): ?array
    {
        $d = ['status' => 'proses', 'review' => 'diterima', 'in' => 'penuh', 'spp' => true, 'detail' => true, 'keuangan' => null];

        return match ($profil) {
            'po_in_sebagian' => [...$d, 'review' => 'draft', 'in' => 'sebagian', 'spp' => false],
            'po_spp_kosong' => [...$d, 'review' => 'draft', 'spp' => false],
            'po_menunggu_keuangan' => [...$d, 'review' => 'menunggu_review'],
            'po_ditolak_keuangan' => [...$d, 'review' => 'ditolak'],
            'keuangan_belum_bayar' => [...$d, 'keuangan' => ['belum', 'draft']],
            'sergab_kwitansi' => [...$d, 'status' => 'kwitansi_belum_upload', 'keuangan' => ['belum', 'draft']],
            'sergab_foto' => [...$d, 'status' => 'foto_belum_lengkap', 'keuangan' => ['dibayarkan', 'diterima']],
            'lunas_sergab_terbuka' => [...$d, 'keuangan' => ['dibayarkan', 'diterima']],
            'selesai' => [...$d, 'status' => 'lengkap', 'keuangan' => ['dibayarkan', 'diterima']],
            // PO batal: baris po_detail memang TIDAK dibuat (PoGroupingService::gabungkanPo),
            // transaksinya tetap di tahap Pengadaan supaya bisa digabung ulang.
            'po_dibatalkan' => [...$d, 'status' => 'dibatalkan', 'review' => 'draft', 'in' => 'kosong', 'spp' => false, 'detail' => false],
            default => null,
        };
    }

    // -------------------------------------------------------------- pengolahan

    /**
     * Kapasitas jaminan disetel SETELAH alur SerGab jalan, karena angkanya hanya masuk akal
     * relatif terhadap gabah yang benar-benar mengalir ke makloon itu.
     *
     * Sebelumnya kapasitas dipatok datar 60.000-195.000 kg sementara tiap makloon menerima
     * lebih dari sejuta kilogram sepanjang periode uji. "Stok Pengurang Penerimaan Gudang"
     * adalah saldo KUMULATIF (masuk dikurangi yang sudah dibayar hasil olahnya), jadi dengan
     * plafon sekecil itu ia cuma punya dua keadaan: nol, atau jebol total. Dua-duanya bikin
     * panel Operasi terlihat mati.
     *
     * 40% dari gabah yang pernah masuk memberi ruang gerak: saldo normal duduk di bawah separuh
     * plafon, naik saat No IN terbit dan turun lagi saat hasil olah masuk gudang. Satu-dua
     * makloon tetap sengaja mentok -- kondisi "kiriman ditolak karena plafon" juga perlu diuji.
     *
     * @param  array<int,float>  $stok
     */
    private function kalibrasiJaminan(array $makloon, array $stok): void
    {
        foreach ($makloon as $m) {
            $kapasitas = max(60_000.0, round((($stok[$m->id] ?? 0.0) * 0.40) / 5_000) * 5_000);
            JaminanMakloon::where('makloon_user_id', $m->id)->update(['kapasitas_per_hari_kg' => $kapasitas]);
        }
    }

    /** @param array<int,float> $stok gabah yang pernah diterima tiap makloon lewat alur SerGab */
    private function pengolahan(array $master, array $stok): void
    {
        $t = $pg = $pl = $mo = $tolak = $audit = [];
        $dibuat = 0;
        $profil = $this->bobot(self::PROFIL_PENGOLAHAN);

        // Keterhubungan antar-alur: hanya makloon yang benar-benar pernah MENERIMA gabah di alur
        // SerGab yang boleh muncul di alur Pengolahan, dan kuantum olahannya dibatasi stok itu.
        $makloonAktif = array_values(array_filter($master['makloon'], fn (User $m) => ($stok[$m->id] ?? 0) > 0));

        // Jatah olah tiap makloon: 96% dari gabah yang pernah masuk atas namanya. Sengaja mepet,
        // karena yang MEMBAYAR hutang makloon cuma tahap Gudang yang sudah `diterima` (~88% dari
        // yang diolah) -- jatah 96% menyisakan selisih belasan persen, cukup besar untuk terlihat
        // bergerak di panel Operasi tanpa langsung menembus plafon.
        $anggaran = [];
        foreach ($makloonAktif as $m) {
            $anggaran[$m->id] = ($stok[$m->id] ?? 0.0) * 0.96;
        }

        // Jatah dibagi rata ke perkiraan jumlah baris yang akan jatuh ke satu makloon, BUKAN
        // ditarik sebanyak-banyaknya per baris. Versi lama memakai `max(80_000, sisa * 0.35)`:
        // lantai 80.000 kg itu tetap menarik gabah walau stoknya sudah habis, sehingga 400 baris
        // mengolah 32 juta kg dari 10,6 juta kg yang benar-benar masuk. Akibatnya Estimasi Gabah
        // selalu jauh melampaui Gabah Sudah IN, "Stok Pengurang Penerimaan Gudang" terkunci di 0
        // untuk SEMUA makloon, dan gerbang jaminan Operasi tampak tidak bekerja sama sekali.
        $barisPerMakloon = max(1, (int) round(self::TOTAL_PENGOLAHAN / max(1, count($makloonAktif))));

        while ($dibuat < self::TOTAL_PENGOLAHAN) {
            $nama = $profil[array_rand($profil)];
            $adaMo = ! in_array($nama, self::TANPA_MO, true);
            // Satu iterasi = satu kelompok MO; kunci grupnya cuma makloon (MoGroupingService).
            $ukuran = min(self::TOTAL_PENGOLAHAN - $dibuat, $adaMo ? mt_rand(2, 5) : mt_rand(1, 2));

            $skema = mt_rand(1, 100) <= 55 ? 'GDG' : 'UBJ';
            $mk = $makloonAktif[array_rand($makloonAktif)];
            $gudang = $master['gudangMaster'][array_rand($master['gudangMaster'])];
            $gdUser = $master['gudang'][array_rand($master['gudang'])];
            $ubUser = $master['ubj'][array_rand($master['ubj'])];
            $opUser = $master['operasi'][array_rand($master['operasi'])];
            $pgUser = $master['pengadaan'][array_rand($master['pengadaan'])];
            // Pengolahan selalu SETELAH gabahnya masuk, jadi Feb-Ags (SerGab-nya Jan-Ags).
            $tanggal = $this->tanggalAcak(2, 8);

            [$st0, $st1] = $skema === 'GDG' ? ['gudang', 'ub_jastasma'] : ['ub_jastasma', 'gudang'];
            $r = $this->resepPengolahan($nama, $st0, $st1);
            $pembuat = $skema === 'GDG' ? $gdUser : $ubUser;

            $ids = [];
            $kontribusi = [];

            for ($i = 0; $i < $ukuran; $i++) {
                $id = $this->idBaru($skema, $tanggal);
                $ids[] = $id;
                $ts = $tanggal->copy()->addHours(mt_rand(7, 17));

                $jatah = ($stok[$mk->id] ?? 0.0) * 0.96 / $barisPerMakloon;
                $gabah = round(min($anggaran[$mk->id] ?? 0.0, $jatah * mt_rand(60, 140) / 100), 2);
                // Baris kosong tidak ada gunanya untuk pengujian; kalau jatahnya sudah tandas,
                // sisakan batch kecil supaya jumlah transaksi tetap tercapai.
                $gabah = max(5_000.0, $gabah);
                $anggaran[$mk->id] = max(0.0, ($anggaran[$mk->id] ?? 0.0) - $gabah);
                // Rendemen nyata berkisar 49,8%-51,4% (bandingkan PengolahanGudang::RENDEMEN_ESTIMASI).
                $berasHgl = round($gabah * mt_rand(4980, 5140) / 10000, 2);
                // HGL fisik di gudang sedikit lebih kecil dari hasil olah menurut LHPK: itu susut,
                // dan memang dibiarkan berbeda tanpa validasi silang.
                $hglFisik = round($berasHgl - mt_rand(0, 900), 2);

                $t[] = [
                    'id_pengolahan' => $id,
                    'skema' => $skema,
                    'gudang_id' => $gudang->id,
                    'makloon_user_id' => $mk->id,
                    'current_stage' => $r['stage'],
                    'status_keseluruhan' => $r['selesai'] ? 'selesai' : 'berjalan',
                    'kerjaan' => null, // diisi segarkanKerjaan() setelah semua tahap masuk
                    'created_by' => $pembuat->id,
                    'created_at' => $ts,
                    'updated_at' => $ts,
                ];

                $statusGudang = $skema === 'GDG' ? $r['t0'] : $r['t1'];
                $statusLhpk = $skema === 'GDG' ? $r['t1'] : $r['t0'];

                if ($statusGudang !== null) {
                    $pg[] = $this->tahap([
                        'transaksi_pengolahan_id' => $id,
                        'gudang_id' => $gudang->id,
                        'tanggal_masuk_gudang' => $tanggal->toDateString(),
                        'kuantum_hgl' => $hglFisik,
                        'plat_mobil' => $this->plat(),
                        'supir' => self::SUPIR[array_rand(self::SUPIR)],
                    ], $statusGudang, $gdUser, $skema === 'GDG' ? $ubUser : $opUser, $ts);
                }

                if ($statusLhpk !== null) {
                    $pl[] = $this->tahap([
                        'transaksi_pengolahan_id' => $id,
                        'gudang_tujuan_id' => $gudang->id,
                        'no_lhpk' => sprintf('LHPK/%04d/%02d/%04d/08001', $this->seqLhpk++, (int) $tanggal->format('n'), (int) $tanggal->format('Y')),
                        'tanggal_lhpk' => $tanggal->toDateString(),
                        'kuantum_gabah_diolah' => $gabah,
                        'kuantum_beras_hgl' => $berasHgl,
                        'broken' => mt_rand(0, 400) / 100,
                        'menir' => mt_rand(0, 250) / 100,
                        'katul' => round($gabah * mt_rand(550, 660) / 10000, 2),
                        'ka1' => mt_rand(1300, 1400) / 100,
                        'ka2' => mt_rand(1300, 1400) / 100,
                        'ka3' => mt_rand(1300, 1400) / 100,
                        'reject' => mt_rand(0, 900) / 100,
                    ], $statusLhpk, $ubUser, $skema === 'UBJ' ? $gdUser : $opUser, $ts);
                }

                if ($r['tolak'] !== null) {
                    $penolak = match ($r['tolak']) {
                        'operasi' => $pgUser,
                        'gudang' => $ubUser,
                        default => $gdUser,
                    };
                    $tolak[] = [
                        'transaksi_id' => null,
                        'pengolahan_id' => $id,
                        'tahap' => $r['tolak'],
                        'catatan' => self::CATATAN_TOLAK[array_rand(self::CATATAN_TOLAK)],
                        'ditolak_oleh' => $penolak->id,
                        'ditolak_pada' => $ts->copy()->addHours(4),
                    ];
                }

                $audit[] = $this->audit(null, $id, $pembuat->id, 'buat_pengolahan', ['skema' => $skema, 'gudang_id' => $gudang->id], $ts);

                $kontribusi[$id] = [
                    'hgl' => $statusLhpk !== null ? $berasHgl : 0.0,
                    'gabah' => $statusLhpk !== null ? $gabah : 0.0,
                ];
            }

            if ($r['mo'] !== null) {
                $bulan = (int) $tanggal->format('n');
                $tahun = (int) $tanggal->format('Y');
                $tsMo = $tanggal->copy()->addDays(mt_rand(1, 6))->addHours(9);
                $noMo = sprintf('MO/%04d/%02d/%04d/08001', $this->seqMo++, $bulan, $tahun);
                $punyaDetail = $r['mo']['detail'];
                $direview = in_array($r['mo']['review'], ['diterima', 'ditolak'], true);

                $mo[$noMo] = [
                    'no_mo' => $noMo,
                    'no_tm_ada' => sprintf('TM/%04d/%02d/%04d/08001', $this->seqTm++, $bulan, $tahun),
                    'no_tm_gudang' => sprintf('TM/%04d/%02d/%04d/08010', $this->seqTm++, $bulan, $tahun),
                    'makloon_user_id' => $mk->id,
                    'total_kuantum_hgl' => $punyaDetail ? array_sum(array_column($kontribusi, 'hgl')) : 0,
                    'total_kuantum_gabah_diolah' => $punyaDetail ? array_sum(array_column($kontribusi, 'gabah')) : 0,
                    'no_out' => $r['mo']['out'] ? sprintf('OUT/%04d/%02d/%04d/ADA08001', $this->seqOut++, $bulan, $tahun) : null,
                    'tanggal_out' => $r['mo']['out'] ? $tsMo->copy()->addDays(mt_rand(1, 5))->toDateString() : null,
                    'status' => $r['mo']['status'],
                    'review_status' => $r['mo']['review'],
                    'catatan_penolakan' => $r['mo']['review'] === 'ditolak' ? self::CATATAN_TOLAK[array_rand(self::CATATAN_TOLAK)] : null,
                    'reviewed_by' => $direview ? $pgUser->id : null,
                    'reviewed_at' => $direview ? $tsMo : null,
                    'created_at' => $tsMo,
                    'updated_at' => $tsMo,
                    '__detail' => $punyaDetail ? $kontribusi : [],
                    '__ts' => $tsMo,
                ];

                $audit[] = $this->audit(null, $ids[0], $opUser->id, 'gabungkan_mo', ['no_mo' => $noMo, 'anggota' => count($ids)], $tsMo);
            }

            $dibuat += $ukuran;
        }

        $this->sisipkan('transaksi_pengolahan', $t);
        $this->sisipkan('pengolahan_gudang', $pg);
        $this->sisipkan('pengolahan_lhpk', $pl);
        $this->simpanMo($mo);
        $this->sisipkan('riwayat_penolakan', $tolak);
        $this->sisipkan('audit_logs', $audit);

        $this->command?->info(self::TOTAL_PENGOLAHAN.' transaksi Pengolahan dibuat.');
    }

    private function simpanMo(array $mo): void
    {
        if ($mo === []) {
            return;
        }

        $bersih = array_map(
            fn (array $row) => array_filter($row, fn (string $k) => ! str_starts_with($k, '__'), ARRAY_FILTER_USE_KEY),
            $mo,
        );
        $this->sisipkan('pengolahan_mo', array_values($bersih));

        $idMo = DB::table('pengolahan_mo')->whereIn('no_mo', array_keys($mo))->pluck('id', 'no_mo');
        $detail = [];

        foreach ($mo as $noMo => $row) {
            foreach ($row['__detail'] as $idPengolahan => $k) {
                $detail[] = [
                    'pengolahan_mo_id' => $idMo[$noMo],
                    'transaksi_pengolahan_id' => $idPengolahan,
                    'kuantum_hgl_kontribusi' => $k['hgl'],
                    'kuantum_gabah_diolah_kontribusi' => $k['gabah'],
                    'created_at' => $row['__ts'],
                    'updated_at' => $row['__ts'],
                ];
            }
        }

        $this->sisipkan('pengolahan_mo_detail', $detail);
    }

    /** @return array{t0:?string,t1:?string,stage:string,selesai:bool,tolak:?string,mo:?array} */
    private function resepPengolahan(string $profil, string $st0, string $st1): array
    {
        $d = ['t0' => 'diterima', 't1' => 'diterima', 'stage' => 'operasi', 'selesai' => false, 'tolak' => null, 'mo' => null];
        $mo = ['status' => 'proses', 'review' => 'draft', 'out' => false, 'detail' => true];

        return match ($profil) {
            't0_draft' => [...$d, 't0' => 'draft', 't1' => null, 'stage' => $st0],
            't0_kirim' => [...$d, 't0' => 'menunggu_review', 't1' => null, 'stage' => $st1],
            't0_ditolak' => [...$d, 't0' => 'ditolak', 't1' => null, 'stage' => $st0, 'tolak' => $st0],
            't1_draft' => [...$d, 't1' => 'draft', 'stage' => $st1],
            't1_kirim' => [...$d, 't1' => 'menunggu_review', 'stage' => 'operasi'],
            't1_ditolak' => [...$d, 't1' => 'ditolak', 'stage' => $st1, 'tolak' => $st1],
            'mo_draft' => [...$d, 'mo' => $mo],
            'mo_menunggu_pengadaan' => [...$d, 'stage' => 'pengadaan', 'mo' => [...$mo, 'review' => 'menunggu_review']],
            // MO ditolak Pengadaan memundurkan anggotanya ke Operasi (MoReviewService::tolak).
            'mo_ditolak' => [...$d, 'tolak' => 'operasi', 'mo' => [...$mo, 'review' => 'ditolak']],
            'mo_diterima_belum_out' => [...$d, 'stage' => 'pengadaan', 'mo' => [...$mo, 'review' => 'diterima']],
            // MO batal WAJIB tanpa mo_detail (MoGroupingService::batalkan), anggotanya balik ke Operasi.
            'mo_dibatalkan' => [...$d, 'mo' => [...$mo, 'status' => 'dibatalkan', 'detail' => false]],
            'selesai' => [...$d, 'stage' => 'pengadaan', 'selesai' => true, 'mo' => [...$mo, 'status' => 'lengkap', 'review' => 'diterima', 'out' => true]],
            default => $d, // siap_mo
        };
    }

    // ----------------------------------------------------------------- utilitas

    /**
     * Baris tahap generik. Status menentukan kolom submit & lock persis seperti
     * TransaksiStageService/PengolahanStageService: draft belum terkirim, 'diterima' terkunci.
     */
    private function tahap(array $data, string $status, User $pengisi, User $peninjau, Carbon $ts): array
    {
        $terkirim = $status !== 'draft';

        return [
            ...$data,
            'status' => $status,
            'catatan_penolakan' => $status === 'ditolak' ? self::CATATAN_TOLAK[array_rand(self::CATATAN_TOLAK)] : null,
            'submitted_by' => $terkirim ? $pengisi->id : null,
            'submitted_at' => $terkirim ? $ts : null,
            'locked_by' => $status === 'diterima' ? $peninjau->id : null,
            'locked_at' => $status === 'diterima' ? $ts->copy()->addHours(2) : null,
            'created_at' => $ts,
            'updated_at' => $ts,
        ];
    }

    private function audit(?string $transaksiId, ?string $pengolahanId, int $userId, string $aksi, array $detail, Carbon $ts): array
    {
        return [
            'transaksi_id' => $transaksiId,
            'pengolahan_id' => $pengolahanId,
            'user_id' => $userId,
            'aksi' => $aksi,
            'detail' => json_encode($detail),
            'created_at' => $ts,
        ];
    }

    private function notifikasi(string $profil, string $transaksiId, array $master, Carbon $ts): array
    {
        [$kunci, $tipe, $judul] = match (true) {
            $profil === 'po_ditolak_keuangan', str_ends_with($profil, '_ditolak') => ['pengadaan', 'ditolak', 'Data ditolak'],
            $profil === 'selesai' => ['keuangan', 'diterima', 'Transaksi selesai'],
            default => ['ubj', 'dikirim', 'Data dikirim untuk ditinjau'],
        };

        $penerima = $master[$kunci][array_rand($master[$kunci])];

        return [
            'user_id' => $penerima->id,
            'actor_id' => $master['admin']->id,
            'transaksi_id' => $transaksiId,
            'tipe' => $tipe,
            'judul' => $judul,
            'pesan' => "Transaksi {$transaksiId}: {$judul}.",
            'data' => json_encode(['modul' => 'sergab', 'profil' => $profil]),
            'read_at' => mt_rand(1, 100) <= 40 ? $ts->copy()->addDay() : null,
            'created_at' => $ts,
            'updated_at' => $ts,
        ];
    }

    private function penolak(string $tahap, array $master): User
    {
        $daftar = match ($tahap) {
            'jemput_pangan', 'makloon_kirim' => $master['makloon'],
            'makloon', 'makloon_terima' => $master['ubj'],
            'ub_jastasma' => $master['pengadaan'],
            default => $master['keuangan'],
        };

        return $daftar[array_rand($daftar)];
    }

    private function plat(): string
    {
        $huruf = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';

        return sprintf(
            '%s %d %s%s',
            ['BE', 'BG', 'B', 'BA', 'BD'][mt_rand(0, 4)],
            mt_rand(8000, 9999),
            $huruf[mt_rand(0, 24)],
            $huruf[mt_rand(0, 24)],
        );
    }

    private function tanggalAcak(int $bulanAwal = 1, int $bulanAkhir = 8): Carbon
    {
        return Carbon::create(2026, mt_rand($bulanAwal, $bulanAkhir), mt_rand(1, 28), 0, 0, 0);
    }

    /** @return list<string> profil diperbanyak sesuai bobot, siap dipilih dengan array_rand(). */
    private function bobot(array $peta): array
    {
        $keluar = [];
        foreach ($peta as $nama => $bobot) {
            $keluar = [...$keluar, ...array_fill(0, $bobot, $nama)];
        }

        return $keluar;
    }

    private function idBaru(string $skema, Carbon $tanggal): string
    {
        $periode = $tanggal->format('m/Y');
        $kunci = $skema.'|'.$periode;
        $this->urut[$kunci] = ($this->urut[$kunci] ?? 0) + 1;

        return sprintf('%05d/%s/%s', $this->urut[$kunci], $periode, $skema);
    }

    /**
     * Counter dimulai dari nomor TERTINGGI yang sudah ada, bukan dari nol -- sama seperti
     * TransaksiStageService::generateIdTransaksi -- supaya seeder ini aman dijalankan di atas
     * database yang sudah berisi data (mis. hasil DemoSeeder).
     */
    private function muatCounter(): void
    {
        foreach ([['transaksi', 'id_transaksi'], ['transaksi_pengolahan', 'id_pengolahan']] as [$tabel, $kolom]) {
            foreach (DB::table($tabel)->pluck($kolom) as $id) {
                [$urut, $bulan, $tahun, $skema] = explode('/', $id);
                $kunci = $skema.'|'.$bulan.'/'.$tahun;
                $this->urut[$kunci] = max($this->urut[$kunci] ?? 0, (int) $urut);
            }
        }
    }

    private function simpanCounter(): void
    {
        foreach ($this->urut as $kunci => $urut) {
            [$skema, $periode] = explode('|', $kunci);
            [$bulan, $tahun] = explode('/', $periode);

            DB::table('nomor_urut_transaksi')->updateOrInsert(
                ['skema' => $skema, 'tahun' => (int) $tahun, 'bulan' => (int) $bulan],
                ['urut' => $urut, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    /** Isi ulang kolom cache transaksi_pengolahan.kerjaan -- caranya sama dengan migrasi pembuatnya. */
    private function segarkanKerjaan(): void
    {
        foreach (KerjaanPengolahan::SEMUA as $kerjaan) {
            $ids = KerjaanPengolahan::joinTahap(DB::table('transaksi_pengolahan'))
                ->whereRaw(KerjaanPengolahan::ekspresi().' = ?', [$kerjaan])
                ->pluck('transaksi_pengolahan.id_pengolahan');

            foreach ($ids->chunk(1000) as $bagian) {
                DB::table('transaksi_pengolahan')->whereIn('id_pengolahan', $bagian->all())->update(['kerjaan' => $kerjaan]);
            }
        }
    }

    /**
     * Foto sungguhan untuk sebagian kecil transaksi. Konversi thumbnail-nya di-queue
     * (QUEUE_CONNECTION=database), jadi seeder tidak menunggu pemrosesan gambar.
     */
    private function foto(): void
    {
        $png = base64_decode(self::PNG);
        $n = self::SAMPEL_FOTO;

        $pasang = function ($record, array $koleksi) use ($png) {
            foreach ($koleksi as $nama) {
                $record->addMediaFromString($png)->usingFileName($nama.'.png')->toMediaCollection($nama);
            }
        };

        $sasaran = [
            [DataJemputPangan::class, 'diterima', ['foto_petani', 'foto_gabah', 'foto_serah_terima', 'foto_kwitansi', 'foto_surat_pernyataan', 'foto_surat_jalan']],
            [DataMakloonTjp::class, 'diterima', ['foto_surat_jalan_paraf', 'foto_nota_timbang']],
            [DataMakloonMpp::class, 'diterima', DataMakloonMpp::FOTO_TAHAP_KIRIM],
            [DataMakloonTerima::class, 'diterima', DataMakloonTerima::FOTO],
            [DataUbJastasma::class, 'diterima', ['foto_lhpk_hpk']],
            [DataPengadaan::class, 'lengkap', ['foto_barang', 'foto_serah_terima', 'foto_bukti_pembayaran', 'foto_surat_pernyataan_usia_panen']],
            [PengolahanGudang::class, 'diterima', ['foto_notim']],
            [PengolahanLhpk::class, 'diterima', ['foto_lhpk']],
        ];

        foreach ($sasaran as [$model, $status, $koleksi]) {
            foreach ($model::where('status', $status)->latest('id')->take($n)->get() as $record) {
                $pasang($record, $koleksi);
            }
        }

        $this->command?->info('Sampel foto terpasang.');
    }

    private function sisipkan(string $tabel, array $baris): void
    {
        foreach (array_chunk($baris, 500) as $bagian) {
            DB::table($tabel)->insert($bagian);
        }
    }
}
