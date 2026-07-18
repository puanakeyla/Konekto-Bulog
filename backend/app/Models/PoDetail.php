<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PoDetail extends Model
{
    protected $table = 'po_detail';

    protected $fillable = [
        'data_pengadaan_id',
        'transaksi_id',
        'kuantum_kontribusi',
        'no_in',
    ];

    public function dataPengadaan(): BelongsTo
    {
        return $this->belongsTo(DataPengadaan::class);
    }

    public function transaksi(): BelongsTo
    {
        return $this->belongsTo(Transaksi::class, 'transaksi_id', 'id_transaksi');
    }

    protected function casts(): array
    {
        return [
            'kuantum_kontribusi' => 'decimal:2',
        ];
    }
}
