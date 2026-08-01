<?php

namespace App\Services;

use App\Models\Notifikasi;
use App\Models\User;

class NotifikasiService
{
    /**
     * @param list<string> $roles
     */
    public function kirimKeRole(array $roles, User $actor, string $tipe, string $judul, string $pesan, ?string $transaksiId = null, ?array $data = null, bool $sertakanAdmin = true): void
    {
        $targetRoles = array_values(array_unique([...$roles, ...($sertakanAdmin ? ['admin'] : [])]));

        User::query()
            ->whereHas('role', fn ($query) => $query->whereIn('nama_role', $targetRoles))
            ->where('id', '!=', $actor->id)
            ->where('is_active', true)
            ->get()
            ->each(fn (User $user) => Notifikasi::create([
                'user_id' => $user->id,
                'actor_id' => $actor->id,
                'transaksi_id' => $transaksiId,
                'tipe' => $tipe,
                'judul' => $judul,
                'pesan' => $pesan,
                'data' => $data,
            ]));
    }
}
