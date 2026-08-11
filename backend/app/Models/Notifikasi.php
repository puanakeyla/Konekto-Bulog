<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notifikasi extends Model
{
    use Prunable;

    protected $table = 'notifikasi';

    protected $fillable = [
        'user_id',
        'actor_id',
        'transaksi_id',
        'tipe',
        'judul',
        'pesan',
        'data',
        'read_at',
    ];

    /** Retensi 0 = jangan pangkas. Lihat catatan yang sama di AuditLog::prunable(). */
    public function prunable(): Builder
    {
        $hari = (int) config('pemeliharaan.retensi.notifikasi_hari');

        return $hari > 0
            ? static::where('created_at', '<=', now()->subDays($hari))
            : static::whereRaw('1 = 0');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'read_at' => 'datetime',
        ];
    }
}
