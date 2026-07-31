<?php

namespace App\Support;

use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\MediaLibrary\Support\PathGenerator\DefaultPathGenerator;

/**
 * DefaultPathGenerator menaruh tiap media di `foto-transaksi/{id}/`, artinya ratusan ribu
 * foto = ratusan ribu subdirektori dalam SATU folder datar. Lookup-nya masih oke di ext4,
 * tapi traversal (rsync/backup/du) merangkak dan sebagian filesystem menurun drastis.
 *
 * Di sini id dipecah jadi dua level 3-digit: id 1234 -> `000/001/1234`. Maks 1000 entri per
 * direktori, jadi tetap rata sampai ratusan juta media. Wajib dipasang SEKARANG selagi data
 * masih sedikit -- menggantinya nanti berarti memindahkan ratusan ribu direktori.
 */
class ShardedPathGenerator extends DefaultPathGenerator
{
    /** Path relatif (tanpa prefix) untuk satu id media. Dipakai juga oleh migrasi pemindah berkas. */
    public static function basePathFor(int|string $id): string
    {
        $padded = str_pad((string) $id, 9, '0', STR_PAD_LEFT);

        return substr($padded, 0, 3).'/'.substr($padded, 3, 3).'/'.$id;
    }

    protected function getBasePath(Media $media): string
    {
        $prefix = config('media-library.prefix', '');
        $path = static::basePathFor($media->getKey());

        return $prefix !== '' ? $prefix.'/'.$path : $path;
    }
}
