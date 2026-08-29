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

        // Transaksi diambil SEKALI di luar perulangan, bukan per calon penerima.
        $transaksi = $this->transaksiSergab($transaksiId, $data);

        User::query()
            ->whereHas('role', fn ($query) => $query->whereIn('nama_role', $targetRoles))
            ->where('id', '!=', $actor->id)
            ->where('is_active', true)
            // `role` di-eager load karena bolehMenerima() membacanya untuk tiap calon penerima.
            ->with('role')
            ->get()
            ->filter(fn (User $user) => $this->bolehMenerima($user, $transaksi))
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

    /**
     * Notifikasi disiarkan per ROLE, sedangkan transaksi dibatasi per PEMILIK
     * (Transaksi::scopeTerlihatOleh: makloon hanya melihat transaksi miliknya). Tanpa gerbang
     * ini setiap makloon menerima kabar transaksi seluruh pesaingnya -- lengkap dengan id
     * transaksi di badan pesan -- dan mengkliknya berujung 403 karena bolehDilihatOleh()
     * menolaknya. Jadi kotak notifikasinya penuh baris yang tidak bisa dibuka.
     *
     * Gerbangnya sengaja ditaruh di sini, bukan di tiap pemanggil: seluruh notifikasi tahap
     * transaksi lewat method ini, sehingga satu penjaga menutup semuanya sekaligus.
     *
     * Role selain makloon tidak dibatasi -- UB Jastasma, Pengadaan, dan Keuangan memang
     * bekerja lintas transaksi, itu memang lingkup kerjanya.
     */
    private function bolehMenerima(User $user, ?Transaksi $transaksi): bool
    {
        if ($transaksi === null || $user->role?->nama_role !== 'makloon') {
            return true;
        }

        return $transaksi->bolehDilihatOleh($user);
    }

    /**
     * Rantai pengolahan menumpang kolom `notifikasi.transaksi_id` untuk menyimpan
     * `id_pengolahan` (lihat PengolahanStageService::kirimNotifikasi), yang BUKAN kunci tabel
     * `transaksi`. Pembedanya `data.modul`, jadi id pengolahan tidak ikut dicari ke sini.
     */
    private function transaksiSergab(?string $transaksiId, ?array $data): ?Transaksi
    {
        if ($transaksiId === null || ($data['modul'] ?? null) === 'pengolahan') {
            return null;
        }

        return Transaksi::with('dataJemputPangan')->find($transaksiId);
    }
}
