<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Mo extends Model
{
    protected $table = 'mo';

    protected $fillable = [
        'no_mo', 'no_tm', 'makloon_user_id', 'total_kuantum_olah', 'no_out',
        'tujuan_gudang_user_id', 'no_tm_gudang', 'kuantum_total', 'tanggal_terima_gudang',
        'current_stage', 'status', 'catatan_penolakan', 'created_by',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function tujuanGudang(): BelongsTo
    {
        return $this->belongsTo(User::class, 'tujuan_gudang_user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function moDetail(): HasMany
    {
        return $this->hasMany(MoDetail::class);
    }

    protected function casts(): array
    {
        return [
            'total_kuantum_olah' => 'decimal:2',
            'kuantum_total' => 'decimal:2',
            'tanggal_terima_gudang' => 'date',
        ];
    }
}
