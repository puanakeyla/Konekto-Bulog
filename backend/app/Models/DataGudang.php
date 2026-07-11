<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataGudang extends Model
{
    protected $table = 'data_gudang';

    protected $fillable = [
        'data_operasi_id',
        'tanggal_masuk',
        'nama_gudang',
        'realisasi_hgl',
        'no_tm',
    ];

    public function dataOperasi(): BelongsTo
    {
        return $this->belongsTo(DataOperasi::class);
    }

    protected function casts(): array
    {
        return [
            'tanggal_masuk' => 'date',
            'realisasi_hgl' => 'decimal:2',
        ];
    }
}
