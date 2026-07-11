<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class DataMakloonTjp extends Model implements HasMedia
{
    use HasStageLifecycle;
    use InteractsWithMedia;

    protected $table = 'data_makloon_tjp';

    protected $fillable = [
        'transaksi_id',
        'tanggal_bongkar',
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
        foreach ([
            'foto_surat_jalan_paraf',
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
