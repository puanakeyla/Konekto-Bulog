<?php

namespace App\Services\Transaksi;

use App\Models\NomorUrutTransaksi;
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

    /**
     * Nomor urut diambil dari counter atomik per (skema, tahun, bulan), bukan dari
     * count(created_at)+1 yang rawan race (dua create bersamaan bisa membaca angka sama)
     * dan ikut mengecil kalau ada transaksi dihapus/dibatalkan sehingga bisa memproduksi
     * id yang bertabrakan dengan yang sudah ada. Dipanggil di dalam DB::transaction milik
     * createTransaksi(), jadi lockForUpdate menahan baris counter sampai insert transaksi
     * commit -- request lain menunggu lalu membaca nilai terbaru.
     */
    private function generateIdTransaksi(string $skema): string
    {
        $month = (int) now()->format('m');
        $year = (int) now()->format('Y');

        // insertOrIgnore memastikan baris counter ada tanpa melempar exception kalau dua
        // request pertama di bulan itu sama-sama mencoba membuatnya (dijaga unique key).
        NomorUrutTransaksi::insertOrIgnore([
            'skema' => $skema,
            'tahun' => $year,
            'bulan' => $month,
            'urut' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $counter = NomorUrutTransaksi::where('skema', $skema)
            ->where('tahun', $year)
            ->where('bulan', $month)
            ->lockForUpdate()
            ->first();

        // Kalau counter baru dibuat (urut masih 0), selaraskan dengan nomor tertinggi yang
        // mungkin sudah ada -- mis. data lama yang dibuat sebelum counter ini diterapkan,
        // atau saat deploy ke DB yang sudah berisi transaksi. Tanpa ini, bulan yang sudah
        // punya transaksi akan mengulang 00001 dan bentrok PK. Hanya jalan sekali di awal
        // tiap (skema, bulan), di dalam lockForUpdate jadi tetap aman terhadap race.
        if ($counter->urut === 0) {
            $counter->urut = $this->nomorUrutTertinggiTerpakai($skema, $year, $month);
        }

        $counter->urut += 1;
        $counter->save();

        return sprintf('%05d/%02d/%04d/%s', $counter->urut, $month, $year, $skema);
    }

    /**
     * Nomor urut terbesar yang sudah terpakai untuk (skema, tahun, bulan) dari id_transaksi
     * yang ada. Prefix 5 digit di-zero-pad sehingga urutan leksikografis id sama dengan
     * urutan numerik untuk suffix yang identik -- cukup ambil id terbesar lalu baca prefix-nya.
     */
    private function nomorUrutTertinggiTerpakai(string $skema, int $year, int $month): int
    {
        $suffix = sprintf('/%02d/%04d/%s', $month, $year, $skema);

        $terakhir = Transaksi::where('id_transaksi', 'like', '%'.$suffix)
            ->orderByDesc('id_transaksi')
            ->value('id_transaksi');

        return $terakhir ? (int) substr($terakhir, 0, 5) : 0;
    }
}
