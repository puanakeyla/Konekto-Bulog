<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DataPengadaan extends Model
{
    protected $table = 'data_pengadaan';

    protected $fillable = [
        'tanggal_bongkar',
        'id_pemasok',
        'makloon_user_id',
        'total_kuantum',
        'harga',
        'total_harga',
        'no_po',
        'no_spp',
        'status',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function poDetail(): HasMany
    {
        return $this->hasMany(PoDetail::class);
    }

    public function dataKeuangan(): HasOne
    {
        return $this->hasOne(DataKeuangan::class);
    }

    protected function casts(): array
    {
        return [
            'tanggal_bongkar' => 'date',
            'total_kuantum' => 'decimal:2',
            'harga' => 'decimal:2',
            'total_harga' => 'decimal:2',
        ];
    }
}
