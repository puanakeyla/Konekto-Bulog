<?php

use App\Support\ShardedPathGenerator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Memindahkan berkas media yang sudah terlanjur tersimpan pada layout lama (`{id}/...`)
 * ke layout ter-shard (`000/001/1234/...`). Jalan sekali saat deploy; kalau sudah kosong
 * atau sudah dipindah, tiap iterasi tinggal dilewati.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->pindahkan(fn (int $id) => [(string) $id, ShardedPathGenerator::basePathFor($id)]);
    }

    public function down(): void
    {
        $this->pindahkan(fn (int $id) => [ShardedPathGenerator::basePathFor($id), (string) $id]);
    }

    private function pindahkan(callable $arah): void
    {
        $prefix = config('media-library.prefix', '');

        DB::table('media')->select('id', 'disk')->orderBy('id')->chunk(500, function ($rows) use ($arah, $prefix) {
            foreach ($rows as $row) {
                [$dari, $ke] = $arah((int) $row->id);

                if ($prefix !== '') {
                    $dari = "{$prefix}/{$dari}";
                    $ke = "{$prefix}/{$ke}";
                }

                if ($dari === $ke) {
                    continue;
                }

                $disk = Storage::disk($row->disk);

                // allFiles() rekursif, jadi subfolder `conversions/` dan `responsive-images/`
                // ikut terbawa. Direktori yang tidak ada mengembalikan [] -- aman dilewati.
                foreach ($disk->allFiles($dari) as $file) {
                    $disk->move($file, $ke.substr($file, strlen($dari)));
                }

                $disk->deleteDirectory($dari);
            }
        });
    }
};
