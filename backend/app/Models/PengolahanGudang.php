<?php

namespace App\Models;

use App\Models\Concerns\HasPengolahanLifecycle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Data tahap Gudang. `kuantum_hgl` adalah hasil TIMBANGAN FISIK -- bukan angka yang sama dengan
 * PengolahanLhpk::kuantum_beras_hgl (hasil olah menurut LHPK). Selisihnya susut, dan memang
 * dibiarkan berbeda tanpa validasi silang.
 */
class PengolahanGudang extends Model implements HasMedia
{
    use HasPengolahanLifecycle;
    use InteractsWithMedia;

    protected $table = 'pengolahan_gudang';

    protected $fillable = [
        'transaksi_pengolahan_id',
        'gudang_id',
        'tanggal_masuk_gudang',
        'kuantum_hgl',
        'plat_mobil',
        'supir',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'tanggal_masuk_gudang' => 'date',
            'kuantum_hgl' => 'decimal:2',
            'locked_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }

    public function gudang(): BelongsTo
    {
        return $this->belongsTo(Gudang::class, 'gudang_id');
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('foto_notim')
            ->singleFile()
            ->acceptsMimeTypes(['image/jpeg', 'image/png']);
    }

    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumb')
            ->width(300)
            ->queued();
    }
}
