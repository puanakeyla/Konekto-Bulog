<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class DataPengadaan extends Model implements HasMedia
{
    use InteractsWithMedia;

    protected $table = 'data_pengadaan';

    protected $fillable = [
        'tanggal_bongkar',
        'id_pemasok',
        'makloon_user_id',
        'total_kuantum',
        'harga',
        'total_harga',
        'no_po',
        'no_spp',
        'status',
        'review_status',
        'catatan_penolakan',
        'reviewed_by',
        'reviewed_at',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function poDetail(): HasMany
    {
        return $this->hasMany(PoDetail::class);
    }

    public function dataKeuangan(): HasOne
    {
        return $this->hasOne(DataKeuangan::class);
    }

    public function registerMediaCollections(): void
    {
        foreach ([
            'foto_barang',
            'foto_serah_terima',
            'foto_bukti_pembayaran',
            'foto_surat_pernyataan_usia_panen',
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

    protected function casts(): array
    {
        return [
            'tanggal_bongkar' => 'date',
            'total_kuantum' => 'decimal:2',
            'harga' => 'decimal:2',
            'total_harga' => 'decimal:2',
        ];
    }
}
