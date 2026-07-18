<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataGudang extends Model
{
    protected $table = 'data_gudang';

    protected $fillable = [
        'permintaan_operasi_id',
        'tanggal_masuk',
        'nama_gudang',
        'realisasi_hgl',
        'no_tm',
    ];

    public function permintaanOperasi(): BelongsTo
    {
        return $this->belongsTo(PermintaanOperasi::class);
    }

    protected function casts(): array
    {
        return [
            'tanggal_masuk' => 'date',
            'realisasi_hgl' => 'decimal:2',
        ];
    }
}
