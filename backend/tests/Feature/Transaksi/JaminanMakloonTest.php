<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
use App\Models\DataPengadaan;
use App\Models\PoDetail;
use App\Models\JaminanMakloon;
use App\Models\PengolahanGudang;
use App\Models\PengolahanLhpk;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Jaminan makloon adalah gerbang masuk setiap transaksi: tanpa jaminan yang diatur Operasi,
 * makloon tidak boleh MENGIRIM.
 *
 * Aturannya MURNI KG, tanpa dimensi waktu sama sekali -- tidak ada kuota harian, tidak ada
 * masa berlaku, tidak ada batas hari. Plafonnya BERPUTAR seperti pinjaman:
 *
 *     sisa dapat dikirim = kapasitas total - hutang
 *     hutang             = gabah masuk - gabah dibayar
 *     masuk              = bongkar diterima yang PO-nya sudah terbit ber-No IN
 *     dibayar            = estimasi gabah, dari HGL yang ditimbang masuk gudang
 *
 * Hutang itu nilainya SAMA PERSIS dengan kolom "Stok Pengurang Penerimaan Gudang" di neraca
 * gabah admin, dan itu disengaja -- satu angka, dua layar.
 *
 * Yang diuji di berkas ini: letak gerbangnya (submit, bukan draft; MPP di Makloon Terima, TJP
 * di Makloon), bahwa hutang BERTAMBAH saat No IN terbit, dan BERKURANG begitu hasil olahnya
 * diterima gudang -- dua sifat yang dulu justru terbalik.
 */
class JaminanMakloonTest extends TestCase
{
    use RefreshDatabase;

    /** Rendemen acuan yang DULU dipakai mengonversi HGL balik ke gabah. Lihat test drift. */
    private const RENDEMEN_ACUAN = 0.51;

    private const FOTO_KIRIM = [
        'foto_petani',
        'foto_gabah',
        'foto_serah_terima',
        'foto_pembayaran',
        'foto_surat_pernyataan',
    ];

    private User $makloon;

    /** Record Makloon Terima dari gabahMasuk() terakhir, untuk test yang mengubah statusnya. */
    private ?DataMakloonTerima $terima = null;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');
        $this->seed(RoleSeeder::class);

