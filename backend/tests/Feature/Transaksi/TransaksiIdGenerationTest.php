<?php

namespace Tests\Feature\Transaksi;

use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TransaksiIdGenerationTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $service;

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->service = app(TransaksiStageService::class);
        $this->makloon = User::create([
            'username' => 'makloon_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
        ]);
    }

    public function test_nomor_urut_berurutan_dan_unik_untuk_banyak_create(): void
    {
        $ids = collect(range(1, 5))->map(fn () => $this->service->createTransaksi($this->makloon)->id_transaksi);

        $this->assertSame($ids->unique()->count(), $ids->count(), 'Ada id_transaksi duplikat.');
        $this->assertSame(
            $ids->values()->all(),
            [
                sprintf('00001/%02d/%04d/MPP', now()->month, now()->year),
                sprintf('00002/%02d/%04d/MPP', now()->month, now()->year),
                sprintf('00003/%02d/%04d/MPP', now()->month, now()->year),
                sprintf('00004/%02d/%04d/MPP', now()->month, now()->year),
                sprintf('00005/%02d/%04d/MPP', now()->month, now()->year),
            ]
        );
    }

    public function test_dua_create_di_transaction_terpisah_menghasilkan_id_berbeda(): void
    {
        // Mensimulasikan dua permintaan berurutan, masing-masing dalam DB transaction sendiri
        // (createTransaksi sudah membungkus dirinya dalam DB::transaction). Dengan counter
        // ber-lock, keduanya tidak mungkin membaca nomor urut yang sama.
        $a = DB::transaction(fn () => $this->service->createTransaksi($this->makloon));
        $b = DB::transaction(fn () => $this->service->createTransaksi($this->makloon));

        $this->assertNotSame($a->id_transaksi, $b->id_transaksi);
        $this->assertSame(2, Transaksi::whereIn('id_transaksi', [$a->id_transaksi, $b->id_transaksi])->count());
    }

    public function test_nomor_urut_tidak_dipakai_ulang_setelah_transaksi_dihapus(): void
    {
        // Ini bukti deterministik pengganti uji konkurensi: pola lama count()+1 akan
        // memproduksi ulang nomor yang sudah ada begitu jumlah baris hidup mengecil,
        // yang secara efektif sama dengan tabrakan pada race dua create bersamaan.
        $a = $this->service->createTransaksi($this->makloon); // 00001
        $b = $this->service->createTransaksi($this->makloon); // 00002

        // Hapus salah satu -> jumlah baris hidup turun jadi 1.
        Transaksi::where('id_transaksi', $a->id_transaksi)->delete();

        $c = $this->service->createTransaksi($this->makloon);

        // Counter tetap maju: 00003, bukan 00002 (yang akan bentrok dengan $b).
        $this->assertSame(sprintf('00003/%02d/%04d/MPP', now()->month, now()->year), $c->id_transaksi);
        $this->assertNotSame($b->id_transaksi, $c->id_transaksi);
    }

    public function test_melanjutkan_dari_transaksi_lama_tanpa_counter(): void
    {
        // Simulasi transisi/deploy: sudah ada transaksi (dibuat pola lama) untuk bulan ini
        // tapi belum ada baris counter-nya. Create berikutnya harus melanjutkan dari nomor
        // tertinggi yang ada (00003 -> 00004), bukan mengulang 00001 yang akan bentrok PK.
        $this->travelTo(now()->setDate(2026, 7, 20));

        Transaksi::create([
            'id_transaksi' => '00003/07/2026/MPP',
            'skema' => 'MPP',
            'current_stage' => 'makloon',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->makloon->id,
        ]);

        $baru = $this->service->createTransaksi($this->makloon);

        $this->assertSame('00004/07/2026/MPP', $baru->id_transaksi);

        $this->travel(false);
    }

    public function test_nomor_urut_reset_tiap_bulan(): void
    {
        $this->travelTo(now()->setDate(2026, 7, 15));
        $juli = $this->service->createTransaksi($this->makloon);
        $this->assertSame('00001/07/2026/MPP', $juli->id_transaksi);

        $this->travelTo(now()->setDate(2026, 8, 1));
        $agustus = $this->service->createTransaksi($this->makloon);
        $this->assertSame('00001/08/2026/MPP', $agustus->id_transaksi);

        $this->travel(false);
    }
}
