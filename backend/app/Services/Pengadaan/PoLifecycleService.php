<?php

namespace App\Services\Pengadaan;

use App\Models\DataKeuangan;
use App\Models\DataPengadaan;
use Illuminate\Support\Facades\DB;

class PoLifecycleService
{
    /**
     * Pembayaran PO oleh Keuangan (level PO). Keuangan adalah tahap TERAKHIR timeline transaksi
     * (TJP/MPP berhenti di Keuangan). Operasi & Gudang bukan kelanjutan timeline ini.
     *
     * Pelunasan TIDAK menandai transaksi selesai: penutupnya adalah Status Sergab 'lengkap' dari
     * Pengadaan (PengadaanController::update). Pembayaran dan Sergab berjalan paralel setelah
     * No. SPP mengirim PO ke Keuangan, jadi keduanya tidak boleh saling menunggu.
     */
    public function updatePembayaran(DataPengadaan $dataPengadaan, string $statusBayar, ?string $tanggalBayar, ?string $noSpp): DataKeuangan
    {
        return DB::transaction(function () use ($dataPengadaan, $statusBayar, $tanggalBayar, $noSpp) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            if ($dataPengadaan->review_status !== 'diterima') {
                abort(422, 'Data Pengadaan belum diterima Keuangan.');
            }

            if ($noSpp !== null) {
                $dataPengadaan->no_spp = $noSpp;
            }

            $dataPengadaan->save();

            $dataKeuangan = DataKeuangan::firstOrNew(['data_pengadaan_id' => $dataPengadaan->id]);
            if ($dataKeuangan->exists && $dataKeuangan->review_status === 'diterima') {
                abort(422, 'Data Keuangan sudah diterima dan tidak dapat diubah.');
            }

            $dataKeuangan->status_bayar = $statusBayar;

            // Hanya ditimpa saat benar-benar dikirim nilainya. Simpan draft yang hanya mengubah
            // No. SPP mengirim tanggal_bayar = null; menulisnya apa adanya akan menghapus tanggal
            // yang sudah tersimpan tanpa pengguna memintanya. Validasi request sudah mewajibkan
            // tanggal saat status_bayar = 'dibayarkan', jadi jalur pelunasan tidak pernah null.
            if ($tanggalBayar !== null) {
                $dataKeuangan->tanggal_bayar = $tanggalBayar;
            }
            $this->resetReview($dataKeuangan);
            if ($statusBayar === 'dibayarkan') {
                $dataKeuangan->review_status = 'diterima';
                $dataKeuangan->reviewed_at = now();
            }
            $dataKeuangan->save();

            return $dataKeuangan;
        });
    }

    /**
     * Pembayaran yang disimpan tapi belum dilunasi = draft, bukan 'menunggu_review' -- Keuangan
     * adalah tahap terakhir, tidak ada siapa pun yang akan mereview baris ini. Cabang
     * 'dibayarkan' di updatePembayaran() menimpanya jadi 'diterima'.
     */
    private function resetReview($record): void
    {
        $record->review_status = 'draft';
        $record->catatan_penolakan = null;
        $record->reviewed_by = null;
        $record->reviewed_at = null;
    }
}
