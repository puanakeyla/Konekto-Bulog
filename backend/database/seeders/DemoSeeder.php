<?php

namespace Database\Seeders;

use App\Models\DataGudang;
use App\Models\DataJemputPangan;
use App\Models\DataKeuangan;
use App\Models\DataMakloonTjp;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\NomorUrutTransaksi;
use App\Models\PermintaanOperasi;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Data demo yang mencerminkan berkas asli (Sheet 1: alur transaksi TJP -> PO -> keuangan,
 * Sheet 2: modul Operasi & Gudang mandiri). Idempoten — aman dijalankan ulang.
 * Jalankan manual: php artisan db:seed --class=DemoSeeder
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RoleSeeder::class);

        // Akun demo per role (password: "password").
        $jp = $this->user('jp_demo', 'jemput_pangan');
        $this->user('ubj_demo', 'ub_jastasma');
        $pengadaanUser = $this->user('pengadaan_demo', 'pengadaan');
        $this->user('keuangan_demo', 'keuangan');
        $operasiUser = $this->user('operasi_demo', 'operasi');
        $gudangUser = $this->user('gudang_demo', 'gudang');
        $makloon = $this->user('mk_jaya', 'makloon', 'PT. JAYA MANUNGGAL PANGAN', 'Cikupa', 'Tangerang');

        $this->seedTransaksiTjp($jp, $makloon, $pengadaanUser);
        $this->seedInProgressTjp($jp, $makloon, $pengadaanUser);
        $this->seedOperasi($operasiUser, $pengadaanUser);
        $this->seedGudang($gudangUser);
    }

    /**
     * Transaksi TJP yang masih berjalan, satu menyangkut di tiap tahap, supaya halaman
     * kerja tiap role (Jemput Pangan, Makloon, UB Jastasma, Pengadaan, Keuangan) ada isinya.
     */
    private function seedInProgressTjp(User $jp, User $makloon, User $pengadaan): void
    {
        // 1) Antrean JEMPUT PANGAN: masih draft, tinggal dikirim.
        $this->transaksi('00010/01/2026/TJP', 'jemput_pangan', $jp);
        $this->jpData('00010/01/2026/TJP', $makloon, $jp, 'draft', 'AGUS', 'BE 9001 AA', 9500);

        // 2) Antrean MAKLOON: JP sudah dikirim, menunggu ditinjau Makloon.
        $this->transaksi('00011/01/2026/TJP', 'makloon', $jp);
        $this->jpData('00011/01/2026/TJP', $makloon, $jp, 'menunggu_review', 'BUDI', 'BE 9002 BB', 9800);

        // 3) Antrean UB JASTASMA: JP diterima, Makloon menunggu ditinjau.
        $this->transaksi('00012/01/2026/TJP', 'ub_jastasma', $jp);
        $this->jpData('00012/01/2026/TJP', $makloon, $jp, 'diterima', 'CANDRA', 'BE 9003 CC', 10100);
        $this->makloonData('00012/01/2026/TJP', $makloon, 'menunggu_review', 10100);

        // 4) Antrean PENGADAAN: JP+Makloon+UB diterima, siap digabung jadi PO.
        $this->transaksi('00013/01/2026/TJP', 'pengadaan', $jp);
        $this->jpData('00013/01/2026/TJP', $makloon, $jp, 'diterima', 'DEDI', 'BE 9004 DD', 9700);
        $this->makloonData('00013/01/2026/TJP', $makloon, 'diterima', 9700);
        $this->ubData('00013/01/2026/TJP', 'diterima');

        // 5) Antrean KEUANGAN: sudah jadi PO, disetujui Pengadaan, belum dibayar.
        $this->transaksi('00014/01/2026/TJP', 'keuangan', $jp);
        $this->jpData('00014/01/2026/TJP', $makloon, $jp, 'diterima', 'ERI', 'BE 9005 EE', 9900);
        $this->makloonData('00014/01/2026/TJP', $makloon, 'diterima', 9900);
        $this->ubData('00014/01/2026/TJP', 'diterima');

        $po = DataPengadaan::updateOrCreate(
            ['no_po' => 'PO/106/01/2026/08001'],
            [
                'tanggal_bongkar' => '2026-01-26',
                'id_pemasok' => '419119',
                'makloon_user_id' => $makloon->id,
                'total_kuantum' => 9900,
                'harga' => 6500,
                'total_harga' => 9900 * 6500,
                'status' => 'lengkap',
                'review_status' => 'diterima',
                'reviewed_by' => $pengadaan->id,
                'reviewed_at' => now(),
            ],
        );
        PoDetail::updateOrCreate(
            ['transaksi_id' => '00014/01/2026/TJP'],
            ['data_pengadaan_id' => $po->id, 'kuantum_kontribusi' => 9900, 'no_in' => 'IN/19600/01/2026/ADA08001'],
        );
        DataKeuangan::updateOrCreate(
            ['data_pengadaan_id' => $po->id],
            ['status_bayar' => 'belum', 'review_status' => 'diterima'],
        );

        NomorUrutTransaksi::updateOrCreate(
            ['skema' => 'TJP', 'tahun' => 2026, 'bulan' => 1],
            ['urut' => 14],
        );
    }

    private function transaksi(string $id, string $stage, User $jp): void
    {
        Transaksi::updateOrCreate(
            ['id_transaksi' => $id],
            ['skema' => 'TJP', 'current_stage' => $stage, 'status_keseluruhan' => 'berjalan', 'created_by' => $jp->id],
        );
    }

    private function jpData(string $id, User $makloon, User $jp, string $status, string $driver, string $plat, float $kuantum): void
    {
        $locked = $status === 'diterima' ? ['locked_at' => now(), 'locked_by' => $jp->id] : [];

        DataJemputPangan::updateOrCreate(
            ['transaksi_id' => $id],
            array_merge([
                'id_pemasok' => '419119',
                'supir' => $driver,
                'plat_mobil' => $plat,
                'nama_poktan_gapoktan' => 'Gapoktan Sumber Rejeki',
                'desa' => 'Sukamaju',
                'kecamatan' => 'Cikupa',
                'kabupaten' => 'Tangerang',
                'makloon_user_id' => $makloon->id,
                'tanggal_kirim' => '2026-01-26',
                'kuantum' => $kuantum,
                'jarak_ke_makloon_km' => 12.5,
                'status' => $status,
                'submitted_by' => $jp->id,
                'submitted_at' => now(),
            ], $locked),
        );
    }

    private function makloonData(string $id, User $makloon, string $status, float $kuantum): void
    {
        DataMakloonTjp::updateOrCreate(
            ['transaksi_id' => $id],
            [
                'tanggal_bongkar' => '2026-01-26',
                'kuantum_bongkar' => $kuantum,
                'status' => $status,
                'submitted_by' => $makloon->id,
                'submitted_at' => now(),
            ],
        );
    }

    private function ubData(string $id, string $status): void
    {
        DataUbJastasma::updateOrCreate(
            ['transaksi_id' => $id],
            [
                'ka1' => 28.0, 'ka2' => 28.1, 'ka3' => 27.9, 'hampa' => 5.5, 'butir_hijau' => 4.8,
                'status' => $status,
                'submitted_at' => now(),
            ],
        );
    }

    /** Sheet 1: 9 transaksi TJP digabung ke satu PO, sudah dibayar (DONE). */
    private function seedTransaksiTjp(User $jp, User $makloon, User $pengadaan): void
    {
        // [driver, plat, kuantum, ka1, ka2, ka3, hampa, butir_hijau, no_in]
        $rows = [
            ['SURYA', 'BE 8877 NX', 9730, 29.4, 29.4, 29.3, 5.8, 6.3, 'IN/19547/01/2026/ADA08001'],
            ['RIYAN', 'BE 8178 NQ', 10050, 26.3, 26.2, 26.3, 5.7, 4.3, 'IN/19557/01/2026/ADA08001'],
            ['TULUS', 'BE 8990 PT', 9620, 27.3, 27.2, 27.3, 5.7, 4.3, 'IN/19570/01/2026/ADA08001'],
            ['YONO', 'BE 8894 UQ', 9910, 29.6, 29.6, 29.5, 5.8, 4.9, 'IN/19574/01/2026/ADA08001'],
            ['EPAN', 'B 9176 TYX', 9990, 28.3, 28.3, 28.2, 5.4, 6.3, 'IN/19576/01/2026/ADA08001'],
            ['ERLANGGA', 'BG 8802 JO', 9910, 27.6, 27.5, 27.5, 5.5, 4.7, 'IN/19577/01/2026/ADA08001'],
            ['WIDI', 'BE 8295 DA', 9860, 29.2, 29.5, 29.6, 6.3, 5.7, 'IN/19582/01/2026/ADA08001'],
            ['RUSLAN', 'BG 8533 JD', 10080, 27.6, 27.6, 27.6, 5.5, 4.5, 'IN/19584/01/2026/ADA08001'],
            ['FIRMAN', 'BE 8306 IX', 9400, 23.5, 23.4, 23.6, 5.7, 4.3, 'IN/19589/01/2026/ADA08001'],
        ];

        $harga = 6500;
        $totalKuantum = array_sum(array_column($rows, 2)); // 88.550
        $tanggal = '2026-01-25';

        $pengadaanData = DataPengadaan::updateOrCreate(
            ['no_po' => 'PO/105/01/2026/08001'],
            [
                'tanggal_bongkar' => $tanggal,
                'id_pemasok' => '419119',
                'makloon_user_id' => $makloon->id,
                'total_kuantum' => $totalKuantum,
                'harga' => $harga,
                'total_harga' => $totalKuantum * $harga, // 575.575.000
                'no_spp' => 'SPP-0066/08010/01/2026',
                'status' => 'lengkap',
                'review_status' => 'diterima',
                'reviewed_by' => $pengadaan->id,
                'reviewed_at' => now(),
            ]
        );

        foreach ($rows as $i => $r) {
            [$driver, $plat, $kuantum, $ka1, $ka2, $ka3, $hampa, $butir, $noIn] = $r;
            $id = sprintf('%05d/01/2026/TJP', $i + 1);

            Transaksi::updateOrCreate(
                ['id_transaksi' => $id],
                ['skema' => 'TJP', 'current_stage' => 'selesai', 'status_keseluruhan' => 'selesai', 'created_by' => $jp->id],
            );

            DataJemputPangan::updateOrCreate(
                ['transaksi_id' => $id],
                [
                    'id_pemasok' => '419119',
                    'supir' => $driver,
                    'plat_mobil' => $plat,
                    'nama_poktan_gapoktan' => 'Gapoktan Sumber Rejeki',
                    'desa' => 'Sukamaju',
                    'kecamatan' => 'Cikupa',
                    'kabupaten' => 'Tangerang',
                    'makloon_user_id' => $makloon->id,
                    'tanggal_kirim' => $tanggal,
                    'kuantum' => $kuantum,
                    'jarak_ke_makloon_km' => 12.5,
                    'status' => 'diterima',
                    'submitted_by' => $jp->id,
                    'submitted_at' => now(),
                    'locked_at' => now(),
                ],
            );

            DataMakloonTjp::updateOrCreate(
                ['transaksi_id' => $id],
                [
                    'tanggal_bongkar' => $tanggal,
                    'kuantum_bongkar' => $kuantum,
                    'status' => 'diterima',
                    'submitted_by' => $makloon->id,
                    'submitted_at' => now(),
                    'locked_at' => now(),
                ],
            );

            DataUbJastasma::updateOrCreate(
                ['transaksi_id' => $id],
                [
                    'ka1' => $ka1, 'ka2' => $ka2, 'ka3' => $ka3, 'hampa' => $hampa, 'butir_hijau' => $butir,
                    'status' => 'diterima',
                    'submitted_at' => now(),
                    'locked_at' => now(),
                ],
            );

            PoDetail::updateOrCreate(
                ['transaksi_id' => $id],
                ['data_pengadaan_id' => $pengadaanData->id, 'kuantum_kontribusi' => $kuantum, 'no_in' => $noIn],
            );
        }

        DataKeuangan::updateOrCreate(
            ['data_pengadaan_id' => $pengadaanData->id],
            ['status_bayar' => 'dibayarkan', 'tanggal_bayar' => '2026-01-28', 'review_status' => 'diterima'],
        );

        // Lanjutkan penomoran otomatis dari 9 supaya transaksi baru via API mulai dari 10.
        NomorUrutTransaksi::updateOrCreate(
            ['skema' => 'TJP', 'tahun' => 2026, 'bulan' => 1],
            ['urut' => count($rows)],
        );
    }

    /** Sheet 2 (kiri): permintaan pengeluaran stok Operasi yang sudah dikeluarkan + hasil. */
    private function seedOperasi(User $operasi, User $pengadaan): void
    {
        // [gabah_diolah, no_out, no_mo, no_tm, hgl, katul, rendemen]
        $rows = [
            [897890, 'OUT/00832/02/2026/ADA08001', 'MO/3746/02/2026/08001', 'TM/3746/02/2026/08001', 458500, 54000, 51.06],
            [1113810, 'OUT/00853/02/2026/ADA08001', 'MO/3798/02/2026/08001', 'TM/3798/02/2026/08001', 569300, 63500, 51.11],
            [1350090, 'OUT/00881/02/2026/ADA08001', 'MO/3868/02/2026/08001', 'TM/3868/02/2026/08001', 690500, 79800, 51.14],
            [1358070, 'OUT/00899/03/2026/ADA08001', 'MO/3912/03/2026/08001', 'TM/3912/03/2026/08001', 695000, 73000, 51.18],
            [1748300, 'OUT/01013/04/2026/ADA08001', 'MO/4111/04/2026/08001', 'TM/4111/04/2026/08001', 892350, 85000, 51.04],
            [2172760, 'OUT/01024/04/2026/ADA08001', 'MO/4127/04/2026/08001', 'TM/4127/04/2026/08001', 1109050, 108600, 51.04],
            [1095490, 'OUT/01130/05/2026/ADA08001', 'MO/4274/05/2026/08001', 'TM/4274/05/2026/08001', 558700, 54900, 51.00],
            [1694100, 'OUT/01131/05/2026/ADA08001', 'MO/4275/05/2026/08001', 'TM/4275/05/2026/08001', 864400, 85000, 51.02],
            [296000, 'OUT/01152/06/2026/ADA08001', 'MO/4310/06/2026/08001', 'TM/4310/06/2026/08001', 148750, 14850, 50.25],
        ];

        foreach ($rows as $r) {
            [$gabah, $noOut, $noMo, $noTm, $hgl, $katul, $rendemen] = $r;

            PermintaanOperasi::updateOrCreate(
                ['no_out' => $noOut],
                [
                    'gabah_diolah_kg' => $gabah,
                    'status_out' => 'dikeluarkan',
                    'kuantum_out' => $gabah,
                    'no_mo' => $noMo,
                    'no_tm' => $noTm,
                    'hgl_kg' => $hgl,
                    'broken_kg' => 0,
                    'menir_kg' => 0,
                    'katul_kg' => $katul,
                    'rendemen_persen' => $rendemen,
                    'created_by' => $operasi->id,
                    'reviewed_by' => $pengadaan->id,
                    'reviewed_at' => now(),
                ],
            );
        }
    }

    /** Sheet 2 (kanan): pencatatan penerimaan Gudang mandiri. */
    private function seedGudang(User $gudang): void
    {
        // [tanggal_masuk, nama_gudang, realisasi_hgl, no_tm]
        $rows = [
            ['2026-02-10', 'Campang Raya I', 458500, 'TM/8712/02/2026/08001'],
            ['2026-02-15', 'Campang Raya I', 569300, 'TM/8818/02/2026/08001'],
            ['2026-02-20', 'Putra Bali', 199350, 'TM/8926/02/2026/08001'],
            ['2026-02-25', 'CAMPANG RAYA 2', 94000, 'TM/8927/02/2026/08001'],
            ['2026-03-05', 'Campang Raya I', 397150, 'TM/8925/03/2026/08001'],
            ['2026-03-15', 'Campang Raya I', 695000, 'TM/9030/03/2026/08001'],
            ['2026-04-05', 'Yapindex', 42000, 'TM/9490/04/2026/08001'],
            ['2026-04-10', 'Abadi Sakti', 412350, 'TM/9491/04/2026/08001'],
            ['2026-04-15', 'Ketapang', 438000, 'TM/9492/04/2026/08001'],
        ];

        foreach ($rows as $r) {
            [$tanggal, $nama, $realisasi, $noTm] = $r;

            DataGudang::updateOrCreate(
                ['no_tm' => $noTm],
                ['tanggal_masuk' => $tanggal, 'nama_gudang' => $nama, 'realisasi_hgl' => $realisasi, 'created_by' => $gudang->id],
            );
        }
    }

    private function user(string $username, string $role, ?string $namaMaklon = null, ?string $kecamatan = null, ?string $kabupaten = null): User
    {
        $roleId = Role::where('nama_role', $role)->value('id');

        $user = User::firstOrCreate(
            ['username' => $username],
            [
                'password' => 'password',
                'role_id' => $roleId,
                'nama_maklon' => $namaMaklon,
                'kecamatan' => $kecamatan,
                'kabupaten' => $kabupaten,
                'is_active' => true,
            ],
        );

        $user->syncRoles($role);

        return $user;
    }
}
