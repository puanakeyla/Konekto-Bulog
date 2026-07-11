<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class DataMakloonMpp extends Model implements HasMedia
{
    use HasStageLifecycle;
    use InteractsWithMedia;

    protected $table = 'data_makloon_mpp';

    protected $fillable = [
        'transaksi_id',
        'id_pemasok',
        'supir',
        'plat_mobil',
        'desa',
        'kecamatan',
        'kabupaten',
        'tanggal_bongkar',
        'kuantum',
        'jarak_ke_makloon_km',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];

    public function registerMediaCollections(): void
    {
        foreach ([
            'foto_petani',
            'foto_gabah',
            'foto_serah_terima',
            'foto_pembayaran',
            'foto_surat_pernyataan',
            'foto_surat_jalan',
            'foto_nota_timbang',
        ] as $collection) {
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
