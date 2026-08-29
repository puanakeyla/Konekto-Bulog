<?php

namespace Tests\Feature\Monitoring;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonTjp;
use App\Models\DataPengadaan;
use App\Models\Gudang;
use App\Models\PengolahanGudang;
use App\Models\PengolahanLhpk;
use App\Models\PengolahanMo;
use App\Models\PengolahanMoDetail;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonitoringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_sebaran_tahap_tetap_ok_meski_ada_tahap_tanpa_transaksi(): void
    {
        // Hanya ada satu transaksi di tahap jemput_pangan -- semua tahap lain berjumlah 0.
        // Regression guard: tahap kosong (lookup null) harus tetap menghasilkan total 0,
        // bukan error saat membaca properti pada null.
        Transaksi::create([
            'id_transaksi' => '00001/07/2026/TJP',
            'skema' => 'TJP',
            'current_stage' => 'jemput_pangan',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->buatUser('jemput_pangan')->id,
        ]);

        Sanctum::actingAs($this->buatUser('pengadaan'));
        $response = $this->getJson('/api/monitoring/sebaran-tahap');

        $response->assertOk();
        $response->assertJsonPath('data.0.skema', 'TJP');
        // Tahap pertama TJP punya 1 transaksi, tahap-tahap kosong harus bernilai 0 (bukan error).
        $response->assertJsonPath('data.0.stages.0.total', 1);
        $response->assertJsonPath('data.0.stages.1.total', 0);
    }

    /**
     * Angka pengolahan dihitung di database dari LHPK yang sudah DITERIMA saja; yang masih
     * menunggu review tidak boleh ikut menggeser tren maupun rendemen.
     */
    public function test_monitoring_pengolahan_hanya_menghitung_lhpk_yang_diterima(): void
    {
        $gudang = Gudang::create(['kode' => 'ADA08001', 'nama' => 'Gudang A']);
        $makloon = $this->buatUser('makloon');
        $makloon->update(['nama_maklon' => 'Makloon Alpha']);

        $diterima = $this->buatPengolahan($gudang, $makloon, 'GDG', 'selesai');
        $this->buatLhpk($diterima, 'LHPK/OK', 20000, 12500, 'diterima');

        $menunggu = $this->buatPengolahan($gudang, $makloon, 'UBJ', 'berjalan');
        $this->buatLhpk($menunggu, 'LHPK/DRAFT', 90000, 90000, 'menunggu_review');

        Sanctum::actingAs($this->buatUser('admin'));
        $response = $this->getJson('/api/monitoring/pengolahan')->assertOk();

        $response->assertJsonPath('data.ringkasan.gabah_diolah', 20000)
            ->assertJsonPath('data.ringkasan.beras_hgl', 12500)
            ->assertJsonPath('data.ringkasan.rendemen', 62.5)
            ->assertJsonPath('data.ringkasan.selesai', 1)
            ->assertJsonPath('data.ringkasan.berjalan', 1)
            ->assertJsonPath('data.makloon_teratas.0.nama_maklon', 'Makloon Alpha')
            ->assertJsonPath('data.makloon_teratas.0.beras_hgl', 12500)
            // Sumbu tren selalu 12 bulan penuh, termasuk bulan tanpa data.
            ->assertJsonCount(12, 'data.tren_bulanan')
            ->assertJsonCount(2, 'data.sebaran_tahap');

        $bulanIni = collect($response->json('data.tren_bulanan'))->firstWhere('bulan', now()->format('Y-m'));
        $this->assertEquals(12500, $bulanIni['beras_hgl']);
    }

    public function test_monitoring_pengolahan_tertutup_untuk_non_admin(): void
    {
        Sanctum::actingAs($this->buatUser('operasi'));

        $this->getJson('/api/monitoring/pengolahan')->assertForbidden();
    }

    /**
     * Neraca gabah per makloon menyatukan dua rantai dalam satu baris. Yang diuji di sini bukan
     * sekadar "ada angkanya", tapi tiga aturan yang mudah sekali meleset:
     *   - tahap yang belum diterima TIDAK ikut dijumlah (kuantumnya belum final),
     *   - kolom turunan dihitung dari selisih yang benar (termasuk yang wajar minus),
     *   - transaksi tanpa PO masuk "belum IN"/"belum SPP", bukan hilang dari total.
     */
    public function test_rekap_makloon_menyatukan_sergab_dan_pengolahan(): void
    {
        $gudang = Gudang::create(['kode' => 'ADA08001', 'nama' => 'Gudang A']);
        $makloon = $this->buatUser('makloon');
        $makloon->update(['nama_maklon' => 'Makloon Alpha']);

        // --- Rantai SerGab ---
        // Sudah ber-IN dan PO-nya sudah diterima Keuangan.
        $this->buatTjp($makloon, '00001', 10000, 'diterima', noIn: 'IN/1', poDiterima: true);
        // Belum masuk PO sama sekali -> belum IN & belum SPP.
        $this->buatTjp($makloon, '00002', 4000, 'diterima');
        // Tahap makloon belum diterima -> tidak boleh ikut dihitung sedikit pun.
        $this->buatTjp($makloon, '00003', 99000, 'menunggu_review');

        // --- Rantai Pengolahan ---
        $selesai = $this->buatPengolahan($gudang, $makloon, 'GDG', 'selesai');
        $this->buatLhpk($selesai, 'LHPK/1', 8000, 4000, 'diterima', katul: 500);
        $this->masukkanMo($selesai, 'MO/1', 'diterima');

        $berjalan = $this->buatPengolahan($gudang, $makloon, 'GDG', 'berjalan');
        $this->buatLhpk($berjalan, 'LHPK/2', 1000, 600, 'diterima');

        // Tahap Gudang jalannya sendiri: yang diterima memberi estimasi 2.550 / 0,51 = 5.000 kg,
        // yang belum diterima tidak boleh ikut sama sekali.
        $this->buatGudang($selesai, 2550, 'diterima');
        $this->buatGudang($berjalan, 99000, 'menunggu_review');

        // LHPK yang masih menunggu review tidak ikut.
        $draft = $this->buatPengolahan($gudang, $makloon, 'UBJ', 'berjalan');
        $this->buatLhpk($draft, 'LHPK/3', 50000, 50000, 'menunggu_review');

        Sanctum::actingAs($this->buatUser('admin'));
        $res = $this->getJson('/api/monitoring/rekap-makloon')->assertOk();

        $res->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.nama_maklon', 'Makloon Alpha')
            ->assertJsonPath('data.0.gabah_diterima', 14000)
            ->assertJsonPath('data.0.gabah_sudah_in', 10000)
            ->assertJsonPath('data.0.gabah_belum_in', 4000)
            ->assertJsonPath('data.0.gabah_spp', 10000)
            ->assertJsonPath('data.0.gabah_belum_spp', 4000)
            ->assertJsonPath('data.0.estimasi_gabah', 5000)
            ->assertJsonPath('data.0.olah_rekap', 9000)
            ->assertJsonPath('data.0.belum_adm_belum_olah', 1000)
            ->assertJsonPath('data.0.stok_pengurang_gudang', 5000)
            ->assertJsonPath('data.0.olah_selesai', 8000)
            ->assertJsonPath('data.0.stok_real', 2000)
            ->assertJsonPath('data.0.hgl', 4600)
            ->assertJsonPath('data.0.katul', 500)
            ->assertJsonPath('data.0.rendemen', 57.5)
            ->assertJsonPath('data.0.hgl_operasi', 4000)
            // Wajar minus: realisasi Operasi belum menyusul HGL yang sudah dilaporkan UB.
            ->assertJsonPath('data.0.hgl_belum_adm', -600)
            ->assertJsonPath('data.0.persentase_olah', 80);
    }

    /**
     * Estimasi dibulatkan PER PENGOLAHAN sebelum dijumlah, sama seperti yang dilihat orang di
     * Rekap Pengolahan -- supaya kolom di sana bisa dijumlah tangan dan ketemu dengan total di
     * neraca ini. Angkanya sengaja dipilih yang membuat kedua urutan berbeda: dibulatkan dulu
     * lalu dijumlah = 1.961 + 3.922 = 5.883, sedangkan dijumlah dulu baru dibulatkan = 5.882.
     */
    public function test_estimasi_gabah_dibulatkan_per_pengolahan_sebelum_dijumlah(): void
    {
        $gudang = Gudang::create(['kode' => 'ADA08002', 'nama' => 'Gudang B']);
        $makloon = $this->buatUser('makloon');
        $makloon->update(['nama_maklon' => 'Makloon Bulat']);

        $this->buatGudang($this->buatPengolahan($gudang, $makloon, 'GDG', 'berjalan'), 1000, 'diterima');
        $this->buatGudang($this->buatPengolahan($gudang, $makloon, 'GDG', 'berjalan'), 2000, 'diterima');

        Sanctum::actingAs($this->buatUser('admin'));

        $this->getJson('/api/monitoring/rekap-makloon')->assertOk()
            // Mitra ini belum punya gabah masuk sama sekali, tapi tetap muncul: data gudangnya
            // saja sudah cukup jadi alasan untuk dilihat.
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.estimasi_gabah', 5883)
            // Wajar minus: HGL sudah masuk gudang padahal gabahnya belum ber-No IN.
            ->assertJsonPath('data.0.stok_pengurang_gudang', -5883);
    }

    /** Makloon tanpa aktivitas apa pun tidak ikut jadi baris kosong. */
    public function test_rekap_makloon_melewati_mitra_tanpa_aktivitas(): void
    {
        $this->buatUser('makloon')->update(['nama_maklon' => 'Makloon Nganggur']);

        Sanctum::actingAs($this->buatUser('admin'));

        $this->getJson('/api/monitoring/rekap-makloon')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_rekap_makloon_tertutup_untuk_non_admin(): void
    {
        Sanctum::actingAs($this->buatUser('keuangan'));

        $this->getJson('/api/monitoring/rekap-makloon')->assertForbidden();
    }

    /** Satu transaksi TJP lengkap sampai tahap makloon, opsional beserta PO-nya. */
    private function buatTjp(User $makloon, string $urut, float $kuantum, string $statusMakloon, ?string $noIn = null, bool $poDiterima = false): Transaksi
    {
        $transaksi = Transaksi::create([
            'id_transaksi' => $urut.'/07/2026/TJP',
            'skema' => 'TJP',
            'current_stage' => 'pengadaan',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $makloon->id,
        ]);

        DataJemputPangan::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'makloon_user_id' => $makloon->id,
            'kuantum' => $kuantum,
            'status' => 'diterima',
        ]);

        DataMakloonTjp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'tanggal_bongkar' => now()->toDateString(),
            'kuantum_bongkar' => $kuantum,
            'status' => $statusMakloon,
        ]);

        if ($noIn !== null || $poDiterima) {
            $po = DataPengadaan::create([
                'tanggal_bongkar' => now()->toDateString(),
                'id_pemasok' => 'PMSK/'.$urut,
                'makloon_user_id' => $makloon->id,
                'total_kuantum' => $kuantum,
                'harga' => 6500,
                'total_harga' => $kuantum * 6500,
                'no_po' => 'PO/'.$urut,
                'review_status' => $poDiterima ? 'diterima' : 'menunggu_review',
            ]);

            PoDetail::create([
                'data_pengadaan_id' => $po->id,
                'transaksi_id' => $transaksi->id_transaksi,
                'kuantum_kontribusi' => $kuantum,
                'no_in' => $noIn,
            ]);
        }

        return $transaksi;
    }

    private function masukkanMo(TransaksiPengolahan $pengolahan, string $noMo, string $reviewStatus): void
    {
        $mo = PengolahanMo::create([
            'no_mo' => $noMo,
            'makloon_user_id' => $pengolahan->makloon_user_id,
            'total_kuantum_hgl' => 0,
            'total_kuantum_gabah_diolah' => 0,
            'status' => 'proses',
            'review_status' => $reviewStatus,
        ]);

        PengolahanMoDetail::create([
            'pengolahan_mo_id' => $mo->id,
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'kuantum_hgl_kontribusi' => 0,
            'kuantum_gabah_diolah_kontribusi' => 0,
        ]);
    }

    private function buatPengolahan(Gudang $gudang, User $makloon, string $skema, string $status): TransaksiPengolahan
    {
        return TransaksiPengolahan::create([
            'id_pengolahan' => sprintf('%05d/%s/%s', TransaksiPengolahan::count() + 1, now()->format('m/Y'), $skema),
            'skema' => $skema,
            'gudang_id' => $gudang->id,
            'makloon_user_id' => $makloon->id,
            'current_stage' => 'operasi',
            'status_keseluruhan' => $status,
            'created_by' => $makloon->id,
        ]);
    }

    private function buatGudang(TransaksiPengolahan $pengolahan, float $kuantumHgl, string $status): void
    {
        PengolahanGudang::create([
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'gudang_id' => $pengolahan->gudang_id,
            'tanggal_masuk_gudang' => now()->toDateString(),
            'kuantum_hgl' => $kuantumHgl,
            'status' => $status,
        ]);
    }

    private function buatLhpk(TransaksiPengolahan $pengolahan, string $noLhpk, float $gabah, float $hgl, string $status, float $katul = 0): void
    {
        PengolahanLhpk::create([
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'gudang_tujuan_id' => $pengolahan->gudang_id,
            'no_lhpk' => $noLhpk,
            'tanggal_lhpk' => now()->toDateString(),
            'kuantum_gabah_diolah' => $gabah,
            'kuantum_beras_hgl' => $hgl,
            'katul' => $katul,
            'status' => $status,
        ]);
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }
}
