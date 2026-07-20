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
     * Pembayaran PO oleh Keuangan (level PO). Keuangan adalah tahap TERAKHIR timeline transaksi
     * (TJP/MPP berhenti di Keuangan). Begitu PO dibayar penuh, seluruh transaksi anggotanya
     * ditandai status_keseluruhan = 'selesai'. Operasi & Gudang bukan kelanjutan timeline ini —
     * keduanya kini bagian dari modul Pengolahan terpisah.
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
            if ($statusBayar === 'dibayarkan') {
                $dataKeuangan->review_status = 'diterima';
                $dataKeuangan->reviewed_at = now();
            }
            $dataKeuangan->save();

            if ($statusBayar === 'dibayarkan' && ($statusSebelumnya !== 'dibayarkan' || $dataKeuangan->wasChanged('review_status'))) {
                $this->selesaikanTransaksi($dataPengadaan->id);
            }

            return $dataKeuangan;
        });
    }

    /**
     * Pembayaran penuh = akhir timeline transaksi. Seluruh transaksi anggota PO ditandai selesai;
     * current_stage dibiarkan di 'keuangan' (tahap terakhir) dan tidak lagi dimajukan ke Operasi.
     */
    private function selesaikanTransaksi(int $dataPengadaanId): void
    {
        $transaksiIds = PoDetail::where('data_pengadaan_id', $dataPengadaanId)->pluck('transaksi_id');

        Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['status_keseluruhan' => 'selesai']);
    }

    private function resetReview($record): void
    {
        $record->review_status = 'menunggu_review';
        $record->catatan_penolakan = null;
        $record->reviewed_by = null;
        $record->reviewed_at = null;
    }
}
