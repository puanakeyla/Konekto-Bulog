<?php

namespace App\Services\Pengolahan;

use App\Models\NomorUrutTransaksi;
use App\Models\RiwayatPenolakan;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\NotifikasiService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Padanan TransaksiStageService untuk rantai pengolahan.
 *
 * Sengaja kelas terpisah, bukan menggeneralisasi TransaksiStageService: yang terakhir memegang
 * alur SerGab yang sedang berjalan, dan menyentuhnya berarti mempertaruhkan produksi sekaligus
 * memaksimalkan konflik merge ke main. Ongkosnya duplikasi terkendali di berkas ini saja.
 */
class PengolahanStageService
{
    public function __construct(private AuditLogService $auditLog, private NotifikasiService $notifikasi)
    {
    }

    public function createTransaksi(User $creator, string $skema, int $makloonUserId): TransaksiPengolahan
    {
        if (! in_array($skema, PengolahanStages::SKEMA, true)) {
            abort(422, 'Skema pengolahan tidak dikenal.');
        }

        $role = $creator->role->nama_role;
        if ($role !== 'admin' && $role !== PengolahanStages::PEMBUAT[$skema]) {
            abort(403, 'Role Anda tidak dapat memulai skema pengolahan ini.');
        }

        return DB::transaction(function () use ($creator, $skema, $makloonUserId) {
            $firstStage = PengolahanStages::stageAt($skema, 0);

            $transaksi = TransaksiPengolahan::create([
                'id_pengolahan' => $this->generateId($skema),
                'skema' => $skema,
                'makloon_user_id' => $makloonUserId,
                'current_stage' => $firstStage['role'],
                'status_keseluruhan' => 'berjalan',
                'created_by' => $creator->id,
            ]);

            $this->auditLog->logPengolahan($creator, 'buat_pengolahan', $transaksi->id_pengolahan, [
                'skema' => $skema,
                'makloon_user_id' => $makloonUserId,
            ]);

            return $transaksi;
        });
    }

    public function saveDraft(TransaksiPengolahan $transaksi, User $actor, string $role, array $data): Model
    {
        [$index, $stage, $record] = $this->recordUntukDiisi($transaksi, $actor, $role);

        return DB::transaction(function () use ($record, $data, $transaksi, $actor, $role, $stage, $index) {
            unset($index, $stage);

            $record->fill($data);
            $record->transaksi_pengolahan_id = $transaksi->id_pengolahan;
            $record->status = 'draft';
            $record->submitted_by = null;
            $record->submitted_at = null;
            $record->save();

            $this->auditLog->logPengolahan($actor, 'simpan_draft_pengolahan', $transaksi->id_pengolahan, [
                'stage' => $role,
                'skema' => $transaksi->skema,
            ]);

            return $record;
        });
    }

    public function submitStage(TransaksiPengolahan $transaksi, User $actor, string $role, array $data): Model
    {
        [$index, $stage, $record] = $this->recordUntukDiisi($transaksi, $actor, $role);
        unset($stage);

        return DB::transaction(function () use ($record, $data, $transaksi, $actor, $index, $role) {
            $record->fill($data);
            $record->transaksi_pengolahan_id = $transaksi->id_pengolahan;
            $record->status = 'menunggu_review';
            $record->submitted_by = $actor->id;
            $record->submitted_at = now();
            $record->save();

            $this->auditLog->logPengolahan($actor, 'submit_stage_pengolahan', $transaksi->id_pengolahan, [
                'stage' => $role,
                'skema' => $transaksi->skema,
            ]);

            $next = PengolahanStages::stageAt($transaksi->skema, $index + 1);
            if ($next) {
                $transaksi->current_stage = $next['role'];
                $transaksi->save();

                $this->kirimNotifikasi(
                    [$next['role']],
                    $actor,
                    'dikirim',
                    'Pengolahan dikirim',
                    "Pengolahan {$transaksi->id_pengolahan} dikirim dari {$role} ke {$next['role']}.",
                    $transaksi,
                    ['stage' => $role, 'next_stage' => $next['role']],
                );
            }

            return $record;
        });
    }

    public function terima(TransaksiPengolahan $transaksi, User $actor): Model
    {
        [$prevStage, $record] = $this->pendingReview($transaksi, $actor);

        return DB::transaction(function () use ($transaksi, $actor, $prevStage, $record) {
            $record->status = 'diterima';
            $record->locked_at = now();
            $record->locked_by = $actor->id;
            $record->save();

            $this->auditLog->logPengolahan($actor, 'terima_pengolahan', $transaksi->id_pengolahan, [
                'stage' => $prevStage['role'],
                'review_stage' => $transaksi->current_stage,
            ]);

            $this->kirimNotifikasi(
                [$prevStage['role']],
                $actor,
                'diterima',
                'Data pengolahan diterima',
                "Data {$prevStage['role']} pengolahan {$transaksi->id_pengolahan} diterima.",
                $transaksi,
                ['stage' => $prevStage['role']],
            );

            return $record;
        });
    }

