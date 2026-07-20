<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Pengolahan extends Model
{
    protected $table = 'pengolahan';

    protected $fillable = [
        'makloon_user_id', 'jumlah_kuantum', 'kuantum_olah', 'no_lhpk', 'tanggal',
        'ka1', 'ka2', 'ka3', 'hgl', 'broken', 'menir', 'katul', 'rendemen',
        'status', 'catatan_penolakan', 'mo_id', 'created_by',
        'locked_at', 'locked_by', 'submitted_by', 'submitted_at',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function mo(): BelongsTo
    {
        return $this->belongsTo(Mo::class, 'mo_id');
    }

    protected function casts(): array
    {
        return [
            'tanggal' => 'date',
            'jumlah_kuantum' => 'decimal:2',
            'kuantum_olah' => 'decimal:2',
            'hgl' => 'decimal:2',
            'broken' => 'decimal:2',
            'menir' => 'decimal:2',
            'katul' => 'decimal:2',
            'rendemen' => 'decimal:2',
            'locked_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }
}
