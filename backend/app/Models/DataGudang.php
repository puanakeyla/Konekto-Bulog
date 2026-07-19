<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataGudang extends Model
{
    protected $table = 'data_gudang';

    protected $fillable = [
        'tanggal_masuk',
        'nama_gudang',
        'realisasi_hgl',
        'no_tm',
        'created_by',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    protected function casts(): array
    {
        return [
            'tanggal_masuk' => 'date',
            'realisasi_hgl' => 'decimal:2',
        ];
    }
}
