<?php

namespace App\Services;

use App\Models\Notifikasi;
use App\Models\Transaksi;
use App\Models\User;

class NotifikasiService
{
    /**
     * @param list<string> $roles
     */
    public function kirimKeRole(array $roles, User $actor, string $tipe, string $judul, string $pesan, ?string $transaksiId = null, ?array $data = null, bool $sertakanAdmin = true): void
    {
        $targetRoles = array_values(array_unique([...$roles, ...($sertakanAdmin ? ['admin'] : [])]));

        // Mitra makloon adalah perusahaan yang berdiri sendiri, jadi data satu makloon rahasia
        // bagi makloon lain -- aturan yang sudah ditegakkan pada daftar transaksi lewat
        // Transaksi::scopeTerlihatOleh(). Tanpa penyaringan di sini, memilih penerima murni dari
        // role membuat SETIAP mitra makloon menerima notifikasi transaksi mitra lain, lengkap
        // dengan nomor transaksi dan catatan penolakannya.
        //
        // Disaring di sini, bukan di tiap pemanggil: seluruh pemanggil kirimKeRole() ikut benar
        // sekaligus, dan pemanggil baru tidak bisa lupa memasangnya.
        $transaksi = $transaksiId !== null
            ? Transaksi::with('dataJemputPangan')->find($transaksiId)
            : null;

        User::query()
            ->with('role')
            ->whereHas('role', fn ($query) => $query->whereIn('nama_role', $targetRoles))
            ->where('id', '!=', $actor->id)
            ->where('is_active', true)
            ->get()
            // Notifikasi level PO (transaksi_id null) tidak tersaring: sasarannya Pengadaan &
            // Keuangan, bukan makloon. Role internal BULOG juga lolos -- pembatasan mereka
            // bersifat per-field, bukan per-baris.
            ->reject(fn (User $user) => $user->role?->nama_role === 'makloon'
                && $transaksi !== null
                && ! $transaksi->dimilikiOleh($user))
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
