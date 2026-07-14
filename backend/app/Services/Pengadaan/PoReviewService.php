<?php

namespace App\Services\Pengadaan;

use App\Models\DataPengadaan;
use App\Models\DataKeuangan;
use App\Models\DataOperasi;
use App\Models\DataGudang;
use App\Models\PoDetail;
use App\Models\RiwayatPenolakan;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Support\Facades\DB;

class PoReviewService
{
    public function __construct(private AuditLogService $auditLog)
    {
    }

    public function terima(DataPengadaan $dataPengadaan, User $actor): array
    {
        return DB::transaction(function () use ($dataPengadaan, $actor) {
            [$role, $transaksiIds] = $this->reviewContext($dataPengadaan, $actor);

            if ($role === 'keuangan') {
                $this->acceptRecord($dataPengadaan, $actor);
                $stage = 'pengadaan';
            }
            elseif ($role === 'operasi') {
                $record = $dataPengadaan->dataKeuangan ?: abort(422, 'Data Keuangan belum ada.');
                $this->acceptRecord($record, $actor);
                $stage = 'keuangan';
            }
            elseif ($role === 'gudang') {
                $stage = $this->acceptGudangStage($dataPengadaan, $actor);
            } else {
                abort(403, 'Role ini tidak dapat mereview PO.');
            }

            $this->auditLog->logMany($actor, 'terima_po', $transaksiIds, [
                'data_pengadaan_id' => $dataPengadaan->id,
                'stage' => $stage,
                'review_stage' => $role,
            ]);

            return ['stage' => $stage, 'data_pengadaan' => $dataPengadaan->fresh(['dataKeuangan', 'poDetail.dataOperasi.dataGudang'])];
        });
    }

    public function tolak(DataPengadaan $dataPengadaan, User $actor, string $catatan): array
    {
        return DB::transaction(function () use ($dataPengadaan, $actor, $catatan) {
            [$role, $transaksiIds] = $this->reviewContext($dataPengadaan, $actor);
            [$stage, $records] = $this->rejectTargets($dataPengadaan, $role);

            foreach ($transaksiIds as $transaksiId) {
                RiwayatPenolakan::create([
                    'transaksi_id' => $transaksiId,
                    'tahap' => $stage,
                    'catatan' => $catatan,
                    'ditolak_oleh' => $actor->id,
                    'ditolak_pada' => now(),
                ]);
            }

            foreach ($records as $record) {
                $this->rejectRecord($record, $actor, $catatan);
            }

            Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['current_stage' => $stage]);

            $this->auditLog->logMany($actor, 'tolak_po', $transaksiIds, [
                'data_pengadaan_id' => $dataPengadaan->id,
                'stage' => $stage,
                'review_stage' => $role,
                'catatan' => $catatan,
            ]);

            return ['stage' => $stage, 'data_pengadaan' => $dataPengadaan->fresh(['dataKeuangan', 'poDetail.dataOperasi.dataGudang'])];
        });
    }

    private function reviewContext(DataPengadaan $dataPengadaan, User $actor): array
    {
        $role = $actor->role->nama_role;
        if ($role === 'admin') {
            $role = $this->currentPoStage($dataPengadaan);
        }

        $transaksiIds = $dataPengadaan->poDetail()->pluck('transaksi_id')->all();
        if ($transaksiIds === []) {
            abort(422, 'PO tidak memiliki transaksi.');
        }

        $stages = Transaksi::whereIn('id_transaksi', $transaksiIds)->pluck('current_stage')->unique();
        if ($stages->count() !== 1 || $stages->first() !== $role) {
            abort(422, 'PO bukan sedang berada di tahap review role ini.');
        }

        return [$role, $transaksiIds];
    }

    private function currentPoStage(DataPengadaan $dataPengadaan): string
    {
        $stage = Transaksi::whereIn(
            'id_transaksi',
            $dataPengadaan->poDetail()->pluck('transaksi_id')
        )->value('current_stage');

        return $stage ?: abort(422, 'PO tidak memiliki transaksi.');
    }

    private function rejectTargets(DataPengadaan $dataPengadaan, string $role): array
    {
        if ($role === 'keuangan') {
            return ['pengadaan', [$dataPengadaan]];
        }

        if ($role === 'operasi') {
            $record = $dataPengadaan->dataKeuangan ?: abort(422, 'Data Keuangan belum ada.');
            return ['keuangan', [$record]];
        }

        if ($role === 'gudang') {
            $records = $dataPengadaan->poDetail()->with('dataOperasi.dataGudang')->get()->map(fn ($detail) => $detail->dataOperasi)->filter();
            return ['operasi', $records->all()];
        }

        abort(403, 'Role ini tidak dapat menolak PO.');
    }

    private function acceptRecord($record, User $actor): void
    {
        $record->review_status = 'diterima';
        $record->reviewed_by = $actor->id;
        $record->reviewed_at = now();
        $record->catatan_penolakan = null;
        $record->save();
    }

    private function rejectRecord($record, User $actor, string $catatan): void
    {
        $record->review_status = 'ditolak';
        $record->reviewed_by = $actor->id;
        $record->reviewed_at = now();
        $record->catatan_penolakan = $catatan;
        $record->save();
    }

    private function acceptGudangStage(DataPengadaan $dataPengadaan, User $actor): string
    {
        $records = $dataPengadaan->poDetail()->with('dataOperasi')->get()->map(fn ($detail) => $detail->dataOperasi)->filter();
        if ($records->isEmpty()) {
            abort(422, 'Data Operasi belum ada.');
        }

        foreach ($records as $record) {
            $this->acceptRecord($record, $actor);
        }

        Transaksi::whereIn('id_transaksi', $dataPengadaan->poDetail()->pluck('transaksi_id'))->update(['current_stage' => 'gudang']);
        return 'operasi';
    }
}
