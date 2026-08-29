<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JaminanMakloon extends Model
{
    protected $table = 'jaminan_makloon';

    protected $fillable = [
        'makloon_user_id',
        'bentuk_jaminan',
        'jaminan_rp',
        'kapasitas_per_hari_kg',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'jaminan_rp' => 'decimal:2',
            'kapasitas_per_hari_kg' => 'decimal:2',
        ];
    }

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }
}
