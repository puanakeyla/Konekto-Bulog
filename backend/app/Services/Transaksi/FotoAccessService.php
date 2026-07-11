<?php

namespace App\Services\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\Transaksi;
use App\Models\User;
use App\Support\FieldVisibility;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class FotoAccessService
{
    /**
     * Bagian 3.3: hanya foto_surat_jalan milik Jemput Pangan (bukan foto_surat_jalan_paraf
     * milik Makloon TJP) yang dibatasi -- collection name keduanya sengaja dibuat berbeda
     * di Bagian 4 supaya pembedaan ini tidak ambigu.
     */
    public function resolveDanOtorisasi(Transaksi $transaksi, string $jenisFoto, User $viewer): ?Media
    {
        $model = $this->resolveModel($transaksi, $jenisFoto);

        if (! $model) {
            return null;
        }

        $media = $model->getFirstMedia($jenisFoto);

        if (! $media) {
            return null;
        }

        if ($jenisFoto === 'foto_surat_jalan' && $model instanceof DataJemputPangan) {
            $role = $viewer->role->nama_role;
            if (! FieldVisibility::bolehLihatDataSensitifJp($role)) {
                abort(403, 'Anda tidak berwenang melihat foto ini.');
            }
        }

        return $media;
    }

    /**
     * @return (Model&HasMedia)|null
     */
    private function resolveModel(Transaksi $transaksi, string $jenisFoto): (Model&HasMedia)|null
    {
        $candidateModels = $transaksi->skema === 'MPP'
            ? [DataMakloonMpp::class, DataUbJastasma::class]
            : [DataJemputPangan::class, DataMakloonTjp::class, DataUbJastasma::class];

        foreach ($candidateModels as $modelClass) {
            /** @var (Model&HasMedia)|null $record */
            $record = $modelClass::where('transaksi_id', $transaksi->id_transaksi)->first();

            if ($record && $record->getRegisteredMediaCollections()->pluck('name')->contains($jenisFoto)) {
                return $record;
            }
        }

        return null;
    }
}
