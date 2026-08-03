<?php

namespace App\Services\Pengolahan;

use App\Models\PengolahanLhpk;
use App\Models\PengolahanMo;
use App\Models\PengolahanMoDetail;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\NotifikasiService;
use Illuminate\Support\Facades\DB;

/**
 * Menggabungkan beberapa LHPK milik SATU makloon jadi satu MO -- analog PoGroupingService yang
 * menggabungkan transaksi jadi satu PO.
 *
 * Kunci grupnya cuma makloon (di PO: tanggal bongkar + pemasok + makloon), karena MO adalah
 * perintah pemindahan hasil olah milik satu mitra.
 */
class MoGroupingService
{
    public function __construct(private AuditLogService $auditLog, private NotifikasiService $notifikasi)
    {
    }

    /** @param list<string> $ids */
    public function gabungkanMo(array $ids, string $noMo, User $actor, ?string $noTmAda = null, ?string $noTmGudang = null): PengolahanMo
    {
        if (count($ids) < 1) {
            abort(422, 'Pilih minimal satu LHPK untuk digabungkan.');
        }

        return DB::transaction(function () use ($ids, $noMo, $noTmAda, $noTmGudang, $actor) {
            $rows = $this->validasiAnggota($ids);

            $mo = PengolahanMo::create([
                'no_mo' => $noMo,
                'no_tm_ada' => $noTmAda,
                'no_tm_gudang' => $noTmGudang,
                'makloon_user_id' => $rows['makloon_user_id'],
                'total_kuantum_hgl' => $rows['total_hgl'],
                'total_kuantum_gabah_diolah' => $rows['total_gabah'],
                'status' => 'proses',
                'review_status' => 'draft',
            ]);

            foreach ($rows['anggota'] as $id => $kuantum) {
                PengolahanMoDetail::create([
                    'pengolahan_mo_id' => $mo->id,
                    'transaksi_pengolahan_id' => $id,
                    'kuantum_hgl_kontribusi' => $kuantum['hgl'],
                    'kuantum_gabah_diolah_kontribusi' => $kuantum['gabah'],
                ]);
            }

            $this->auditLog->logManyPengolahan($actor, 'gabungkan_mo', array_keys($rows['anggota']), [
                'pengolahan_mo_id' => $mo->id,
                'no_mo' => $mo->no_mo,
            ]);

            return $mo->load('moDetail');
        });
    }

    /** @param list<string> $ids */
    public function ubahAnggota(PengolahanMo $mo, array $ids, User $actor): PengolahanMo
    {
        if (count($ids) < 1) {
            abort(422, 'MO harus punya minimal satu anggota.');
        }

        if ($mo->terkunci()) {
            abort(422, 'MO ini sudah final dan anggotanya tidak bisa diubah lagi.');
        }

        return DB::transaction(function () use ($mo, $ids, $actor) {
            $mo = PengolahanMo::whereKey($mo->id)->lockForUpdate()->firstOrFail();
            $rows = $this->validasiAnggota($ids, $mo->id);

            $mo->moDetail()->whereNotIn('transaksi_pengolahan_id', $ids)->delete();

            foreach ($rows['anggota'] as $id => $kuantum) {
                PengolahanMoDetail::updateOrCreate(
                    ['transaksi_pengolahan_id' => $id],
                    [
                        'pengolahan_mo_id' => $mo->id,
                        'kuantum_hgl_kontribusi' => $kuantum['hgl'],
                        'kuantum_gabah_diolah_kontribusi' => $kuantum['gabah'],
                    ],
                );
            }

            $mo->makloon_user_id = $rows['makloon_user_id'];
            $mo->total_kuantum_hgl = $rows['total_hgl'];
            $mo->total_kuantum_gabah_diolah = $rows['total_gabah'];
            $mo->save();

            $this->auditLog->logManyPengolahan($actor, 'ubah_anggota_mo', $ids, [
                'pengolahan_mo_id' => $mo->id,
                'no_mo' => $mo->no_mo,
            ]);

            return $mo->fresh('moDetail');
        });
    }

    public function kirimKePengadaan(PengolahanMo $mo, User $actor): PengolahanMo
    {
        if ($mo->terkunci()) {
            abort(422, 'MO ini sudah final.');
        }

        foreach (['no_mo' => 'Nomor MO', 'no_tm_ada' => 'Nomor TM ADA', 'no_tm_gudang' => 'Nomor TM Gudang'] as $kolom => $label) {
            if (trim((string) $mo->{$kolom}) === '') {
                abort(422, "{$label} wajib diisi sebelum MO dikirim ke Pengadaan.");
            }
        }

        if ($mo->moDetail()->count() < 1) {
            abort(422, 'MO tanpa anggota tidak bisa dikirim.');
        }

        return DB::transaction(function () use ($mo, $actor) {
            $mo->review_status = 'menunggu_review';
            $mo->catatan_penolakan = null;
            $mo->reviewed_by = null;
            $mo->reviewed_at = null;
            $mo->save();

            $ids = $mo->moDetail()->pluck('transaksi_pengolahan_id');
            TransaksiPengolahan::whereIn('id_pengolahan', $ids)->update(['current_stage' => 'pengadaan']);

            $this->auditLog->logManyPengolahan($actor, 'kirim_mo', $ids, [
                'pengolahan_mo_id' => $mo->id,
                'no_mo' => $mo->no_mo,
            ]);

            $this->notifikasi->kirimKeRole(['pengadaan'], $actor, 'dikirim', 'MO dikirim ke Pengadaan',
                "MO {$mo->no_mo} dikirim ke Pengadaan.", $ids->first(),
                ['modul' => 'pengolahan', 'pengolahan_mo_id' => $mo->id, 'no_mo' => $mo->no_mo]);

            return $mo->fresh('moDetail');
        });
    }

