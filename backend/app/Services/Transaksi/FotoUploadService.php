<?php

namespace App\Services\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\Transaksi;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class FotoUploadService
{
    private const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

    private const MAX_BYTES = 5 * 1024 * 1024;

    /**
     * Precondition (lihat diskusi locked_at): upload/ganti foto diperbolehkan selama
     * record tahap terkait sudah ada (baru dibuat lewat submitStage()) DAN belum
     * dikunci (locked_at masih null) -- ini mencakup submission pertama, retry
     * setelah sebagian foto gagal terupload, maupun resubmit setelah Tolak.
     * Admin bisa upload atas nama role manapun lewat parameter $roleOverride.
     */
    public function upload(Transaksi $transaksi, User $actor, string $jenisFoto, UploadedFile $file, ?string $roleOverride = null): Media
    {
        if (! in_array($file->getMimeType(), self::ALLOWED_MIME_TYPES, true)) {
            abort(422, 'Tipe file harus JPEG atau PNG.');
        }

        if ($file->getSize() > self::MAX_BYTES) {
            abort(422, 'Ukuran file maksimal 5MB.');
        }

        $role = $actor->role->nama_role;

        if ($roleOverride !== null) {
            if ($role !== 'admin') {
                abort(403, 'Hanya Admin yang boleh mengisi role secara eksplisit.');
            }
            $role = $roleOverride;
        }

        $model = $this->resolveTargetModel($transaksi, $role);

        if (! $model) {
            abort(422, "Tidak ada data {$role} untuk transaksi ini.");
        }

        if ($model->locked_at !== null) {
            abort(422, 'Data tahap ini sudah dikunci, foto tidak bisa diubah.');
        }

        $validCollections = $model->getRegisteredMediaCollections()->pluck('name');
        if (! $validCollections->contains($jenisFoto)) {
            abort(422, "jenis_foto '{$jenisFoto}' tidak dikenal untuk tahap ini.");
        }

        return $model->addMedia($file)->toMediaCollection($jenisFoto);
    }

    /**
     * @return (Model&HasMedia)|null
     */
    private function resolveTargetModel(Transaksi $transaksi, string $role): (Model&HasMedia)|null
    {
        return match ($role) {
            'jemput_pangan' => DataJemputPangan::where('transaksi_id', $transaksi->id_transaksi)->first(),
            'makloon' => $transaksi->skema === 'MPP'
                ? DataMakloonMpp::where('transaksi_id', $transaksi->id_transaksi)->first()
                : DataMakloonTjp::where('transaksi_id', $transaksi->id_transaksi)->first(),
            'ub_jastasma' => DataUbJastasma::where('transaksi_id', $transaksi->id_transaksi)->first(),
            default => null,
        };
    }
}
