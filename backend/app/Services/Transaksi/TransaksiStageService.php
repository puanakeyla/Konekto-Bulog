<?php

namespace App\Services\Transaksi;

use App\Models\Transaksi;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class TransaksiStageService
{
    public function createTransaksi(User $creator): Transaksi
    {
        $role = $creator->role->nama_role;
        $skema = match ($role) {
            'jemput_pangan' => 'TJP',
            'makloon' => 'MPP',
            default => abort(403, 'Role tidak dapat membuat transaksi baru.'),
        };

        return DB::transaction(function () use ($creator, $skema) {
            $firstStage = TransaksiStages::stageAt($skema, 0);

            return Transaksi::create([
                'id_transaksi' => $this->generateIdTransaksi($skema),
                'skema' => $skema,
                'current_stage' => $firstStage['role'],
                'status_keseluruhan' => 'berjalan',
                'created_by' => $creator->id,
            ]);
        });
    }

    public function submitStage(Transaksi $transaksi, User $actor, string $role, string $modelClass, array $data): Model
    {
        $this->assertActorRole($actor, $role);

        if ($transaksi->current_stage !== $role) {
            abort(422, 'Transaksi bukan sedang berada di tahap ini.');
        }

        $index = TransaksiStages::indexOfRole($transaksi->skema, $role);
        if ($index === null) {
            abort(422, 'Tahap tidak dikenal untuk skema ini.');
        }

        if ($index > 0) {
            $prevStage = TransaksiStages::stageAt($transaksi->skema, $index - 1);
            $prevRecord = $prevStage['model']::where('transaksi_id', $transaksi->id_transaksi)->first();
            if (! $prevRecord || $prevRecord->status !== 'diterima') {
                abort(422, 'Data tahap sebelumnya belum diterima.');
            }
        }

        $record = $modelClass::firstOrNew(['transaksi_id' => $transaksi->id_transaksi]);

        if (in_array($record->status, ['menunggu_review', 'diterima'], true)) {
            abort(422, 'Data tahap ini sudah dikirim dan tidak dapat diubah.');
        }

        return DB::transaction(function () use ($record, $data, $transaksi, $actor, $index) {
            $record->fill($data);
            $record->transaksi_id = $transaksi->id_transaksi;
            $record->status = 'menunggu_review';
            $record->submitted_by = $actor->id;
            $record->submitted_at = now();
            $record->save();

            $next = TransaksiStages::stageAt($transaksi->skema, $index + 1);
            if ($next) {
                $transaksi->current_stage = $next['role'];
                $transaksi->save();
            }

            return $record;
        });
    }

    public function terima(Transaksi $transaksi, User $actor): Model
    {
        [$index, $prevStage, $record] = $this->pendingReview($transaksi, $actor);

        $record->status = 'diterima';
        $record->locked_at = now();
        $record->locked_by = $actor->id;
        $record->save();

        return $record;
    }

    public function tolak(Transaksi $transaksi, User $actor, string $catatan): Model
    {
        [$index, $prevStage, $record] = $this->pendingReview($transaksi, $actor);

        $record->status = 'ditolak';
        $record->catatan_penolakan = $catatan;
        $record->save();

        $transaksi->current_stage = $prevStage['role'];
        $transaksi->save();

        return $record;
    }

    private function pendingReview(Transaksi $transaksi, User $actor): array
    {
        $this->assertActorRole($actor, $transaksi->current_stage);

        $index = TransaksiStages::indexOfRole($transaksi->skema, $transaksi->current_stage);
        if ($index === null || $index === 0) {
            abort(422, 'Tidak ada data tahap sebelumnya untuk direview.');
        }

        $prevStage = TransaksiStages::stageAt($transaksi->skema, $index - 1);
        $record = $prevStage['model']::where('transaksi_id', $transaksi->id_transaksi)->first();

        if (! $record || $record->status !== 'menunggu_review') {
            abort(422, 'Tidak ada data yang menunggu review saat ini.');
        }

        return [$index, $prevStage, $record];
    }

    private function assertActorRole(User $actor, string $expectedRole): void
    {
        $actorRole = $actor->role->nama_role;
        if ($actorRole !== $expectedRole && $actorRole !== 'admin') {
            abort(403, 'Anda tidak berwenang melakukan aksi ini.');
        }
    }

    private function generateIdTransaksi(string $skema): string
    {
        $month = (int) now()->format('m');
        $year = (int) now()->format('Y');

        $count = Transaksi::where('skema', $skema)
            ->whereYear('created_at', $year)
            ->whereMonth('created_at', $month)
            ->lockForUpdate()
            ->count();

        return sprintf('%05d/%02d/%04d/%s', $count + 1, $month, $year, $skema);
    }
}
