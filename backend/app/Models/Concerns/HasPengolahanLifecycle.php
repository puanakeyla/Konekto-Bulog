<?php

namespace App\Models\Concerns;

use App\Models\TransaksiPengolahan;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Padanan HasStageLifecycle untuk rantai pengolahan. Sengaja trait terpisah, bukan menumpang
 * yang lama: FK-nya menunjuk tabel yang berbeda, dan menggabungkan keduanya berarti menyentuh
 * berkas milik alur SerGab yang sedang berjalan.
 */
trait HasPengolahanLifecycle
{
    public function transaksiPengolahan(): BelongsTo
    {
        return $this->belongsTo(TransaksiPengolahan::class, 'transaksi_pengolahan_id', 'id_pengolahan');
    }

    public function lockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
}
