<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JaminanMakloon extends Model
{
    protected $table = 'jaminan_makloon';

    protected $fillable = [
        'makloon_user_id',
        'user_makloon_id',
        'jaminan_rp',
        'kapasitas_per_hari_kg',
        'batas_hari',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'jaminan_rp' => 'decimal:2',
            'kapasitas_per_hari_kg' => 'decimal:2',
            'batas_hari' => 'integer',
        ];
    }

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function userMakloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_makloon_id');
    }
}
