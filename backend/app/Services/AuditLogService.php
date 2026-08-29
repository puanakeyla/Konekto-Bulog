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

    /**
     * Rantai pengolahan memakai kolomnya sendiri: audit_logs.transaksi_id punya FK ke tabel
     * `transaksi`, jadi ID pengolahan tidak bisa dititipkan ke situ.
     */
    public function logPengolahan(User $actor, string $aksi, ?string $pengolahanId = null, ?array $detail = null): AuditLog
    {
        return AuditLog::create([
            'pengolahan_id' => $pengolahanId,
            'user_id' => $actor->id,
            'aksi' => $aksi,
            'detail' => $detail,
        ]);
    }

    public function logManyPengolahan(User $actor, string $aksi, iterable $pengolahanIds, ?array $detail = null): void
    {
        foreach ($pengolahanIds as $pengolahanId) {
            $this->logPengolahan($actor, $aksi, (string) $pengolahanId, $detail);
        }
    }
}
