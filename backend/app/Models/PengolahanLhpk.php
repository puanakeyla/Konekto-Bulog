<?php

namespace App\Models;

use App\Models\Concerns\HasPengolahanLifecycle;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Data tahap UB Jastasma (LHPK -- Laporan Hasil Pemeriksaan Kualitas).
 */
class PengolahanLhpk extends Model implements HasMedia
{
    use HasPengolahanLifecycle;
    use InteractsWithMedia;

    protected $table = 'pengolahan_lhpk';

    protected $appends = ['rendemen'];

    protected $fillable = [
        'transaksi_pengolahan_id',
        'gudang_tujuan_id',
        'no_lhpk',
        'tanggal_lhpk',
        'kuantum_stok_gudang',
        'kuantum_gabah_diolah',
        'kuantum_beras_hgl',
        'kualitas',
        'broken',
        'menir',
        'katul',
        'ka1',
        'ka2',
        'ka3',
        'reject',
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
            'tanggal_lhpk' => 'date',
            'kuantum_stok_gudang' => 'decimal:2',
            'kuantum_gabah_diolah' => 'decimal:2',
            'kuantum_beras_hgl' => 'decimal:2',
            'broken' => 'decimal:2',
            'menir' => 'decimal:2',
            'katul' => 'decimal:2',
            'ka1' => 'decimal:2',
            'ka2' => 'decimal:2',
            'ka3' => 'decimal:2',
            'reject' => 'decimal:2',
            'locked_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }

    /**
     * Diturunkan, tidak disimpan: satu kolom rendemen tersimpan hanya menambah tempat lain yang
     * bisa melenceng dari dua angka sumbernya. Pembagi nol menghasilkan 0, bukan error --
     * LHPK yang masih draft wajar punya kuantum kosong.
     */
    protected function rendemen(): Attribute
    {
        return Attribute::get(function (): float {
            $diolah = (float) $this->kuantum_gabah_diolah;

            return $diolah > 0 ? round((float) $this->kuantum_beras_hgl / $diolah * 100, 2) : 0.0;
        });
    }

    public function gudangTujuan(): BelongsTo
    {
        return $this->belongsTo(Gudang::class, 'gudang_tujuan_id');
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('foto_lhpk')
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
