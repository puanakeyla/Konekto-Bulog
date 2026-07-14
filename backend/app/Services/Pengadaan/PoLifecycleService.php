<?php

namespace App\Services\Pengadaan;

use App\Models\DataGudang;
use App\Models\DataKeuangan;
use App\Models\DataOperasi;
use App\Models\DataPengadaan;
use App\Models\PoDetail;
use App\Models\Transaksi;
use Illuminate\Support\Collection;
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

    /**
     * Operasi membuat permintaan pengeluaran stok PER IN (per po_detail). PO harus sudah dibayarkan.
     * Data ini menunggu Pengadaan mengisi nomor OUT sebelum bisa masuk tahap Gudang.
     */
    public function inputOperasi(DataPengadaan $dataPengadaan, array $items): Collection
    {
        if (count($items) < 1) {
            abort(422, 'Isi minimal satu data Operasi.');
        }

        return DB::transaction(function () use ($dataPengadaan, $items) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            $dataKeuangan = DataKeuangan::where('data_pengadaan_id', $dataPengadaan->id)->first();
            if (! $dataKeuangan || $dataKeuangan->status_bayar !== 'dibayarkan') {
                abort(422, 'PO ini belum dibayarkan, data Operasi belum bisa diisi.');
            }

            $poDetails = $dataPengadaan->poDetail()->lockForUpdate()->get()->keyBy('id');

            $created = collect();
            foreach ($items as $item) {
                $poDetailId = $item['po_detail_id'];
                if (! $poDetails->has($poDetailId)) {
                    abort(422, "IN (po_detail {$poDetailId}) bukan bagian dari PO ini.");
                }
                if (DataOperasi::where('po_detail_id', $poDetailId)->exists()) {
                    abort(422, 'Data Operasi untuk salah satu IN sudah ada.');
                }

                $created->push(DataOperasi::create([
                    'po_detail_id' => $poDetailId,
                    'no_mo' => $item['no_mo'],
                    'no_tm' => $item['no_tm'],
                    'status_out' => 'menunggu_pengadaan',
                    'hgl_kg' => $item['hgl_kg'] ?? null,
                    'broken_kg' => $item['broken_kg'] ?? null,
                    'menir_kg' => $item['menir_kg'] ?? null,
                    'katul_kg' => $item['katul_kg'] ?? null,
                    'rendemen_persen' => $item['rendemen_persen'] ?? null,
                ]));
            }

            return $created;
        });
    }

    /**
     * Pengadaan menyetujui permintaan pengeluaran stok dengan mengisi nomor OUT per IN.
     * Begitu seluruh IN pada PO punya nomor OUT, transaksi dimajukan ke tahap Gudang.
     */
    public function approveNomorOut(DataPengadaan $dataPengadaan, array $items): Collection
    {
        if (count($items) < 1) {
            abort(422, 'Isi minimal satu nomor OUT.');
        }

        return DB::transaction(function () use ($dataPengadaan, $items) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();
            $poDetails = $dataPengadaan->poDetail()->with('dataOperasi')->lockForUpdate()->get()->keyBy('id');

            $noOutList = collect($items)->pluck('no_out')->map(fn ($value) => trim((string) $value));
            if ($noOutList->count() !== $noOutList->unique()->count()) {
                abort(422, 'Nomor OUT dalam satu request tidak boleh duplikat.');
            }

            $existing = DataOperasi::whereIn('no_out', $noOutList)
                ->whereNotNull('no_out')
                ->pluck('no_out');
            if ($existing->isNotEmpty()) {
                abort(422, 'Salah satu nomor OUT sudah dipakai.');
            }

            $approved = collect();
            foreach ($items as $item) {
                $poDetailId = $item['po_detail_id'];
                if (! $poDetails->has($poDetailId)) {
                    abort(422, "IN (po_detail {$poDetailId}) bukan bagian dari PO ini.");
                }

                $operasi = $poDetails[$poDetailId]->dataOperasi;
                if (! $operasi) {
                    abort(422, 'Permintaan OUT untuk salah satu IN belum dibuat Operasi.');
                }
                if ($operasi->status_out === 'disetujui' || $operasi->no_out !== null) {
                    abort(422, 'Nomor OUT untuk salah satu IN sudah disetujui.');
                }

                $operasi->update([
                    'no_out' => $item['no_out'],
                    'status_out' => 'disetujui',
                ]);

                $approved->push($operasi->fresh());
            }

            $totalDetail = $poDetails->count();
            $sudahOut = DataOperasi::whereIn('po_detail_id', $poDetails->keys())
                ->where('status_out', 'disetujui')
                ->whereNotNull('no_out')
                ->count();

            if ($sudahOut === $totalDetail) {
                $this->majukanTahapTransaksi($dataPengadaan->id, 'gudang');
            }

            return $approved;
        });
    }

    /**
     * Input data Gudang PER IN (per data_operasi) dalam satu batch. Tiap IN harus sudah punya
     * data Operasi. Begitu seluruh IN pada PO punya data Gudang, transaksi ditandai selesai.
     */
    public function inputGudang(DataPengadaan $dataPengadaan, array $items): Collection
    {
        if (count($items) < 1) {
            abort(422, 'Isi minimal satu data Gudang.');
        }

        return DB::transaction(function () use ($dataPengadaan, $items) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();

            $poDetails = $dataPengadaan->poDetail()->with('dataOperasi')->get()->keyBy('id');

            $created = collect();
            foreach ($items as $item) {
                $poDetailId = $item['po_detail_id'];
                if (! $poDetails->has($poDetailId)) {
                    abort(422, "IN (po_detail {$poDetailId}) bukan bagian dari PO ini.");
                }
                $operasi = $poDetails[$poDetailId]->dataOperasi;
                if (! $operasi) {
                    abort(422, 'Data Operasi salah satu IN belum diisi.');
                }
                if ($operasi->status_out !== 'disetujui' || $operasi->no_out === null) {
                    abort(422, 'Nomor OUT salah satu IN belum disetujui Pengadaan.');
                }
                if (DataGudang::where('data_operasi_id', $operasi->id)->exists()) {
                    abort(422, 'Data Gudang untuk salah satu IN sudah ada.');
                }

                $created->push(DataGudang::create([
                    'data_operasi_id' => $operasi->id,
                    'tanggal_masuk' => $item['tanggal_masuk'],
                    'nama_gudang' => $item['nama_gudang'],
                    'realisasi_hgl' => $item['realisasi_hgl'] ?? null,
                    'no_tm' => $item['no_tm'],
                ]));
            }

            $operasiIds = $poDetails->pluck('dataOperasi.id')->filter();
            $totalDetail = $poDetails->count();
            $sudahGudang = DataGudang::whereIn('data_operasi_id', $operasiIds)->count();
            if ($operasiIds->count() === $totalDetail && $sudahGudang === $totalDetail) {
                Transaksi::whereIn('id_transaksi', $poDetails->pluck('transaksi_id'))
                    ->update(['status_keseluruhan' => 'selesai']);
            }

            return $created;
        });
    }

    private function majukanTahapTransaksi(int $dataPengadaanId, string $stageBerikutnya): void
    {
        $transaksiIds = PoDetail::where('data_pengadaan_id', $dataPengadaanId)->pluck('transaksi_id');

        Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['current_stage' => $stageBerikutnya]);
    }
}
