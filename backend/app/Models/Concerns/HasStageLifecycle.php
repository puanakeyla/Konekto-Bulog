<?php

namespace App\Models\Concerns;

use App\Models\Transaksi;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait HasStageLifecycle
{
    public function transaksi(): BelongsTo
    {
        return $this->belongsTo(Transaksi::class, 'transaksi_id', 'id_transaksi');
    }

    public function lockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    protected function casts(): array
    {
        return [
            'locked_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }
}
