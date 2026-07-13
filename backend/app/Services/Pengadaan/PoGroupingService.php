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
                PoDetail::create([
                    'data_pengadaan_id' => $dataPengadaan->id,
                    'transaksi_id' => $id,
                    'kuantum_kontribusi' => number_format((float) $row['kuantum'], 2, '.', ''),
                ]);

                // PO yang langsung dibatalkan tidak memajukan transaksi asalnya;
                // transaksi tetap di tahap Pengadaan agar bisa digabung ulang.
                if ($status !== 'dibatalkan') {
                    $row['transaksi']->current_stage = 'keuangan';
                    $row['transaksi']->save();
                }
            }

            return $dataPengadaan->load('poDetail');
        });
    }

    /**
     * Isi nomor IN per baris po_detail (Bagian 3.4: "saat proses IN, PO dipecah kembali
     * ke baris transaksi asalnya"). Hanya boleh selama PO belum 'lengkap'/'dibatalkan';
     * begitu semua baris terisi, status PO otomatis jadi 'lengkap'.
     */
    public function isiNomorIn(DataPengadaan $dataPengadaan, array $items): DataPengadaan
    {
        if (count($items) < 1) {
            abort(422, 'Isi minimal satu nomor IN.');
        }

        return DB::transaction(function () use ($dataPengadaan, $items) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            if ($dataPengadaan->status !== 'proses') {
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

            if (! $dataPengadaan->poDetail()->whereNull('no_in')->exists()) {
                $dataPengadaan->status = 'lengkap';
                $dataPengadaan->save();
            }

            return $dataPengadaan->fresh('poDetail');
        });
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
