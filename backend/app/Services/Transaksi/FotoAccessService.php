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
use Illuminate\Support\Facades\URL;
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
        // Makloon hanya boleh menyentuh foto transaksinya sendiri. Tanpa ini, foto transaksi
        // makloon lain bisa diambil hanya dengan menebak id_transaksi yang berpola urut.
        if (! $transaksi->bolehDilihatOleh($viewer)) {
            return null;
        }

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
     * Signed URL berumur pendek ke route streaming. Satu tempat supaya penerbitan link
     * satuan (FotoController::link) dan link massal (daftarTersedia) tidak bisa menyimpang
     * soal masa berlaku maupun parameter yang ikut ditandatangani.
     */
    public function signedUrl(Media $media, ?string $conversion = null, bool $download = false): string
    {
        return URL::temporarySignedRoute('foto.stream', now()->addMinutes(5), array_filter([
            'media' => $media->id,
            'conversion' => $conversion,
            'download' => $download ? 1 : null,
        ]));
    }

    /**
     * Daftar foto yang BENAR-BENAR tersimpan untuk transaksi ini, sudah disaring per izin
     * peminta (foto_surat_jalan milik Jemput Pangan disembunyikan dari role yang tak berhak,
     * Bagian 3.3). Dipakai galeri dokumen di Rekap supaya hanya menampilkan slot yang ada.
     *
     * `thumb_url` ikut diterbitkan di sini supaya galeri tidak perlu menembak endpoint link
     * satu kali per foto (dulu 1 + N request, tiap request query ulang model tahapnya).
     * URL ukuran penuh tetap diminta saat diklik -- lebih jarang, dan selalu segar.
     *
     * @return list<array{jenis_foto: string, role: string, thumb_url: string}>
     */
    public function daftarTersedia(Transaksi $transaksi, User $viewer): array
    {
        if (! $transaksi->bolehDilihatOleh($viewer)) {
            return [];
        }

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

                $hasil[] = [
                    'jenis_foto' => $jenisFoto,
                    'role' => $modelRole[$modelClass],
                    'thumb_url' => $this->signedUrl($media, 'thumb'),
                ];
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