    /**
     * Membatalkan MO WAJIB menghapus baris mo_detail-nya.
     *
     * Kalau baris itu ditinggal, transaksi anggotanya akan menabrak indeks unik
     * mo_detail.transaksi_pengolahan_id saat digabung ulang -- ia terlihat "masih anggota MO"
     * padahal MO-nya sudah mati. Modul PO pernah punya bug berbentuk persis ini; lihat komentar
     * di PoGroupingService::gabungkanPo pada cabang status 'dibatalkan'.
     */
    public function batalkan(PengolahanMo $mo, User $actor): PengolahanMo
    {
        if ($mo->status === 'dibatalkan') {
            abort(422, 'MO ini sudah dibatalkan.');
        }

        if ($mo->status === 'lengkap') {
            abort(422, 'MO yang sudah lengkap tidak bisa dibatalkan.');
        }

        return DB::transaction(function () use ($mo, $actor) {
            $ids = $mo->moDetail()->pluck('transaksi_pengolahan_id');

            $mo->moDetail()->delete();
            $mo->status = 'dibatalkan';
            $mo->review_status = 'draft';
            $mo->save();

            TransaksiPengolahan::whereIn('id_pengolahan', $ids)->update(['current_stage' => 'operasi']);

            $this->auditLog->logManyPengolahan($actor, 'batalkan_mo', $ids, [
                'pengolahan_mo_id' => $mo->id,
                'no_mo' => $mo->no_mo,
            ]);

            return $mo->fresh('moDetail');
        });
    }

    /**
     * Semua anggota harus berada di tahap operasi, datanya sudah diterima, dan satu makloon.
     *
     * @param  list<string>  $ids
     * @return array{makloon_user_id:int,total_hgl:float,total_gabah:float,anggota:array<string,array{hgl:float,gabah:float}>}
     */
    private function validasiAnggota(array $ids, ?int $moIdSaatIni = null): array
    {
        $transaksiList = TransaksiPengolahan::whereIn('id_pengolahan', $ids)
            ->lockForUpdate()
            ->get()
            ->keyBy('id_pengolahan');

        if ($transaksiList->count() !== count(array_unique($ids))) {
            abort(422, 'Salah satu LHPK tidak ditemukan.');
        }

        $makloonId = null;
        $anggota = [];

        foreach ($ids as $id) {
            $transaksi = $transaksiList[$id];

            if ($transaksi->current_stage !== 'operasi') {
                abort(422, "Pengolahan {$id} belum berada di tahap Operasi.");
            }

            $tahapTerakhir = PengolahanStages::tahapDataTerakhir($transaksi->skema);
            $record = $tahapTerakhir['model']::where('transaksi_pengolahan_id', $id)->first();
            if (! $record || $record->status !== 'diterima') {
                abort(422, "Data {$tahapTerakhir['role']} pengolahan {$id} belum diterima Operasi.");
            }

            // Indeks unik pada mo_detail sudah menjamin ini, tapi cek eksplisit memberi pesan
            // yang bisa dibaca orang alih-alih error integritas dari driver.
            $adaDiMoLain = PengolahanMoDetail::where('transaksi_pengolahan_id', $id)
                ->when($moIdSaatIni, fn ($q) => $q->where('pengolahan_mo_id', '!=', $moIdSaatIni))
                ->exists();
            if ($adaDiMoLain) {
                abort(422, "Pengolahan {$id} sudah tergabung di MO lain.");
            }

            if ($makloonId === null) {
                $makloonId = (int) $transaksi->makloon_user_id;
            } elseif ($makloonId !== (int) $transaksi->makloon_user_id) {
                abort(422, 'LHPK yang dipilih bukan dari makloon yang sama.');
            }

            $lhpk = PengolahanLhpk::where('transaksi_pengolahan_id', $id)->first();

            $anggota[$id] = [
                'hgl' => (float) ($lhpk->kuantum_beras_hgl ?? 0),
                'gabah' => (float) ($lhpk->kuantum_gabah_diolah ?? 0),
            ];
        }

        return [
            'makloon_user_id' => $makloonId,
            'total_hgl' => array_sum(array_column($anggota, 'hgl')),
            'total_gabah' => array_sum(array_column($anggota, 'gabah')),
            'anggota' => $anggota,
        ];
    }
}
