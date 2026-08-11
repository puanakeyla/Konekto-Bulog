<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    use Prunable;

    public const UPDATED_AT = null;

    protected $fillable = [
        'transaksi_id',
        'pengolahan_id',
        'user_id',
        'aksi',
        'detail',
    ];

    protected function casts(): array
    {
        return [
            'detail' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /**
     * Retensi 0 = jangan pangkas sama sekali. Dibuat eksplisit karena `whereRaw('1 = 0')`
     * jauh lebih aman daripada `subDays(0)`, yang justru berarti "buang semua sampai detik ini".
     */
    public function prunable(): Builder
    {
        $hari = (int) config('pemeliharaan.retensi.audit_log_hari');

        return $hari > 0
            ? static::where('created_at', '<=', now()->subDays($hari))
            : static::whereRaw('1 = 0');
    }

    public function transaksi(): BelongsTo
    {
        return $this->belongsTo(Transaksi::class, 'transaksi_id', 'id_transaksi');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
