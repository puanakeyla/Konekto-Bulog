<?php

namespace App\Services\Pengolahan;

use App\Models\Mo;
use App\Models\MoDetail;
use App\Models\Pengolahan;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class MoService
{
    public function gabungkan(array $pengolahanIds, string $noMo, string $noTm, User $operasi): Mo
    {
        if (count($pengolahanIds) < 1) {
            abort(422, 'Pilih minimal satu baris pengolahan.');
        }

        if (Mo::where('no_mo', $noMo)->exists()) {
            abort(422, 'Nomor MO sudah dipakai.');
        }

        return DB::transaction(function () use ($pengolahanIds, $noMo, $noTm, $operasi) {
            $rows = Pengolahan::whereIn('id', $pengolahanIds)->lockForUpdate()->get();

            if ($rows->count() !== count(array_unique($pengolahanIds))) {
                abort(422, 'Salah satu baris pengolahan tidak ditemukan.');
            }

            $makloonId = null;
            foreach ($rows as $row) {
                if ($row->status !== 'menunggu_operasi') {
                    abort(422, "Baris {$row->no_lhpk} tidak menunggu Operasi (status: {$row->status}).");
                }
                if ($makloonId === null) {
                    $makloonId = $row->makloon_user_id;
                } elseif ($row->makloon_user_id !== $makloonId) {
                    abort(422, 'Baris yang dipilih harus dari makloon yang sama.');
                }
            }

            $total = (float) $rows->sum('kuantum_olah');

            $mo = Mo::create([
                'no_mo' => $noMo,
                'no_tm' => $noTm,
                'makloon_user_id' => $makloonId,
                'total_kuantum_olah' => number_format($total, 2, '.', ''),
                'current_stage' => 'pengadaan',
                'status' => 'berjalan',
                'created_by' => $operasi->id,
            ]);

            foreach ($rows as $row) {
                MoDetail::create(['mo_id' => $mo->id, 'pengolahan_id' => $row->id]);
                $row->update(['status' => 'digabung', 'mo_id' => $mo->id]);
            }

            return $mo->load('moDetail');
        });
    }

    public function putuskanOut(Mo $mo, string $keputusan, ?string $noOut, ?string $catatan, User $pengadaan): Mo
    {
        return DB::transaction(function () use ($mo, $keputusan, $noOut, $catatan) {
            $mo = Mo::whereKey($mo->id)->lockForUpdate()->firstOrFail();

            if ($mo->current_stage !== 'pengadaan') {
                abort(422, 'MO tidak sedang di tahap Pengadaan.');
            }

            if ($keputusan === 'diterima') {
                $noOut = trim((string) $noOut);
                if ($noOut === '') {
                    abort(422, 'Nomor OUT wajib diisi.');
                }
                if (Mo::where('no_out', $noOut)->whereKeyNot($mo->id)->exists()) {
                    abort(422, 'Nomor OUT sudah dipakai.');
                }
                $mo->update(['no_out' => $noOut, 'catatan_penolakan' => null, 'current_stage' => 'operasi']);
            } elseif ($keputusan === 'ditolak') {
                $catatan = trim((string) $catatan);
                if ($catatan === '') {
                    abort(422, 'Catatan wajib diisi untuk penolakan.');
                }
                $mo->update(['catatan_penolakan' => $catatan, 'current_stage' => 'operasi']);
            } else {
                abort(422, 'Keputusan harus diterima atau ditolak.');
            }

            return $mo->fresh();
        });
    }

    public function kirimGudang(Mo $mo, array $data, User $operasi): Mo
    {
        if ($mo->current_stage !== 'operasi') {
            abort(422, 'MO tidak sedang di tahap Operasi.');
        }
        if (empty($mo->no_out)) {
            abort(422, 'Nomor OUT belum dikeluarkan Pengadaan.');
        }

        $mo->update([
            'tujuan_gudang_user_id' => $data['tujuan_gudang_user_id'],
            'no_tm_gudang' => $data['no_tm_gudang'],
            'kuantum_total' => $data['kuantum_total'],
            'catatan_penolakan' => null,
            'current_stage' => 'gudang',
        ]);

        return $mo->fresh();
    }

    public function terimaGudang(Mo $mo, User $gudang, string $tanggal): Mo
    {
        $this->assertGudangTujuan($mo, $gudang);

        $mo->update([
            'tanggal_terima_gudang' => $tanggal,
            'status' => 'selesai',
            'current_stage' => 'selesai',
        ]);

        return $mo->fresh();
    }

    public function tolakGudang(Mo $mo, User $gudang, string $catatan): Mo
    {
        $this->assertGudangTujuan($mo, $gudang);

        $mo->update(['catatan_penolakan' => $catatan, 'current_stage' => 'operasi']);

        return $mo->fresh();
    }

    private function assertGudangTujuan(Mo $mo, User $gudang): void
    {
        if ($mo->current_stage !== 'gudang') {
            abort(422, 'MO tidak sedang di tahap Gudang.');
        }
        if ($gudang->role->nama_role !== 'admin' && (int) $mo->tujuan_gudang_user_id !== (int) $gudang->id) {
            abort(403, 'Anda bukan gudang tujuan MO ini.');
        }
    }
}