        $this->makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. UJI JAMINAN',
        ]);
    }

    /**
     * Guard harus berada SESUDAH percabangan draft/submit. Kalau tidak, makloon yang jaminannya
     * belum diisi Operasi tidak bisa menyimpan draft sama sekali.
     */
    public function test_draft_tetap_bisa_disimpan_walau_jaminan_belum_diatur(): void
    {
        $transaksi = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))
            ->assertOk();
    }

    /**
     * MPP: gerbang kapasitas menunggu Makloon Terima, karena kuantum kirim masih angka rencana
     * dan yang dipakai gerbang adalah hasil timbang. Jadi tahap Kirim lolos walau jaminannya
     * belum ada sama sekali.
     */
    public function test_mpp_makloon_kirim_lolos_walau_jaminan_belum_diatur(): void
    {
        $transaksi = $this->buatTransaksi();

        // Draft WAJIB lebih dulu: foto menempel pada record tahap, dan sebelum recordnya lahir
        // FotoUploadService menolak dengan "Tidak ada data makloon untuk transaksi ini."
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))
            ->assertOk();
        $this->lengkapiFotoKirim($transaksi);

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))
            ->assertOk();

        $this->assertSame('makloon_terima', $transaksi->fresh()->current_stage);
    }

    public function test_mpp_makloon_terima_ditolak_kalau_jaminan_belum_diatur(): void
    {
        $transaksi = $this->mppSampaiMakloonTerima();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('submit'))
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Jaminan makloon belum diatur'));
    }

    /**
     * Inti aturan barunya, arah pertama: gabah yang MASUK membebani plafon. Kapasitas 1.000 kg
     * sudah terpakai penuh oleh gabah yang menumpuk di makloon, jadi kiriman sekecil apa pun
     * harus ditolak.
     *
     * Gerbang jaminan sengaja dijalankan SEBELUM pemeriksaan dokumen, supaya penolakan yang
     * muncul adalah soal kapasitas -- bukan "Dokumen belum lengkap" yang menyesatkan.
     */
    public function test_ditolak_kalau_gabah_di_tangan_sudah_memenuhi_kapasitas(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $this->gabahMasuk(1_000);
        $transaksi = $this->mppSampaiMakloonTerima();

        $this->patchJson(
            "/api/transaksi/{$transaksi->id_transaksi}/makloon-terima",
            [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 1],
        )
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Stok Pengurang Penerimaan Gudang makloon 1.000 kg')
                && str_contains($pesan, 'kapasitas total jaminan 1.000 kg')
                && str_contains($pesan, 'tinggal 0 kg'));
    }

    /**
     * Inti aturan barunya, arah kedua -- dan inilah yang dulu terbalik: plafon PULIH setelah
     * hasil olahnya masuk gudang. Makloon yang bekerja normal tidak pernah kehabisan jatah.
     */
    public function test_plafon_pulih_setelah_hasil_olahnya_masuk_gudang(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $this->gabahMasuk(1_000);

        Sanctum::actingAs($this->makloon);
        $sisa = fn () => $this->getJson('/api/jaminan-saya')->assertOk()->json('data.sisa_dapat_diinput_kg');

        // Mentok: seluruh kapasitas sedang dipegang makloon.
        $this->assertEquals(0, $sisa());

        // 1.000 kg gabah selesai digiling dan hasilnya diterima gudang: plafon terbuka lagi.
        $this->olahanKembali(1_000);
        $this->assertEquals(1_000, $sisa());

        // Dan kiriman berikutnya memang lolos gerbang lagi.
        $transaksi = $this->mppSampaiMakloonTerima();
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('draft'))->assertOk();
        $this->lengkapiFotoTerima($transaksi);
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('submit'))->assertOk();
    }

    /** Batasnya diperiksa terhadap kuantum yang SEDANG dikirim, bukan hanya terhadap sisa. */
    public function test_ditolak_kalau_kiriman_ini_yang_melewatkan_batas(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_500);
        $this->gabahMasuk(1_000);
        $transaksi = $this->mppSampaiMakloonTerima();

        // Sisa 500 kg. 500 kg pas masih boleh (dijaga test berikutnya), 501 kg tidak.
        $this->patchJson(
            "/api/transaksi/{$transaksi->id_transaksi}/makloon-terima",
            [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 501],
        )
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Kiriman 501 kg ditolak')
                && str_contains($pesan, 'tinggal 500 kg'));
    }

    /** Batas atas persis: sisa 500 kg, kiriman 500 kg -- masih di dalam, bukan lewat. */
    public function test_lolos_kalau_kiriman_pas_menghabiskan_sisa(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_500);
        $this->gabahMasuk(1_000);
        $transaksi = $this->mppSampaiMakloonTerima();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('draft'))->assertOk();
        $this->lengkapiFotoTerima($transaksi);

        $this->patchJson(
            "/api/transaksi/{$transaksi->id_transaksi}/makloon-terima",
            [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 500],
        )->assertOk();

        $this->assertSame('ub_jastasma', $transaksi->fresh()->current_stage);
    }

    public function test_lolos_kalau_masih_jauh_di_dalam_kapasitas(): void
    {
        $this->buatJaminan(kapasitasTotal: 5_000);
        $transaksi = $this->mppSampaiMakloonTerima();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('draft'))->assertOk();
        $this->lengkapiFotoTerima($transaksi);

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('submit'))->assertOk();

        $this->assertSame('ub_jastasma', $transaksi->fresh()->current_stage);
    }

    /**
     * Bongkar baru membebani plafon SETELAH No IN terbit -- yaitu setelah rantai SerGab selesai
     * dan gabahnya boleh masuk alur Pengolahan.
     *
     * Keputusan yang disengaja: sebelum No IN, makloon belum boleh menggiling gabah itu, jadi
     * ia tidak punya cara apa pun menurunkan angkanya. Membebaninya lebih awal berarti menagih
     * makloon atas PO yang lambat terbit -- urusan Pengadaan, bukan dia.
     */
    public function test_bongkar_belum_membebani_plafon_sebelum_no_in_terbit(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $transaksi = $this->gabahMasuk(400, terbitkanNoIn: false);

        Sanctum::actingAs($this->makloon);
        $data = fn () => $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        $this->assertEquals(0, $data()['gabah_masuk_kg']);
        $this->assertEquals(1_000, $data()['sisa_dapat_diinput_kg']);

        $this->terbitkanNoIn($transaksi, 400);

        $this->assertEquals(400, $data()['gabah_masuk_kg']);
        $this->assertEquals(600, $data()['sisa_dapat_diinput_kg']);
    }

