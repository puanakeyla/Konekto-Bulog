<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataKeuangan extends Model
{
    protected $table = 'data_keuangan';

    protected $fillable = [
        'data_pengadaan_id',
        'status_bayar',
        'tanggal_bayar',
    ];

    public function dataPengadaan(): BelongsTo
    {
        return $this->belongsTo(DataPengadaan::class);
    }

    protected function casts(): array
    {
        return [
            'tanggal_bayar' => 'date',
        ];
    }
}
