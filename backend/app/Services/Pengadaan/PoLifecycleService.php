<?php

namespace App\Services\Pengadaan;

use App\Models\DataGudang;
use App\Models\DataKeuangan;
use App\Models\DataOperasi;
use App\Models\DataPengadaan;
use App\Models\PoDetail;
use App\Models\Transaksi;
use App\Models\User;
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
            if ($dataKeuangan->review_status !== 'diterima') {
                abort(422, 'Data Keuangan belum diterima Operasi.');
            }

            $poDetails = $dataPengadaan->poDetail()->lockForUpdate()->get()->keyBy('id');

            $created = collect();
            foreach ($items as $item) {
                $poDetailId = $item['po_detail_id'];
                if (! $poDetails->has($poDetailId)) {
                    abort(422, "IN (po_detail {$poDetailId}) bukan bagian dari PO ini.");
                }
                $operasi = DataOperasi::where('po_detail_id', $poDetailId)->first();
                if ($operasi && $operasi->review_status !== 'ditolak') {
                    abort(422, 'Data Operasi untuk salah satu IN sudah ada.');
                }

                $operasi ??= new DataOperasi(['po_detail_id' => $poDetailId]);
                $operasi->fill([
                    'no_mo' => $item['no_mo'],
                    'no_tm' => $item['no_tm'],
                    'no_out' => null,
                    'kuantum_out' => null,
                    'status_out' => 'menunggu_pengadaan',
                    'hgl_kg' => $item['hgl_kg'] ?? null,
                    'broken_kg' => $item['broken_kg'] ?? null,
                    'menir_kg' => $item['menir_kg'] ?? null,
                    'katul_kg' => $item['katul_kg'] ?? null,
                    'rendemen_persen' => $item['rendemen_persen'] ?? null,
                ]);
                $this->resetReview($operasi);
                $operasi->save();

                $created->push($operasi->fresh());
            }

            $totalDetail = $poDetails->count();
            $sudahOperasi = DataOperasi::whereIn('po_detail_id', $poDetails->keys())->count();
            if ($sudahOperasi === $totalDetail) {
                $this->majukanTahapTransaksi($dataPengadaan->id, 'pengadaan');
            }

            return $created;
        });
    }

    /**
     * Pengadaan menyetujui permintaan pengeluaran stok dengan mengisi nomor OUT per IN.
     * Begitu seluruh IN pada PO punya nomor OUT, transaksi dikembalikan ke Operasi untuk dilanjutkan ke Gudang.
     */
    public function approveNomorOut(DataPengadaan $dataPengadaan, array $items, ?User $actor = null): Collection
    {
        if (count($items) < 1) {
            abort(422, 'Isi minimal satu nomor OUT.');
        }

        return DB::transaction(function () use ($dataPengadaan, $items, $actor) {
            $dataPengadaan = DataPengadaan::whereKey($dataPengadaan->id)->lockForUpdate()->firstOrFail();
            $poDetails = $dataPengadaan->poDetail()->with('dataOperasi')->lockForUpdate()->get()->keyBy('id');
            $operasiIds = $poDetails->map(fn ($detail) => $detail->dataOperasi?->id)->filter()->values();

            $noOutList = collect($items)->pluck('no_out')->map(fn ($value) => trim((string) $value));
            if ($noOutList->count() !== $noOutList->unique()->count()) {
                abort(422, 'Nomor OUT dalam satu request tidak boleh duplikat.');
            }

            $existing = DataOperasi::whereIn('no_out', $noOutList)
                ->whereNotNull('no_out')
                ->whereNotIn('id', $operasiIds)
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
                if (($operasi->status_out === 'disetujui' || $operasi->no_out !== null) && $operasi->review_status !== 'ditolak') {
                    abort(422, 'Nomor OUT untuk salah satu IN sudah disetujui.');
                }

                $operasi->update([
                    'no_out' => $item['no_out'],
                    'kuantum_out' => $item['kuantum_out'] ?? null,
                    'status_out' => 'disetujui',
                    'review_status' => 'diterima',
                    'catatan_penolakan' => null,
                    'reviewed_by' => $actor?->id,
                    'reviewed_at' => now(),
                ]);

                $approved->push($operasi->fresh());
            }

            $totalDetail = $poDetails->count();
            $sudahOut = DataOperasi::whereIn('po_detail_id', $poDetails->keys())
                ->where('status_out', 'disetujui')
                ->whereNotNull('no_out')
                ->count();

            if ($sudahOut === $totalDetail) {
                $this->majukanTahapTransaksi($dataPengadaan->id, 'operasi');
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
            $belumTahapGudang = Transaksi::whereIn('id_transaksi', $poDetails->pluck('transaksi_id'))
                ->where('current_stage', '!=', 'gudang')
                ->exists();
            if ($belumTahapGudang) {
                abort(422, 'PO belum dilanjutkan Operasi ke tahap Gudang.');
            }

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
                $gudang = DataGudang::where('data_operasi_id', $operasi->id)->first();
                if ($gudang && $gudang->review_status !== 'ditolak') {
                    abort(422, 'Data Gudang untuk salah satu IN sudah ada.');
                }

                $gudang ??= new DataGudang(['data_operasi_id' => $operasi->id]);
                $gudang->fill([
                    'tanggal_masuk' => $item['tanggal_masuk'],
                    'nama_gudang' => $item['nama_gudang'],
                    'realisasi_hgl' => $item['realisasi_hgl'] ?? null,
                    'no_tm' => $item['no_tm'],
                ]);
                $this->resetReview($gudang);
                $gudang->save();

                $created->push($gudang->fresh());
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

    private function resetReview($record): void
    {
        $record->review_status = 'menunggu_review';
        $record->catatan_penolakan = null;
        $record->reviewed_by = null;
        $record->reviewed_at = null;
    }
}
