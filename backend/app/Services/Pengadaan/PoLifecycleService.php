<?php

namespace App\Services\Pengadaan;

use App\Models\DataKeuangan;
use App\Models\DataPengadaan;
use App\Models\PoDetail;
use App\Models\Transaksi;
use Illuminate\Support\Facades\DB;

class PoLifecycleService
{
    /**
     * Keuangan -> Operasi -> Pengadaan approve OUT -> Gudang. Pembayaran di level PO, sedangkan Operasi & Gudang
     * per IN (satu data_operasi per po_detail, satu data_gudang per data_operasi).
     * current_stage tiap transaksi terkait (lewat po_detail) baru dimajukan begitu SELURUH
     * IN pada PO tuntas di milestone tersebut, mirip pola isiNomorIn().
     */
    public function updatePembayaran(DataPengadaan $dataPengadaan, string $statusBayar, ?string $tanggalBayar, ?string $noSpp): DataKeuangan
    {
        return DB::transaction(function () use ($dataPengadaan, $statusBayar, $tanggalBayar, $noSpp) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            if ($dataPengadaan->status !== 'lengkap') {
                abort(422, 'PO belum lengkap (semua nomor IN harus terisi) sebelum bisa diproses pembayaran.');
            }

            if ($dataPengadaan->review_status !== 'diterima') {
                abort(422, 'Data Pengadaan belum diterima Keuangan.');
            }

            if ($noSpp !== null) {
                $dataPengadaan->no_spp = $noSpp;
                $dataPengadaan->save();
            }

            $dataKeuangan = DataKeuangan::firstOrNew(['data_pengadaan_id' => $dataPengadaan->id]);
            if ($dataKeuangan->exists && $dataKeuangan->review_status === 'diterima') {
                abort(422, 'Data Keuangan sudah diterima dan tidak dapat diubah.');
            }

            $statusSebelumnya = $dataKeuangan->status_bayar;

            $dataKeuangan->status_bayar = $statusBayar;
            $dataKeuangan->tanggal_bayar = $tanggalBayar;
            $this->resetReview($dataKeuangan);
            $dataKeuangan->save();

            if ($statusBayar === 'dibayarkan' && ($statusSebelumnya !== 'dibayarkan' || $dataKeuangan->wasChanged('review_status'))) {
                $this->majukanTahapTransaksi($dataPengadaan->id, 'operasi');
            }

            return $dataKeuangan;
        });
    }

    private function majukanTahapTransaksi(int $dataPengadaanId, string $stageBerikutnya): void
    {
        $transaksiIds = PoDetail::where('data_pengadaan_id', $dataPengadaanId)->pluck('transaksi_id');

        Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['current_stage' => $stageBerikutnya]);
    }

    private function resetReview($record): void
    {
        $record->review_status = 'menunggu_review';
        $record->catatan_penolakan = null;
        $record->reviewed_by = null;
        $record->reviewed_at = null;
    }
}
