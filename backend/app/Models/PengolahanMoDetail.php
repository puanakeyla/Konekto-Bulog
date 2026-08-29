<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PengolahanMoDetail extends Model
{
    protected $table = 'pengolahan_mo_detail';

    protected $fillable = [
        'pengolahan_mo_id',
        'transaksi_pengolahan_id',
        'kuantum_hgl_kontribusi',
        'kuantum_gabah_diolah_kontribusi',
    ];

    protected function casts(): array
    {
        return [
            'kuantum_hgl_kontribusi' => 'decimal:2',
            'kuantum_gabah_diolah_kontribusi' => 'decimal:2',
        ];
    }

    public function mo(): BelongsTo
    {
        return $this->belongsTo(PengolahanMo::class, 'pengolahan_mo_id');
    }

    public function transaksiPengolahan(): BelongsTo
    {
        return $this->belongsTo(TransaksiPengolahan::class, 'transaksi_pengolahan_id', 'id_pengolahan');
    }
}
