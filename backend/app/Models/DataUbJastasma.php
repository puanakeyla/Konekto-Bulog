<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;

class DataUbJastasma extends Model
{
    use HasStageLifecycle;

    protected $table = 'data_ub_jastasma';

    protected $fillable = [
        'transaksi_id',
        'ka1',
        'ka2',
        'ka3',
        'hampa',
        'butir_hijau',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'locked_at' => 'datetime',
            'submitted_at' => 'datetime',
            'ka1' => 'decimal:2',
            'ka2' => 'decimal:2',
            'ka3' => 'decimal:2',
            'hampa' => 'decimal:2',
            'butir_hijau' => 'decimal:2',
        ];
    }
}