    public function tolak(TransaksiPengolahan $transaksi, User $actor, string $catatan): Model
    {
        [$prevStage, $record] = $this->pendingReview($transaksi, $actor);

        return DB::transaction(function () use ($transaksi, $actor, $catatan, $prevStage, $record) {
            RiwayatPenolakan::create([
                'pengolahan_id' => $transaksi->id_pengolahan,
                'tahap' => $prevStage['role'],
                'catatan' => $catatan,
                'ditolak_oleh' => $actor->id,
                'ditolak_pada' => now(),
            ]);

            $record->status = 'ditolak';
            $record->catatan_penolakan = $catatan;
            $record->save();

            $this->auditLog->logPengolahan($actor, 'tolak_pengolahan', $transaksi->id_pengolahan, [
                'stage' => $prevStage['role'],
                'review_stage' => $transaksi->current_stage,
                'catatan' => $catatan,
            ]);

            $this->kirimNotifikasi(
                [$prevStage['role']],
                $actor,
                'ditolak',
                'Data pengolahan ditolak',
                "Data {$prevStage['role']} pengolahan {$transaksi->id_pengolahan} ditolak: {$catatan}",
                $transaksi,
                ['stage' => $prevStage['role'], 'catatan' => $catatan],
            );

            $transaksi->current_stage = $prevStage['role'];
            $transaksi->save();

            return $record;
        });
    }

    /**
     * Record tahap yang sedang boleh diisi role ini, beserta posisinya di sequence.
     *
     * @return array{0:int,1:array,2:Model}
     */
    private function recordUntukDiisi(TransaksiPengolahan $transaksi, User $actor, string $role): array
    {
        if ($transaksi->current_stage !== $role) {
            abort(422, 'Transaksi bukan sedang berada di tahap ini.');
        }

        $index = PengolahanStages::indexOfRole($transaksi->skema, $role);
        if ($index === null) {
            abort(422, 'Tahap tidak dikenal untuk skema ini.');
        }

        $stage = PengolahanStages::stageAt($transaksi->skema, $index);
        $this->assertRole($actor, $stage['role']);

        // Tahap kedua baru boleh diisi setelah tahap pertama DITERIMA -- tanpa ini, penolakan
        // di tahap pertama bisa dilangkahi begitu saja.
        if ($index > 0) {
            $prev = PengolahanStages::stageAt($transaksi->skema, $index - 1);
            $prevRecord = $prev['model']::where('transaksi_pengolahan_id', $transaksi->id_pengolahan)->first();
            if (! $prevRecord || $prevRecord->status !== 'diterima') {
                abort(422, 'Data tahap sebelumnya belum diterima.');
            }
        }

        $record = $stage['model']::firstOrNew(['transaksi_pengolahan_id' => $transaksi->id_pengolahan]);

        if (in_array($record->status, ['menunggu_review', 'diterima'], true)) {
            abort(422, 'Data tahap ini sudah dikirim dan tidak dapat diubah.');
        }

        return [$index, $stage, $record];
    }

    /**
     * Tahap sebelumnya yang datanya sedang menunggu review oleh pemegang tahap saat ini.
     *
     * @return array{0:array,1:Model}
     */
    private function pendingReview(TransaksiPengolahan $transaksi, User $actor): array
    {
        $index = PengolahanStages::indexOfRole($transaksi->skema, $transaksi->current_stage);
        if ($index === null || $index === 0) {
            abort(422, 'Tidak ada data tahap sebelumnya untuk direview.');
        }

        $this->assertRole($actor, PengolahanStages::stageAt($transaksi->skema, $index)['role']);

        $prevStage = PengolahanStages::stageAt($transaksi->skema, $index - 1);
        if (($prevStage['model'] ?? null) === null) {
            abort(422, 'Tidak ada data tahap sebelumnya untuk direview.');
        }

        $record = $prevStage['model']::where('transaksi_pengolahan_id', $transaksi->id_pengolahan)->first();

        if (! $record || $record->status !== 'menunggu_review') {
            abort(422, 'Tidak ada data yang menunggu review saat ini.');
        }

        return [$prevStage, $record];
    }

    private function assertRole(User $actor, string $expectedRole): void
    {
        $actorRole = $actor->role->nama_role;
        if ($actorRole !== $expectedRole && $actorRole !== 'admin') {
            abort(403, 'Anda tidak berwenang melakukan aksi ini.');
        }
    }

    /**
     * Notifikasi rantai pengolahan menumpang kolom notifikasi.transaksi_id (string tanpa FK),
     * jadi penanda modul WAJIB ikut supaya klik notifikasi tidak mengarah ke halaman transaksi
     * SerGab yang id-nya kebetulan berformat mirip.
     */
    private function kirimNotifikasi(array $roles, User $actor, string $tipe, string $judul, string $pesan, TransaksiPengolahan $transaksi, array $data = []): void
    {
        $this->notifikasi->kirimKeRole($roles, $actor, $tipe, $judul, $pesan, $transaksi->id_pengolahan, [
            ...$data,
            'modul' => 'pengolahan',
            'skema' => $transaksi->skema,
        ]);
    }

    /**
     * Memakai counter atomik yang sama dengan alur SerGab (lihat TransaksiStageService::
     * generateIdTransaksi untuk alasan panjangnya). lockForUpdate menahan baris counter sampai
     * insert commit, jadi dua request bersamaan tidak bisa membaca angka yang sama.
     */
    private function generateId(string $skema): string
    {
        $month = (int) now()->format('m');
        $year = (int) now()->format('Y');

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

        if ($counter->urut === 0) {
            $suffix = sprintf('/%02d/%04d/%s', $month, $year, $skema);
            $terakhir = TransaksiPengolahan::where('id_pengolahan', 'like', '%'.$suffix)
                ->orderByDesc('id_pengolahan')
                ->value('id_pengolahan');

            $counter->urut = $terakhir ? (int) substr($terakhir, 0, 5) : 0;
        }

        $counter->urut += 1;
        $counter->save();

        return sprintf('%05d/%02d/%04d/%s', $counter->urut, $month, $year, $skema);
    }
}
