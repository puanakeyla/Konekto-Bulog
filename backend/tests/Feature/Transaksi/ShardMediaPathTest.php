<?php

namespace Tests\Feature\Transaksi;

use App\Support\ShardedPathGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Migrasi pemindah berkas ke layout ter-shard hanya jalan sekali di mesin sungguhan, jadi
 * salah sedikit = foto hilang tanpa ada yang tahu sampai ada yang membukanya. Ini penjaganya.
 */
class ShardMediaPathTest extends TestCase
{
    use RefreshDatabase;

    private function migrasi(): object
    {
        return require database_path('migrations/2026_07_31_120000_shard_media_paths.php');
    }

    private function catatMedia(int $id): void
    {
        DB::table('media')->insert([
            'id' => $id,
            'model_type' => 'App\Models\DataJemputPangan',
            'model_id' => 1,
            'collection_name' => 'foto_petani',
            'name' => 'petani',
            'file_name' => 'petani.jpg',
            'disk' => 'foto-transaksi',
            'size' => 100,
            'manipulations' => '[]',
            'custom_properties' => '[]',
            'generated_conversions' => '[]',
            'responsive_images' => '[]',
        ]);
    }

    public function test_memindahkan_berkas_lama_beserta_konversinya_ke_path_ter_shard(): void
    {
        Storage::fake('foto-transaksi');
        $disk = Storage::disk('foto-transaksi');

        $disk->put('7/petani.jpg', 'asli');
        $disk->put('7/conversions/petani-thumb.jpg', 'thumb');
        $this->catatMedia(7);

        $this->migrasi()->up();

        $base = ShardedPathGenerator::basePathFor(7);
        $this->assertSame('000/000/7', $base);
        $disk->assertExists("{$base}/petani.jpg");
        $disk->assertExists("{$base}/conversions/petani-thumb.jpg");
        $this->assertSame('asli', $disk->get("{$base}/petani.jpg"));
        $disk->assertMissing('7/petani.jpg');
    }

    public function test_dijalankan_dua_kali_tidak_merusak_apa_apa(): void
    {
        Storage::fake('foto-transaksi');
        $disk = Storage::disk('foto-transaksi');

        $disk->put('7/petani.jpg', 'asli');
        $this->catatMedia(7);

        $this->migrasi()->up();
        $this->migrasi()->up();

        $disk->assertExists(ShardedPathGenerator::basePathFor(7).'/petani.jpg');
    }

    public function test_down_mengembalikan_ke_layout_datar(): void
    {
        Storage::fake('foto-transaksi');
        $disk = Storage::disk('foto-transaksi');

        $disk->put(ShardedPathGenerator::basePathFor(7).'/petani.jpg', 'asli');
        $this->catatMedia(7);

        $this->migrasi()->down();

        $disk->assertExists('7/petani.jpg');
        $disk->assertMissing(ShardedPathGenerator::basePathFor(7).'/petani.jpg');
    }

    public function test_shard_tetap_rata_pada_id_besar(): void
    {
        $this->assertSame('000/300/300000', ShardedPathGenerator::basePathFor(300000));
        $this->assertSame('000/001/1234', ShardedPathGenerator::basePathFor(1234));
        $this->assertSame('012/345/12345678', ShardedPathGenerator::basePathFor(12345678));
    }
}
