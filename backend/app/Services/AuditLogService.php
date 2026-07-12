<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;

class AuditLogService
{
    public function log(User $actor, string $aksi, ?string $transaksiId = null, ?array $detail = null): AuditLog
    {
        return AuditLog::create([
            'transaksi_id' => $transaksiId,
            'user_id' => $actor->id,
            'aksi' => $aksi,
            'detail' => $detail,
        ]);
    }

    public function logMany(User $actor, string $aksi, iterable $transaksiIds, ?array $detail = null): void
    {
        foreach ($transaksiIds as $transaksiId) {
            $this->log($actor, $aksi, (string) $transaksiId, $detail);
        }
    }
}
