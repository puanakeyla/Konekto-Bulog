<?php

namespace App\Services\Pengolahan;

use App\Models\Pengolahan;
use App\Models\PoDetail;
use App\Models\User;

class PengolahanService
{
    /** Total kuantum yang SUDAH masuk proses IN untuk makloon tertentu (referensi read-only). */
    public function totalKuantumIn(int $makloonUserId): float
    {
        return (float) PoDetail::whereNotNull('no_in')
            ->whereHas('dataPengadaan', fn ($q) => $q->where('makloon_user_id', $makloonUserId))
            ->sum('kuantum_kontribusi');
    }

    public function buat(User $ub, array $data): Pengolahan
    {
        $jumlahKuantum = $this->totalKuantumIn((int) $data['makloon_user_id']);

        return Pengolahan::create([
            'makloon_user_id' => $data['makloon_user_id'],
            'jumlah_kuantum' => $jumlahKuantum,
            'kuantum_olah' => $data['kuantum_olah'],
            'no_lhpk' => $data['no_lhpk'],
            'tanggal' => $data['tanggal'],
            'ka1' => $data['ka1'] ?? null,
            'ka2' => $data['ka2'] ?? null,
            'ka3' => $data['ka3'] ?? null,
            'hgl' => $data['hgl'] ?? null,
            'broken' => $data['broken'] ?? null,
            'menir' => $data['menir'] ?? null,
            'katul' => $data['katul'] ?? null,
            'rendemen' => $this->hitungRendemen($data['hgl'] ?? null, $jumlahKuantum),
            'status' => 'menunggu_operasi',
            'created_by' => $ub->id,
        ]);
    }

    public function ajukanUlang(Pengolahan $p, array $data): Pengolahan
    {
        if ($p->status !== 'ditolak') {
            abort(422, 'Hanya pengolahan yang ditolak yang dapat diajukan ulang.');
        }

        $p->update([
            'kuantum_olah' => $data['kuantum_olah'],
            'no_lhpk' => $data['no_lhpk'],
            'tanggal' => $data['tanggal'],
            'ka1' => $data['ka1'] ?? null,
            'ka2' => $data['ka2'] ?? null,
            'ka3' => $data['ka3'] ?? null,
            'hgl' => $data['hgl'] ?? null,
            'broken' => $data['broken'] ?? null,
            'menir' => $data['menir'] ?? null,
            'katul' => $data['katul'] ?? null,
            'rendemen' => $this->hitungRendemen($data['hgl'] ?? null, (float) $p->jumlah_kuantum),
            'status' => 'menunggu_operasi',
            'catatan_penolakan' => null,
        ]);

        return $p->fresh();
    }

    public function tolak(Pengolahan $p, User $operasi, string $catatan): Pengolahan
    {
        if ($p->status !== 'menunggu_operasi') {
            abort(422, 'Hanya pengolahan yang menunggu Operasi yang dapat ditolak.');
        }

        $p->update([
            'status' => 'ditolak',
            'catatan_penolakan' => $catatan,
            'locked_by' => $operasi->id,
            'locked_at' => now(),
        ]);

        return $p->fresh();
    }

    private function hitungRendemen(?float $hgl, float $jumlahKuantum): ?float
    {
        if ($hgl === null || $jumlahKuantum <= 0) {
            return null;
        }

        return round($hgl / $jumlahKuantum * 100, 2);
    }
}
