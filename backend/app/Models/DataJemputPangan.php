<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class DataJemputPangan extends Model implements HasMedia
{
    use HasStageLifecycle;
    use InteractsWithMedia;

    protected $table = 'data_jemput_pangan';

    protected $fillable = [
        'transaksi_id',
        'id_pemasok',
        'supir',
        'plat_mobil',
        'nama_poktan_gapoktan',
        'desa',
        'kecamatan',
        'kabupaten',
        'makloon_user_id',
        'tanggal_kirim',
        'kuantum',
        'jarak_ke_makloon_km',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    protected function casts(): array
    {
        return [
            'locked_at' => 'datetime',
            'submitted_at' => 'datetime',
            'kuantum' => 'decimal:2',
        ];
    }

    /**
     * Bagian 4: satu collection per jenis foto (bukan campur), supaya tiap slot foto
     * bisa divalidasi & ditampilkan independen. singleFile() = upload baru menggantikan
     * yang lama, sesuai makna "foto X" sebagai satu bukti representatif, bukan galeri.
     */
    public function registerMediaCollections(): void
    {
        foreach ([
            'foto_petani',
            'foto_gabah',
            'foto_serah_terima',
            'foto_kwitansi',
            'foto_surat_pernyataan',
            'foto_surat_jalan',
        ] as $collection) {
            $this->addMediaCollection($collection)
                ->singleFile()
                ->acceptsMimeTypes(['image/jpeg', 'image/png']);
        }
    }

    /**
     * Bagian 6: thumbnail lebar 300px, dijalankan lewat queue (bukan blocking request upload).
     */
    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumb')
            ->width(300)
            ->queued();
    }
}
