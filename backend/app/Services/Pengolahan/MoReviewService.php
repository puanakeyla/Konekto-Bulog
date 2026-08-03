<?php

namespace App\Services\Pengolahan;

use App\Models\PengolahanMo;
use App\Models\RiwayatPenolakan;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\NotifikasiService;
use Illuminate\Support\Facades\DB;

/**
 * Review MO oleh Pengadaan, lalu pengisian Nomor OUT yang menutup rantai.
 *
 * Berpasangan dengan MoGroupingService seperti PoReviewService dengan PoGroupingService.
 */
class MoReviewService
{
    public function __construct(private AuditLogService $auditLog, private NotifikasiService $notifikasi)
    {
    }

    public function terima(PengolahanMo $mo, User $actor): PengolahanMo
    {
        $this->assertMenungguReview($mo);

        return DB::transaction(function () use ($mo, $actor) {
            $mo->review_status = 'diterima';
            $mo->catatan_penolakan = null;
            $mo->reviewed_by = $actor->id;
            $mo->reviewed_at = now();
            $mo->save();

            $ids = $mo->moDetail()->pluck('transaksi_pengolahan_id');

            $this->auditLog->logManyPengolahan($actor, 'terima_mo', $ids, [
                'pengolahan_mo_id' => $mo->id,
                'no_mo' => $mo->no_mo,
            ]);

            $this->notifikasi->kirimKeRole(['operasi'], $actor, 'diterima', 'MO diterima',
                "MO {$mo->no_mo} diterima Pengadaan.", $ids->first(),
                ['modul' => 'pengolahan', 'pengolahan_mo_id' => $mo->id, 'no_mo' => $mo->no_mo]);

            return $mo->fresh('moDetail');
        });
    }

    public function tolak(PengolahanMo $mo, User $actor, string $catatan): PengolahanMo
    {
        $this->assertMenungguReview($mo);

        return DB::transaction(function () use ($mo, $actor, $catatan) {
            $ids = $mo->moDetail()->pluck('transaksi_pengolahan_id');

            foreach ($ids as $id) {
                RiwayatPenolakan::create([
                    'pengolahan_id' => $id,
                    'tahap' => 'operasi',
                    'catatan' => $catatan,
                    'ditolak_oleh' => $actor->id,
                    'ditolak_pada' => now(),
                ]);
            }

            $mo->review_status = 'ditolak';
            $mo->catatan_penolakan = $catatan;
            $mo->reviewed_by = $actor->id;
            $mo->reviewed_at = now();
            $mo->save();

            // Anggota mundur ke Operasi supaya MO-nya bisa diperbaiki lalu dikirim ulang.
            TransaksiPengolahan::whereIn('id_pengolahan', $ids)->update(['current_stage' => 'operasi']);

            $this->auditLog->logManyPengolahan($actor, 'tolak_mo', $ids, [
                'pengolahan_mo_id' => $mo->id,
                'no_mo' => $mo->no_mo,
                'catatan' => $catatan,
            ]);

            $this->notifikasi->kirimKeRole(['operasi'], $actor, 'ditolak', 'MO ditolak',
                "MO {$mo->no_mo} ditolak Pengadaan: {$catatan}", $ids->first(),
                ['modul' => 'pengolahan', 'pengolahan_mo_id' => $mo->id, 'catatan' => $catatan]);

            return $mo->fresh('moDetail');
        });
    }

    /**
     * Nomor OUT satu per MO (berbeda dari Nomor IN di PO yang dipecah balik per anggota).
     * Mengisinya menutup seluruh transaksi anggotanya sekaligus.
     */
    public function isiOut(PengolahanMo $mo, User $actor, string $noOut, string $tanggalOut): PengolahanMo
    {
        if ($mo->status === 'dibatalkan') {
            abort(422, 'MO ini sudah dibatalkan.');
        }

        if ($mo->review_status !== 'diterima') {
            abort(422, 'MO harus diterima lebih dulu sebelum Nomor OUT diisi.');
        }

        return DB::transaction(function () use ($mo, $actor, $noOut, $tanggalOut) {
            $mo->no_out = $noOut;
            $mo->tanggal_out = $tanggalOut;
            $mo->status = 'lengkap';
            $mo->save();

            $ids = $mo->moDetail()->pluck('transaksi_pengolahan_id');
            TransaksiPengolahan::whereIn('id_pengolahan', $ids)->update(['status_keseluruhan' => 'selesai']);

            $this->auditLog->logManyPengolahan($actor, 'isi_out_mo', $ids, [
                'pengolahan_mo_id' => $mo->id,
                'no_mo' => $mo->no_mo,
                'no_out' => $noOut,
            ]);

            $this->notifikasi->kirimKeRole(['operasi', 'gudang', 'ub_jastasma'], $actor, 'diterima', 'Nomor OUT diterbitkan',
                "Nomor OUT {$noOut} diterbitkan untuk MO {$mo->no_mo}; pengolahannya ditandai selesai.", $ids->first(),
                ['modul' => 'pengolahan', 'pengolahan_mo_id' => $mo->id, 'no_out' => $noOut]);

            return $mo->fresh('moDetail');
        });
    }

    private function assertMenungguReview(PengolahanMo $mo): void
    {
        if ($mo->status === 'dibatalkan') {
            abort(422, 'MO ini sudah dibatalkan.');
        }

        if ($mo->review_status !== 'menunggu_review') {
            abort(422, 'Tidak ada MO yang menunggu review saat ini.');
        }
    }
}
