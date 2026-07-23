<?php

namespace App\Services\Pengadaan;

use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\PoDetail;
use App\Models\Transaksi;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PoGroupingService
{
    /**
     * Gabungkan beberapa transaksi yang sudah diterima Pengadaan (Bagian 3.4) jadi satu PO:
     * dikelompokkan berdasarkan (tanggal_bongkar, id_pemasok, makloon_user_id), kuantum dijumlahkan,
     * dan tiap transaksi asal dicatat di po_detail untuk pemecahan saat proses IN nanti.
     */
    public function gabungkanPo(array $transaksiIds, string $noPo, User $actor, ?float $harga = null, string $status = 'proses'): DataPengadaan
    {
        if (count($transaksiIds) < 1) {
            abort(422, 'Pilih minimal satu transaksi untuk digabungkan.');
        }

        return DB::transaction(function () use ($transaksiIds, $noPo, $harga, $status) {
            $transaksiList = Transaksi::whereIn('id_transaksi', $transaksiIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id_transaksi');

            if ($transaksiList->count() !== count(array_unique($transaksiIds))) {
                abort(422, 'Salah satu transaksi tidak ditemukan.');
            }

            $rows = [];
            $groupKey = null;

            foreach ($transaksiIds as $id) {
                $transaksi = $transaksiList[$id];

                if ($transaksi->current_stage !== 'pengadaan') {
                    abort(422, "Transaksi {$id} belum berada di tahap Pengadaan.");
                }

                $ubJastasma = DataUbJastasma::where('transaksi_id', $id)->first();
                if (! $ubJastasma || $ubJastasma->status !== 'diterima') {
                    abort(422, "Data UB Jastasma transaksi {$id} belum diterima Pengadaan.");
                }

                $makloonData = $this->resolveMakloonData($transaksi);

                $key = [
                    'tanggal_bongkar' => (string) $makloonData['tanggal_bongkar'],
                    'id_pemasok' => $makloonData['id_pemasok'],
                    'makloon_user_id' => $makloonData['makloon_user_id'],
                ];

                if ($groupKey === null) {
                    $groupKey = $key;
                } elseif ($key !== $groupKey) {
                    abort(422, 'Transaksi yang dipilih tidak satu kelompok (tanggal bongkar/pemasok/makloon harus sama).');
                }

                $rows[$id] = [
                    'transaksi' => $transaksi,
                    'kuantum' => $makloonData['kuantum'],
                ];
            }

            $totalKuantum = array_sum(array_map(fn ($row) => (float) $row['kuantum'], $rows));
            $hargaValue = (float) ($harga ?? 6500);
            $totalHarga = $totalKuantum * $hargaValue;

            $dataPengadaan = DataPengadaan::create([
                'tanggal_bongkar' => $groupKey['tanggal_bongkar'],
                'id_pemasok' => $groupKey['id_pemasok'],
                'makloon_user_id' => $groupKey['makloon_user_id'],
                'total_kuantum' => number_format($totalKuantum, 2, '.', ''),
                'harga' => number_format($hargaValue, 2, '.', ''),
                'total_harga' => number_format($totalHarga, 2, '.', ''),
                'no_po' => $noPo,
                'status' => $status,
            ]);

            foreach ($rows as $id => $row) {
                // PO yang langsung dibatalkan tidak memajukan transaksi asalnya dan tidak
                // mencatat keanggotaan sama sekali; transaksi tetap di tahap Pengadaan agar
                // bisa digabung ulang. Meninggalkan baris po_detail di sini akan membuat
                // transaksi itu jadi anggota DUA PO setelah digabung ulang, melanggar asumsi
                // "satu transaksi paling banyak satu PO" yang dipakai pengurutan rekap
                // (kunci grup = id_transaksi terkecil antar anggota PO) dan kolom No. PO.
                // Jalur pembatalan menyusul di PengadaanController::update() juga menghapus
                // baris-baris ini, jadi keduanya kini konsisten.
                if ($status === 'dibatalkan') {
                    continue;
                }

                PoDetail::create([
                    'data_pengadaan_id' => $dataPengadaan->id,
                    'transaksi_id' => $id,
                    'kuantum_kontribusi' => number_format((float) $row['kuantum'], 2, '.', ''),
                ]);

                $row['transaksi']->current_stage = 'pengadaan';
                $row['transaksi']->save();
            }

            return $dataPengadaan->load('poDetail');
        });
    }

    /**
     * Ubah anggota PO yang sudah dibuat (fitur "Kembali ke PO" -> pilih ulang transaksi) tanpa
     * mengganti No. PO. Set transaksi baru harus satu kelompok, sudah diterima UB Jastasma, dan
     * belum tergabung di PO lain. Transaksi yang dilepas kembali tersedia untuk digabung ulang.
     * Total kuantum & harga dihitung ulang. Hanya boleh selama PO belum lengkap/dibatalkan/diterima.
     *
     * @param  list<string>  $transaksiIds
     */
    public function ubahAnggota(DataPengadaan $dataPengadaan, array $transaksiIds, ?float $harga = null, ?string $noPo = null): DataPengadaan
    {
        if (count($transaksiIds) < 1) {
            abort(422, 'Pilih minimal satu transaksi untuk PO.');
        }

        if ($dataPengadaan->status === 'dibatalkan' || $dataPengadaan->status === 'lengkap' || $dataPengadaan->review_status === 'diterima') {
            abort(422, 'PO ini sudah final dan anggotanya tidak bisa diubah lagi.');
        }

        return DB::transaction(function () use ($dataPengadaan, $transaksiIds, $harga, $noPo) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            $transaksiList = Transaksi::whereIn('id_transaksi', $transaksiIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id_transaksi');

            if ($transaksiList->count() !== count(array_unique($transaksiIds))) {
                abort(422, 'Salah satu transaksi tidak ditemukan.');
            }

            $anggotaSaatIni = $dataPengadaan->poDetail()->pluck('transaksi_id')->all();

            $rows = [];
            $groupKey = null;

            foreach ($transaksiIds as $id) {
                $transaksi = $transaksiList[$id];

                if ($transaksi->current_stage !== 'pengadaan') {
                    abort(422, "Transaksi {$id} belum berada di tahap Pengadaan.");
                }

                $ubJastasma = DataUbJastasma::where('transaksi_id', $id)->first();
                if (! $ubJastasma || $ubJastasma->status !== 'diterima') {
                    abort(422, "Data UB Jastasma transaksi {$id} belum diterima Pengadaan.");
                }

                $adaDiPoLain = PoDetail::where('transaksi_id', $id)
                    ->where('data_pengadaan_id', '!=', $dataPengadaan->id)
                    ->exists();
                if ($adaDiPoLain) {
                    abort(422, "Transaksi {$id} sudah tergabung di PO lain.");
                }

                $makloonData = $this->resolveMakloonData($transaksi);

                $key = [
                    'tanggal_bongkar' => (string) $makloonData['tanggal_bongkar'],
                    'id_pemasok' => $makloonData['id_pemasok'],
                    'makloon_user_id' => $makloonData['makloon_user_id'],
                ];

                if ($groupKey === null) {
                    $groupKey = $key;
                } elseif ($key !== $groupKey) {
                    abort(422, 'Transaksi yang dipilih tidak satu kelompok (tanggal bongkar/pemasok/makloon harus sama).');
                }

                $rows[$id] = $makloonData['kuantum'];
            }

            // Lepas anggota yang tidak lagi dipilih: baris po_detail dihapus, transaksi tetap di
            // tahap 'pengadaan' sehingga otomatis muncul lagi sebagai kandidat gabung.
            $dilepas = array_diff($anggotaSaatIni, $transaksiIds);
            if (! empty($dilepas)) {
                $dataPengadaan->poDetail()->whereIn('transaksi_id', $dilepas)->delete();
            }

            // Tambah anggota baru.
            foreach ($transaksiIds as $id) {
                if (! in_array($id, $anggotaSaatIni, true)) {
                    PoDetail::create([
                        'data_pengadaan_id' => $dataPengadaan->id,
                        'transaksi_id' => $id,
                        'kuantum_kontribusi' => number_format((float) $rows[$id], 2, '.', ''),
                    ]);
                    $transaksiList[$id]->current_stage = 'pengadaan';
                    $transaksiList[$id]->save();
                }
            }

            $totalKuantum = array_sum(array_map(fn ($kuantum) => (float) $kuantum, $rows));
            $hargaValue = $harga ?? (float) $dataPengadaan->harga;

            $dataPengadaan->total_kuantum = number_format($totalKuantum, 2, '.', '');
            $dataPengadaan->harga = number_format($hargaValue, 2, '.', '');
            $dataPengadaan->total_harga = number_format($totalKuantum * $hargaValue, 2, '.', '');
            if ($noPo !== null) {
                $dataPengadaan->no_po = $noPo;
            }
            $dataPengadaan->save();

            return $dataPengadaan->fresh('poDetail');
        });
    }

    /**
     * Isi nomor IN per baris po_detail (Bagian 3.4: "saat proses IN, PO dipecah kembali
     * ke baris transaksi asalnya"). Hanya boleh selama PO belum 'lengkap'/'dibatalkan';
     * begitu semua baris terisi, status PO otomatis jadi 'lengkap'.
     */
    public function isiNomorIn(DataPengadaan $dataPengadaan, array $items, ?string $noSpp = null, ?string $status = null): DataPengadaan
    {
        if (count($items) < 1) {
            abort(422, 'Isi minimal satu nomor IN.');
        }

        return DB::transaction(function () use ($dataPengadaan, $items, $noSpp, $status) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            if ($dataPengadaan->status === 'dibatalkan' || ($dataPengadaan->status === 'lengkap' && $dataPengadaan->review_status !== 'ditolak')) {
                abort(422, 'PO sudah lengkap atau dibatalkan, nomor IN tidak bisa diubah.');
            }

            $noInList = array_column($items, 'no_in');
            if (count($noInList) !== count(array_unique($noInList))) {
                abort(422, 'Nomor IN tidak boleh duplikat dalam satu request.');
            }

            $poDetailIds = array_column($items, 'po_detail_id');
            $poDetails = PoDetail::whereIn('id', $poDetailIds)
                ->where('data_pengadaan_id', $dataPengadaan->id)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            if ($poDetails->count() !== count(array_unique($poDetailIds))) {
                abort(422, 'Salah satu po_detail tidak ditemukan pada PO ini.');
            }

            $dipakaiBarisLain = PoDetail::whereIn('no_in', $noInList)
                ->whereNotIn('id', $poDetailIds)
                ->exists();
            if ($dipakaiBarisLain) {
                abort(422, 'Salah satu nomor IN sudah dipakai baris lain.');
            }

            foreach ($items as $item) {
                $poDetails[$item['po_detail_id']]->update(['no_in' => $item['no_in']]);
            }

            if ($noSpp !== null) {
                $dataPengadaan->no_spp = $noSpp;
            }

            if ($status !== null) {
                $dataPengadaan->status = $status;
            }

            if ($dataPengadaan->status === 'lengkap' && ($dataPengadaan->no_spp === null || trim((string) $dataPengadaan->no_spp) === '')) {
                abort(422, 'No. SPP wajib diisi sebelum status PO menjadi lengkap.');
            }

            if ($dataPengadaan->status === 'dibatalkan') {
                $this->majukanTahapTransaksi($dataPengadaan->id, 'pengadaan');
                $dataPengadaan->poDetail()->delete();
                $dataPengadaan->save();

                return $dataPengadaan->fresh('poDetail');
            }

            if (! $dataPengadaan->poDetail()->whereNull('no_in')->exists() && $dataPengadaan->no_spp !== null && $dataPengadaan->status === 'lengkap') {
                $this->resetReview($dataPengadaan);

                $this->majukanTahapTransaksi($dataPengadaan->id, 'keuangan');
            }

            $dataPengadaan->save();

            return $dataPengadaan->fresh('poDetail');
        });
    }

    private function resetReview(DataPengadaan $dataPengadaan): void
    {
        $dataPengadaan->review_status = 'menunggu_review';
        $dataPengadaan->catatan_penolakan = null;
        $dataPengadaan->reviewed_by = null;
        $dataPengadaan->reviewed_at = null;
    }

    private function majukanTahapTransaksi(int $dataPengadaanId, string $stageBerikutnya): void
    {
        $transaksiIds = PoDetail::where('data_pengadaan_id', $dataPengadaanId)->pluck('transaksi_id');

        Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['current_stage' => $stageBerikutnya]);
    }

    private function resolveMakloonData(Transaksi $transaksi): array
    {
        if ($transaksi->skema === 'MPP') {
            $data = $transaksi->dataMakloonMpp;

            return [
                'tanggal_bongkar' => $data->tanggal_bongkar,
                'id_pemasok' => $data->id_pemasok,
                'makloon_user_id' => $transaksi->created_by,
                'kuantum' => $data->kuantum,
            ];
        }

        $jemputPangan = $transaksi->dataJemputPangan;
        $makloonTjp = $transaksi->dataMakloonTjp;

        return [
            'tanggal_bongkar' => $makloonTjp->tanggal_bongkar,
            'id_pemasok' => $jemputPangan->id_pemasok,
            'makloon_user_id' => $jemputPangan->makloon_user_id,
            'kuantum' => $makloonTjp->kuantum_bongkar,
        ];
    }
}
