<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RiwayatPenolakan extends Model
{
    protected $table = 'riwayat_penolakan';

    public $timestamps = false;

    protected $fillable = [
        'transaksi_id',
        'tahap',
        'catatan',
        'ditolak_oleh',
        'ditolak_pada',
    ];

    protected function casts(): array
    {
        return [
            'ditolak_pada' => 'datetime',
        ];
    }

    public function transaksi(): BelongsTo
    {
        return $this->belongsTo(Transaksi::class, 'transaksi_id', 'id_transaksi');
    }

    public function penolak(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ditolak_oleh');
    }
}