/** Rumus intinya, dijaga apa adanya: masuk 2.000, kembali 1.000, di tangan 1.000. */
    public function test_gabah_di_tangan_adalah_masuk_dikurangi_kembali(): void
    {
        $this->buatJaminan(kapasitasTotal: 5_000);
        $this->gabahMasuk(2_000);
        $this->olahanKembali(1_000);

        Sanctum::actingAs($this->makloon);
        $jaminan = $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        $this->assertEquals(2_000, $jaminan['gabah_masuk_kg']);
        $this->assertEquals(1_000, $jaminan['gabah_kembali_kg']);
        $this->assertEquals(1_000, $jaminan['gabah_ditangan_kg']);
    }

    /**
     * Hutang gerbang HARUS sama persis dengan kolom "Stok Pengurang Penerimaan Gudang" di neraca
     * gabah admin. Keduanya Gabah Sudah IN dikurangi Estimasi Gabah; kalau salah satu digeser,
     * Operasi melihat dua angka berbeda untuk hal yang sama dan tidak ada yang tahu mana benar.
     */
    public function test_hutang_sama_dengan_stok_pengurang_penerimaan_gudang_di_neraca(): void
    {
        $this->buatJaminan(kapasitasTotal: 5_000);
        $this->gabahMasuk(2_000);
        $this->olahanKembali(1_000);

        $admin = User::factory()->create(['role_id' => Role::where('nama_role', 'admin')->value('id')]);
        Sanctum::actingAs($admin);
        $neraca = collect($this->getJson('/api/monitoring/rekap-makloon')->assertOk()->json('data'))
            ->firstWhere('makloon_user_id', $this->makloon->id);

        Sanctum::actingAs($this->makloon);
        $jaminan = $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        $this->assertEquals(1_000, $neraca['stok_pengurang_gudang']);
        $this->assertEquals($neraca['stok_pengurang_gudang'], $jaminan['gabah_ditangan_kg']);
        $this->assertEquals($neraca['gabah_sudah_in'], $jaminan['gabah_masuk_kg']);
        $this->assertEquals($neraca['estimasi_gabah'], $jaminan['gabah_kembali_kg']);
    }

    /**
     * Konsekuensi yang DISENGAJA dari memakai angka neraca: pembayaran ditaksir dari HGL fisik
     * dibagi rendemen acuan 0,51, sedangkan rendemen tiap makloon berbeda. Yang di atas acuan
     * tercatat membayar lebih banyak daripada hutangnya, yang di bawah acuan menyisakan residu.
     *
     * Dikunci di sini supaya perubahannya kelak disadari, bukan ditemukan sebagai kejutan.
     */
    public function test_rendemen_di_atas_acuan_membayar_lebih_dan_ditahan_di_nol(): void
    {
        $this->buatJaminan(kapasitasTotal: 5_000);
        $this->gabahMasuk(1_000);
        $this->olahanKembali(1_000, rendemen: 0.55);

        Sanctum::actingAs($this->makloon);
        $data = $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        // 1.000 kg gabah -> 550 kg HGL -> ditaksir 1.078 kg gabah: 78 kg lebih besar dari hutangnya.
        $this->assertEquals(1_078, $data['gabah_kembali_kg']);
        $this->assertEquals(0, $data['gabah_ditangan_kg']);
        $this->assertEquals(5_000, $data['sisa_dapat_diinput_kg']);
    }

    /** Arah sebaliknya: rendemen di bawah acuan menyisakan residu hutang walau gabahnya habis. */
    public function test_rendemen_di_bawah_acuan_menyisakan_residu_hutang(): void
    {
        $this->buatJaminan(kapasitasTotal: 5_000);
        $this->gabahMasuk(1_000);
        $this->olahanKembali(1_000, rendemen: 0.48);

        Sanctum::actingAs($this->makloon);
        $data = $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        // 480 kg HGL -> ditaksir 941 kg: 59 kg hutang tersisa walau gabahnya sudah habis diolah.
        $this->assertEquals(941, $data['gabah_kembali_kg']);
        $this->assertEquals(59, $data['gabah_ditangan_kg']);
    }

    /** Bongkar yang belum diterima belum final, jadi belum layak membebani plafon. */
    public function test_hanya_bongkar_yang_sudah_diterima_yang_membebani_plafon(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $this->gabahMasuk(400, status: 'menunggu_review');
        $bongkar = $this->terima;

        Sanctum::actingAs($this->makloon);
        $sisa = fn () => $this->getJson('/api/jaminan-saya')->assertOk()->json('data.sisa_dapat_diinput_kg');

        $this->assertEquals(1_000, $sisa());

        $bongkar->update(['status' => 'diterima']);
        $this->assertEquals(600, $sisa());
    }

    /**
     * Hanya data Gudang berstatus `diterima` yang memulihkan plafon. Yang masih draft atau baru
     * dikirim belum diperiksa siapa pun, jadi barangnya belum tentu benar-benar sampai --
     * LHPK-nya boleh saja sudah diterima.
     */
    public function test_hanya_data_gudang_yang_sudah_diterima_yang_memulihkan_plafon(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $this->gabahMasuk(1_000);
        $gudang = $this->olahanKembali(1_000, status: 'draft');

        Sanctum::actingAs($this->makloon);
        $sisa = fn () => $this->getJson('/api/jaminan-saya')->assertOk()->json('data.sisa_dapat_diinput_kg');

        $this->assertEquals(0, $sisa());

        $gudang->update(['status' => 'menunggu_review']);
        $this->assertEquals(0, $sisa());

        $gudang->update(['status' => 'diterima']);
        $this->assertEquals(1_000, $sisa());
    }

    /**
     * TJP: gerbangnya di tahap Makloon, dan makloon yang dibebani diambil dari
     * data_jemput_pangan.makloon_user_id -- bukan pembuat transaksinya (petugas Jemput Pangan).
     */
    public function test_tjp_dijaga_di_tahap_makloon_memakai_makloon_dari_jemput_pangan(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $this->gabahMasuk(1_000);

        $transaksi = $this->tjpSampaiTahapMakloon();

        Sanctum::actingAs($this->makloon);
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", [
            'aksi' => 'submit',
            'tanggal_bongkar' => '2026-08-11',
            'kuantum_bongkar' => 1,
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Stok Pengurang Penerimaan Gudang makloon 1.000 kg'));
    }

    public function test_operasi_menyimpan_jaminan_dan_menimpa_yang_lama(): void
    {
        $operasi = User::factory()->create(['role_id' => Role::where('nama_role', 'operasi')->value('id')]);
        Sanctum::actingAs($operasi);

        $payload = [
            'makloon_user_id' => $this->makloon->id,
            'bentuk_jaminan' => 'Bank Garansi BNI No. 0012/BG/2026',
            'jaminan_rp' => 100_000_000,
            'kapasitas_total_kg' => 1_000,
        ];

        $this->postJson('/api/operasi/jaminan-makloon', $payload)
            ->assertOk()
            ->assertJsonPath('data.jaminan.kapasitas_total_kg', 1_000)
            ->assertJsonPath('data.jaminan.bentuk_jaminan', 'Bank Garansi BNI No. 0012/BG/2026');

        $this->postJson('/api/operasi/jaminan-makloon', [...$payload, 'kapasitas_total_kg' => 2_000])
            ->assertOk()
            ->assertJsonPath('data.jaminan.kapasitas_total_kg', 2_000);

        // Satu baris per makloon -- simpan kedua menimpa, bukan menambah.
        $this->assertSame(1, JaminanMakloon::where('makloon_user_id', $this->makloon->id)->count());
    }

    /**
     * Respons simpan memuat ulang User lewat relasi, sehingga kolom hasil leftJoinSub tidak
     * ikut terbawa. Tanpa fallback, baris yang baru disimpan selalu melaporkan estimasi 0 dan
     * sisa kapasitas penuh -- Operasi melihat makloon yang sudah mentok tampak masih longgar.
     */
    public function test_respons_simpan_memuat_angka_pantauan_yang_sebenarnya(): void
    {
        $this->gabahMasuk(1_000);

        $operasi = User::factory()->create(['role_id' => Role::where('nama_role', 'operasi')->value('id')]);
        Sanctum::actingAs($operasi);

        $this->postJson('/api/operasi/jaminan-makloon', [
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 100_000_000,
            'kapasitas_total_kg' => 1_500,
        ])
            ->assertOk()
            ->assertJsonPath('data.pantauan.gabah_masuk', 1_000)
            ->assertJsonPath('data.pantauan.gabah_ditangan', 1_000)
            ->assertJsonPath('data.pantauan.sisa_dapat_diinput_kg', 500)
            ->assertJsonPath('data.pantauan.melewati_batas', false);
    }

    /**
     * Panel read-only di form Makloon. Endpoint ini TIDAK menerima makloon_user_id -- kalau
     * bisa ditembak per id, ia jadi jalan keluar baru dari isolasi makloon.
     */
    public function test_jaminan_saya_hanya_mengembalikan_milik_pemanggil(): void
    {
        $this->buatJaminan(kapasitasTotal: 3_000);
        $this->gabahMasuk(2_000);
        $this->olahanKembali(1_000);

        Sanctum::actingAs($this->makloon);
        $data = $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        // assertEquals, bukan assertSame: JSON mengembalikan 3000 (int) untuk float bulat.
        $this->assertEquals(3_000, $data['kapasitas_total_kg']);
        $this->assertEquals(2_000, $data['gabah_masuk_kg']);
        $this->assertEquals(1_000, $data['gabah_kembali_kg']);
        $this->assertEquals(1_000, $data['gabah_ditangan_kg']);
        $this->assertEquals(2_000, $data['sisa_dapat_diinput_kg']);

        // Makloon lain: jaminannya sendiri belum diatur, jadi null -- bukan jaminan makloon ini.
        $lain = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. MAKLOON LAIN',
        ]);
        Sanctum::actingAs($lain);
        $this->getJson('/api/jaminan-saya')->assertOk()->assertJsonPath('data', null);
    }

    /** Sisa tidak boleh minus di layar: yang sudah lewat batas ditampilkan sebagai 0. */
    public function test_sisa_tidak_pernah_minus(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $this->gabahMasuk(3_000);

        Sanctum::actingAs($this->makloon);
        $data = $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        $this->assertEquals(3_000, $data['gabah_ditangan_kg']);
        $this->assertEquals(0, $data['sisa_dapat_diinput_kg']);
    }

    /**
     * Dan gabah di tangan pun tidak boleh minus. Kalau olahan tercatat melebihi bongkarnya --
     * data anomali -- membiarkannya minus akan memberi makloon kapasitas LEBIH BESAR daripada
     * jaminan yang benar-benar dipegang Operasi.
     */
    public function test_gabah_di_tangan_tidak_pernah_minus(): void
    {
        $this->buatJaminan(kapasitasTotal: 1_000);
        $this->gabahMasuk(500);
        $this->olahanKembali(2_000);

        Sanctum::actingAs($this->makloon);
        $data = $this->getJson('/api/jaminan-saya')->assertOk()->json('data');

        $this->assertEquals(0, $data['gabah_ditangan_kg']);
        $this->assertEquals(1_000, $data['sisa_dapat_diinput_kg']);
    }

    public function test_makloon_tidak_boleh_mengatur_jaminannya_sendiri(): void
    {
        Sanctum::actingAs($this->makloon);

        $this->postJson('/api/operasi/jaminan-makloon', [
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 1,
            'kapasitas_total_kg' => 1,
        ])->assertForbidden();
    }

    /**
     * Gerbangnya mengunci baris jaminan (SELECT ... FOR UPDATE) supaya dua kiriman yang tiba
     * bersamaan tidak sama-sama membaca sisa yang belum berkurang. Kunci itu hanya bertahan
     * selama transaksinya terbuka, jadi ia baru berguna kalau gerbang dan penyimpanan berada
     * dalam SATU transaksi.
     *
     * Yang diperiksa: saat gerbang membaca baris jaminan, kedalaman transaksinya sudah lebih
     * dalam daripada sebelum request -- artinya ada pembungkus yang membuat kuncinya bertahan
     * sampai kiriman tersimpan. Tidak bisa diuji dengan memanggil gerbangnya langsung:
     * RefreshDatabase menjalankan tiap test di dalam transaksi, sehingga di sana SEMUA kode
     * tampak seperti sudah dibungkus.
     *
     * Race-nya sendiri tidak diuji di sini -- itu butuh dua koneksi yang benar-benar paralel.
     */
    public function test_gerbang_membaca_jaminan_di_dalam_transaksi_pembungkus(): void
    {
        $this->buatJaminan(kapasitasTotal: 5_000);
        $transaksi = $this->mppSampaiMakloonTerima();
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('draft'))->assertOk();
        $this->lengkapiFotoTerima($transaksi);

        $kedalamanDasar = DB::transactionLevel();
        $kedalamanSaatGerbang = null;
        DB::listen(function ($query) use (&$kedalamanSaatGerbang) {
            if ($kedalamanSaatGerbang === null && str_contains($query->sql, 'jaminan_makloon')) {
                $kedalamanSaatGerbang = DB::transactionLevel();
            }
        });

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('submit'))->assertOk();

        $this->assertNotNull($kedalamanSaatGerbang, 'Gerbang jaminan tidak pernah membaca barisnya saat submit.');
        $this->assertGreaterThan(
            $kedalamanDasar,
            $kedalamanSaatGerbang,
            'Gerbang jaminan berjalan tanpa transaksi pembungkus, jadi penguncian barisnya tidak menahan apa pun.',
        );
    }

    private function buatJaminan(float $kapasitasTotal): void
    {
        JaminanMakloon::create([
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 100_000_000,
            'kapasitas_per_hari_kg' => $kapasitasTotal,
        ]);
    }

    /**
     * Bongkar yang sudah diterima di makloon ini -- satu-satunya hal yang menaikkan gabah di
     * tangan. SENGAJA tanpa po_detail/No IN: plafon dibebani sejak bongkar, bukan sejak
     * administrasi PO selesai.
     *
     * Transaksinya berdiri di tahap setelah Makloon Terima supaya tidak bertabrakan dengan
     * transaksi yang sedang diuji gerbangnya.
     */
    private function gabahMasuk(float $kuantum, string $status = 'diterima', bool $terbitkanNoIn = true): Transaksi
    {
        $transaksi = Transaksi::create([
            'id_transaksi' => sprintf('%05d/08/2026/MPP', Transaksi::count() + 900),
            'skema' => 'MPP',
            'current_stage' => 'ub_jastasma',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->makloon->id,
        ]);

        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'id_pemasok' => 'PEMASOK-STOK',
            'tanggal_bongkar' => '2026-08-01',
            'kuantum' => $kuantum,
            'status' => 'diterima',
        ]);

        $this->terima = DataMakloonTerima::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_bongkar' => $kuantum,
            'status' => $status,
        ]);

        if ($terbitkanNoIn) {
            $this->terbitkanNoIn($transaksi, $kuantum);
        }

        return $transaksi;
    }

    /** PO ber-No IN untuk satu transaksi -- penanda rantai SerGab-nya sudah selesai. */
    private function terbitkanNoIn(Transaksi $transaksi, float $kuantum): void
    {
        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-08-01',
            'id_pemasok' => 'PEMASOK-STOK',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => $kuantum,
            'harga' => 6500,
            'total_harga' => $kuantum * 6500,
            'no_po' => 'PO-'.$transaksi->id_transaksi,
            'status' => 'proses',
        ]);

        PoDetail::create([
            'data_pengadaan_id' => $po->id,
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_kontribusi' => $kuantum,
            'no_in' => 'IN-'.$po->id,
        ]);
    }

    /**
     * Satu rantai Pengolahan milik makloon ini yang sudah tuntas sampai gudang -- satu-satunya
     * hal yang MEMULIHKAN plafon.
     *
     * Kolom penghubungnya transaksi_pengolahan.makloon_user_id, bukan id transaksi: rantai
     * Pengolahan tidak terikat ke satu transaksi SerGab tertentu.
     */
    private function olahanKembali(float $gabahDiolah, float $rendemen = self::RENDEMEN_ACUAN, string $status = 'diterima'): PengolahanGudang
    {
        $urutan = TransaksiPengolahan::count() + 1;
        $pengolahan = TransaksiPengolahan::create([
            'id_pengolahan' => sprintf('%05d/08/2026/GDG', $urutan),
            'skema' => 'GDG',
            'makloon_user_id' => $this->makloon->id,
            'current_stage' => 'gudang',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->makloon->id,
        ]);

        // LHPK memegang kuantum GABAH yang digiling -- angka inilah yang mengurangi plafon.
        PengolahanLhpk::create([
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'kuantum_gabah_diolah' => $gabahDiolah,
            'kuantum_beras_hgl' => $gabahDiolah * $rendemen,
            'status' => 'diterima',
        ]);

        // Data Gudang membuktikan barangnya sudah pindah. Berat HGL fisiknya ikut rendemen asli
        // makloon, dan sengaja TIDAK dipakai menghitung plafon lagi.
        return PengolahanGudang::create([
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'tanggal_masuk_gudang' => '2026-08-01',
            'kuantum_hgl' => $gabahDiolah * $rendemen,
            'status' => $status,
        ]);
    }

    private function buatTransaksi(): Transaksi
    {
        Sanctum::actingAs($this->makloon);

        return Transaksi::findOrFail(
            $this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi')
        );
    }

    /**
     * Bawa satu transaksi MPP sampai tahap Makloon Terima BENAR-BENAR siap diisi.
     *
     * Mengirim Makloon Kirim saja tidak cukup: `current_stage` memang sudah pindah ke
     * `makloon_terima`, tapi data Kirim-nya masih menunggu diperiksa. Selama belum diterima,
     * submitStage() menolak dengan "Data tahap sebelumnya belum diterima." -- persis seperti
     * di aplikasi, form Makloon Terima baru muncul setelah data Kirim diterima. Di skema MPP
     * yang menerima adalah makloon itu sendiri.
     */
    private function mppSampaiMakloonTerima(): Transaksi
    {
        $transaksi = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))->assertOk();
        $this->lengkapiFotoKirim($transaksi);
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))->assertOk();

        $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/terima")->assertOk();

        return $transaksi->fresh();
    }

    /**
     * Transaksi TJP yang tahap Jemput Pangan-nya sudah diterima, sehingga siap diisi Makloon.
     *
     * Datanya ditulis langsung ke tabel: yang diuji adalah gerbang jaminan di tahap Makloon,
     * dan menempuh seluruh alur Jemput Pangan beserta lima unggahan fotonya cuma menambah
     * fixture tanpa menambah apa pun yang diuji.
     */
    private function tjpSampaiTahapMakloon(): Transaksi
    {
        $petugas = User::factory()->create(['role_id' => Role::where('nama_role', 'jemput_pangan')->value('id')]);
        Sanctum::actingAs($petugas);

        $transaksi = Transaksi::findOrFail(
            $this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi')
        );

        DataJemputPangan::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'id_pemasok' => 'PEMASOK-TJP',
            'supir' => 'Supir',
            'plat_mobil' => 'B 2 UJI',
            'nama_poktan_gapoktan' => 'Poktan Uji',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-08-10',
            'kuantum' => 1_000,
            'jarak_ke_makloon_km' => 5,
            'status' => 'diterima',
        ]);
        $transaksi->update(['current_stage' => 'makloon']);

        return $transaksi->fresh();
    }

    private function lengkapiFotoKirim(Transaksi $transaksi): void
    {
        foreach (self::FOTO_KIRIM as $jenis) {
            $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
                'jenis_foto' => $jenis,
                'foto' => File::image("{$jenis}.jpg"),
            ])->assertCreated();
        }
    }

    private function lengkapiFotoTerima(Transaksi $transaksi): void
    {
        foreach (['foto_surat_jalan', 'foto_nota_timbang'] as $jenis) {
            $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
                'jenis_foto' => $jenis,
                'foto' => File::image("{$jenis}.jpg"),
            ])->assertCreated();
        }
    }

    private function dataMpp(string $aksi): array
    {
        return [
            'aksi' => $aksi,
            'id_pemasok' => 'PEMASOK-JAMINAN',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 UJI',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-08-11',
            'kuantum' => 1000,
            'jarak_ke_makloon_km' => 5,
        ];
    }

    private function dataMakloonTerima(string $aksi): array
    {
        return [
            'aksi' => $aksi,
            'kuantum_bongkar' => 1000,
        ];
    }
}
