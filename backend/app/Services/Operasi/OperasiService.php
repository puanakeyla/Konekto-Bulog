<?php

namespace App\Services\Operasi;

use App\Models\DataGudang;
use App\Models\PermintaanOperasi;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Modul Operasi mandiri: Operasi mengajukan permintaan pengeluaran stok (jumlah gabah bebas),
 * Pengadaan memutuskan (dikeluarkan + No. OUT / dikembalikan + catatan), lalu setelah OUT keluar
 * Operasi mengisi hasil produksi, dan Gudang menerima batch tersebut. Lepas dari PO/IN & timeline.
 */
class OperasiService
{
    /** Operasi membuat permintaan baru dengan jumlah gabah yang ingin diolah. */
    public function ajukan(User $operasi, float $gabahDiolahKg): PermintaanOperasi
    {
        return PermintaanOperasi::create([
            'gabah_diolah_kg' => $gabahDiolahKg,
            'status_out' => 'menunggu_pengadaan',
            'created_by' => $operasi->id,
        ]);
    }

    /** Operasi mengajukan ulang permintaan yang sebelumnya dikembalikan Pengadaan. */
    public function ajukanUlang(PermintaanOperasi $permintaan, float $gabahDiolahKg): PermintaanOperasi
    {
        if ($permintaan->status_out !== 'dikembalikan') {
            abort(422, 'Hanya permintaan yang dikembalikan yang dapat diajukan ulang.');
        }

        $permintaan->update([
            'gabah_diolah_kg' => $gabahDiolahKg,
            'status_out' => 'menunggu_pengadaan',
            'catatan_pengembalian' => null,
            'reviewed_by' => null,
            'reviewed_at' => null,
        ]);

        return $permintaan->fresh();
    }

    /**
     * Pengadaan memutuskan permintaan:
     * - dikeluarkan: isi No. OUT (manual) + kuantum keluar (default = gabah diolah).
     * - dikembalikan: isi catatan, permintaan kembali ke Operasi untuk diajukan ulang.
     */
    public function putuskan(
        PermintaanOperasi $permintaan,
        string $keputusan,
        ?string $noOut,
        ?float $kuantumOut,
        ?string $catatan,
        User $pengadaan,
    ): PermintaanOperasi {
        return DB::transaction(function () use ($permintaan, $keputusan, $noOut, $kuantumOut, $catatan, $pengadaan) {
            $permintaan = PermintaanOperasi::whereKey($permintaan->id)->lockForUpdate()->firstOrFail();

            if ($permintaan->status_out !== 'menunggu_pengadaan') {
                abort(422, 'Permintaan ini sudah diputuskan.');
            }

            if ($keputusan === 'dikeluarkan') {
                $noOut = trim((string) $noOut);
                if ($noOut === '') {
                    abort(422, 'Nomor OUT wajib diisi untuk permintaan yang dikeluarkan.');
                }
                if (PermintaanOperasi::where('no_out', $noOut)->whereKeyNot($permintaan->id)->exists()) {
                    abort(422, 'Nomor OUT sudah dipakai.');
                }

                $permintaan->update([
                    'status_out' => 'dikeluarkan',
                    'no_out' => $noOut,
                    'kuantum_out' => $kuantumOut ?? $permintaan->gabah_diolah_kg,
                    'catatan_pengembalian' => null,
                    'reviewed_by' => $pengadaan->id,
                    'reviewed_at' => now(),
                ]);
            } elseif ($keputusan === 'dikembalikan') {
                $catatan = trim((string) $catatan);
                if ($catatan === '') {
                    abort(422, 'Catatan wajib diisi untuk permintaan yang dikembalikan.');
                }

                $permintaan->update([
                    'status_out' => 'dikembalikan',
                    'no_out' => null,
                    'kuantum_out' => null,
                    'catatan_pengembalian' => $catatan,
                    'reviewed_by' => $pengadaan->id,
                    'reviewed_at' => now(),
                ]);
            } else {
                abort(422, 'Keputusan harus dikeluarkan atau dikembalikan.');
            }

            return $permintaan->fresh();
        });
    }

    /**
     * Operasi mengisi No. MO/TM + hasil produksi setelah No. OUT keluar.
     * Rendemen otomatis = HGL / gabah diolah x 100 bila tidak dikirim eksplisit.
     */
    public function isiHasil(PermintaanOperasi $permintaan, array $data): PermintaanOperasi
    {
        if ($permintaan->status_out !== 'dikeluarkan' || $permintaan->no_out === null) {
            abort(422, 'Nomor OUT belum dikeluarkan Pengadaan.');
        }

        $hgl = $data['hgl_kg'] ?? null;
        $gabah = (float) $permintaan->gabah_diolah_kg;
        $rendemen = $data['rendemen_persen']
            ?? (($hgl !== null && $gabah > 0) ? round((float) $hgl / $gabah * 100, 2) : null);

        $permintaan->update([
            'no_mo' => $data['no_mo'],
            'no_tm' => $data['no_tm'],
            'hgl_kg' => $hgl,
            'broken_kg' => $data['broken_kg'] ?? null,
            'menir_kg' => $data['menir_kg'] ?? null,
            'katul_kg' => $data['katul_kg'] ?? null,
            'rendemen_persen' => $rendemen,
        ]);

        return $permintaan->fresh();
    }

    /** Gudang mencatat penerimaan hasil produksi untuk satu batch permintaan Operasi. */
    public function terimaGudang(PermintaanOperasi $permintaan, array $data): DataGudang
    {
        if ($permintaan->status_out !== 'dikeluarkan' || $permintaan->no_mo === null) {
            abort(422, 'Hasil produksi Operasi belum lengkap untuk permintaan ini.');
        }
        if ($permintaan->dataGudang()->exists()) {
            abort(422, 'Batch ini sudah diterima Gudang.');
        }

        return DataGudang::create([
            'permintaan_operasi_id' => $permintaan->id,
            'tanggal_masuk' => $data['tanggal_masuk'],
            'nama_gudang' => $data['nama_gudang'],
            'realisasi_hgl' => $data['realisasi_hgl'] ?? null,
            'no_tm' => $data['no_tm'],
        ]);
    }
}
