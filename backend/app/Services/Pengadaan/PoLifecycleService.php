<?php

namespace App\Services\Pengadaan;

use App\Models\DataGudang;
use App\Models\DataKeuangan;
use App\Models\DataOperasi;
use App\Models\DataPengadaan;
use App\Models\PoDetail;
use App\Models\Transaksi;
use Illuminate\Support\Facades\DB;

class PoLifecycleService
{
    /**
     * Keuangan -> Operasi -> Gudang beroperasi di level PO (data_pengadaan), sesuai relasi
     * hasOne yang sudah dikonfirmasi (satu PO -> satu data_operasi -> satu data_gudang).
     * current_stage tiap transaksi terkait (lewat po_detail) ikut dimajukan di tiap milestone,
     * mirip pola gabungkanPo() yang memajukan pengadaan -> keuangan.
     */
    public function updatePembayaran(DataPengadaan $dataPengadaan, string $statusBayar, ?string $tanggalBayar, ?string $noSpp): DataKeuangan
    {
        return DB::transaction(function () use ($dataPengadaan, $statusBayar, $tanggalBayar, $noSpp) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            if ($dataPengadaan->status !== 'lengkap') {
                abort(422, 'PO belum lengkap (semua nomor IN harus terisi) sebelum bisa diproses pembayaran.');
            }

            if ($noSpp !== null) {
                $dataPengadaan->no_spp = $noSpp;
                $dataPengadaan->save();
            }

            $dataKeuangan = DataKeuangan::firstOrNew(['data_pengadaan_id' => $dataPengadaan->id]);
            $statusSebelumnya = $dataKeuangan->status_bayar;

            $dataKeuangan->status_bayar = $statusBayar;
            $dataKeuangan->tanggal_bayar = $tanggalBayar;
            $dataKeuangan->save();

            if ($statusBayar === 'dibayarkan' && $statusSebelumnya !== 'dibayarkan') {
                $this->majukanTahapTransaksi($dataPengadaan->id, 'operasi');
            }

            return $dataKeuangan;
        });
    }

    public function inputOperasi(DataPengadaan $dataPengadaan, array $data): DataOperasi
    {
        return DB::transaction(function () use ($dataPengadaan, $data) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            $dataKeuangan = DataKeuangan::where('data_pengadaan_id', $dataPengadaan->id)->first();
            if (! $dataKeuangan || $dataKeuangan->status_bayar !== 'dibayarkan') {
                abort(422, 'PO ini belum dibayarkan, data Operasi belum bisa diisi.');
            }

            if (DataOperasi::where('data_pengadaan_id', $dataPengadaan->id)->exists()) {
                abort(422, 'Data Operasi untuk PO ini sudah ada.');
            }

            $dataOperasi = DataOperasi::create(array_merge($data, [
                'data_pengadaan_id' => $dataPengadaan->id,
            ]));

            $this->majukanTahapTransaksi($dataPengadaan->id, 'gudang');

            return $dataOperasi;
        });
    }

    public function inputGudang(DataOperasi $dataOperasi, array $data): DataGudang
    {
        return DB::transaction(function () use ($dataOperasi, $data) {
            $dataOperasi = DataOperasi::whereKey($dataOperasi->id)->lockForUpdate()->firstOrFail();

            if (DataGudang::where('data_operasi_id', $dataOperasi->id)->exists()) {
                abort(422, 'Data Gudang untuk data Operasi ini sudah ada.');
            }

            $dataGudang = DataGudang::create(array_merge($data, [
                'data_operasi_id' => $dataOperasi->id,
            ]));

            $transaksiIds = PoDetail::where('data_pengadaan_id', $dataOperasi->data_pengadaan_id)->pluck('transaksi_id');
            Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['status_keseluruhan' => 'selesai']);

            return $dataGudang;
        });
    }

    private function majukanTahapTransaksi(int $dataPengadaanId, string $stageBerikutnya): void
    {
        $transaksiIds = PoDetail::where('data_pengadaan_id', $dataPengadaanId)->pluck('transaksi_id');

        Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['current_stage' => $stageBerikutnya]);
    }
}
