<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Tahap Makloon Terima pada skema MPP: hasil timbang setelah gabah dibongkar di makloon.
 *
 * Sengaja TIPIS -- hanya kuantum bongkar beserta dua dokumennya. Sisa data MPP (pemasok,
 * supir, plat, lokasi, tanggal & kuantum kirim) tetap milik DataMakloonMpp, karena itu isian
 * tahap Makloon Kirim. Yang dipisah di sini cuma apa yang baru diketahui SETELAH bongkar.
 */
class DataMakloonTerima extends Model implements HasMedia
{
    use HasStageLifecycle;
    use InteractsWithMedia;

    protected $table = 'data_makloon_terima';

    /** Dokumen wajib tahap ini -- keduanya baru ada setelah barang dibongkar dan ditimbang. */
    public const FOTO = [
        'foto_surat_jalan',
        'foto_nota_timbang',
    ];

    protected $fillable = [
        'transaksi_id',
        'kuantum_bongkar',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];

    public function registerMediaCollections(): void
    {
        foreach (self::FOTO as $collection) {
            $this->addMediaCollection($collection)
                ->singleFile()
                ->acceptsMimeTypes(['image/jpeg', 'image/png']);
        }
    }

    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumb')
            ->width(300)
            ->queued();
    }
}
