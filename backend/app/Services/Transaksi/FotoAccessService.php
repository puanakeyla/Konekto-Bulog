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
     * Daftar foto yang BENAR-BENAR tersimpan untuk transaksi ini, sudah disaring per izin
     * peminta (foto_surat_jalan milik Jemput Pangan disembunyikan dari role yang tak berhak,
     * Bagian 3.3). Dipakai galeri dokumen di Rekap supaya hanya menampilkan slot yang ada.
     *
     * @return list<array{jenis_foto: string, role: string}>
     */
    public function daftarTersedia(Transaksi $transaksi, User $viewer): array
    {
        $role = $viewer->role->nama_role;

        // model tahap -> role pemilik foto (untuk badge di UI).
        $modelRole = [
            DataJemputPangan::class => 'jemput_pangan',
            DataMakloonTjp::class => 'makloon',
            DataMakloonMpp::class => 'makloon',
            DataUbJastasma::class => 'ub_jastasma',
        ];

        $candidateModels = $transaksi->skema === 'MPP'
            ? [DataMakloonMpp::class, DataUbJastasma::class]
            : [DataJemputPangan::class, DataMakloonTjp::class, DataUbJastasma::class];

        $hasil = [];

        foreach ($candidateModels as $modelClass) {
            /** @var (Model&HasMedia)|null $record */
            $record = $modelClass::where('transaksi_id', $transaksi->id_transaksi)->with('media')->first();

            if (! $record) {
                continue;
            }

            foreach ($record->media as $media) {
                $jenisFoto = $media->collection_name;

                // Batasan sama seperti resolveDanOtorisasi: hanya foto_surat_jalan milik JP
                // yang dibatasi, bukan milik Makloon MPP.
                if ($jenisFoto === 'foto_surat_jalan'
                    && $record instanceof DataJemputPangan
                    && ! FieldVisibility::bolehLihatDataSensitifJp($role)) {
                    continue;
                }

                $hasil[] = ['jenis_foto' => $jenisFoto, 'role' => $modelRole[$modelClass]];
            }
        }

        return $hasil;
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
