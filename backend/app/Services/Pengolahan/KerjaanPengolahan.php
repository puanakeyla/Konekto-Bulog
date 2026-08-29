<?php

namespace App\Services\Pengolahan;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Klasifikasi "apa yang harus dikerjakan" untuk satu transaksi pengolahan, padanan
 * App\Services\Transaksi\KerjaanTransaksi.
 *
 * Alasan hidup di SQL sama persis dengan alasan di sana: daftar pengolahan paginated, jadi
 * menghitung kategori dari baris yang kebetulan ter-fetch membuat angka chip hanya mencerminkan
 * satu halaman. Satu ekspresi dipakai bertiga -- MENGHITUNG chip, MEMFILTER ?kerjaan=, dan
 * MENANDAI tiap baris -- sehingga ketiganya mustahil berbeda.
 *
 * URUTAN CASE WAJIB: penolakan menang atas segalanya (saat ditolak transaksi dikembalikan ke
 * tahap asal sehingga kolom status tahap lain bisa ikut terisi), lalu periksa, lalu draft.
 * Urutan tahap berbeda per skema (PengolahanStages::sequence), karena itu cabang 'periksa'
 * menyebut skema secara eksplisit: pada GDG yang memeriksa Gudang adalah UB Jastasma, pada UBJ
 * kebalikannya.
 */
class KerjaanPengolahan
{
    public const SEMUA = ['periksa', 'isi', 'draft', 'ditolak'];

    /**
     * LEFT JOIN tabel tahap dengan alias berprefiks `kp_` supaya tidak bentrok dengan join lain
     * yang mungkin sudah dipasang pemanggil. Hanya boleh dipanggil SEKALI per query.
     */
    public static function joinTahap(Builder|QueryBuilder $query): Builder|QueryBuilder
    {
        return $query
            ->leftJoin('pengolahan_gudang as kp_g', 'kp_g.transaksi_pengolahan_id', '=', 'transaksi_pengolahan.id_pengolahan')
            ->leftJoin('pengolahan_lhpk as kp_l', 'kp_l.transaksi_pengolahan_id', '=', 'transaksi_pengolahan.id_pengolahan')
            // Satu transaksi pengolahan maksimal satu MO (indeks unik di pengolahan_mo_detail),
            // jadi join ini tidak menggandakan baris.
            ->leftJoin('pengolahan_mo_detail as kp_md', 'kp_md.transaksi_pengolahan_id', '=', 'transaksi_pengolahan.id_pengolahan')
            ->leftJoin('pengolahan_mo as kp_mo', 'kp_mo.id', '=', 'kp_md.pengolahan_mo_id');
    }

    /** Ekspresi SQL yang menghasilkan salah satu dari self::SEMUA. */
    public static function ekspresi(): string
    {
        return "CASE
            WHEN kp_g.status = 'ditolak'
              OR kp_l.status = 'ditolak'
              OR kp_mo.review_status = 'ditolak' THEN 'ditolak'
            WHEN (transaksi_pengolahan.skema = 'GDG' AND transaksi_pengolahan.current_stage = 'ub_jastasma' AND kp_g.status = 'menunggu_review')
              OR (transaksi_pengolahan.skema = 'UBJ' AND transaksi_pengolahan.current_stage = 'gudang' AND kp_l.status = 'menunggu_review')
              OR (transaksi_pengolahan.current_stage = 'operasi' AND (kp_g.status = 'menunggu_review' OR kp_l.status = 'menunggu_review'))
              OR (transaksi_pengolahan.current_stage = 'pengadaan' AND kp_mo.review_status = 'menunggu_review') THEN 'periksa'
            WHEN (transaksi_pengolahan.current_stage = 'gudang' AND kp_g.status = 'draft')
              OR (transaksi_pengolahan.current_stage = 'ub_jastasma' AND kp_l.status = 'draft')
              OR (transaksi_pengolahan.current_stage = 'operasi' AND kp_mo.review_status = 'draft') THEN 'draft'
            ELSE 'isi'
        END";
    }

    /**
     * Tulis ulang kolom cache `transaksi_pengolahan.kerjaan` untuk SATU transaksi.
     *
     * Wajib dipanggil setiap kali sesuatu yang dibaca ekspresi berubah: status tahap,
     * current_stage, atau review_status MO. Nilainya diambil dari ekspresi() yang sama, jadi
     * kolomnya tidak mungkin punya definisi sendiri yang lama-lama melenceng.
     *
     * Dua query (baca lalu tulis) alih-alih satu UPDATE ... JOIN, karena SQLite -- yang dipakai
     * test suite -- tidak mendukung UPDATE ber-JOIN.
     */
    public static function segarkan(string $idPengolahan): void
    {
        $baris = self::joinTahap(DB::table('transaksi_pengolahan'))
            ->where('transaksi_pengolahan.id_pengolahan', $idPengolahan)
            ->selectRaw(self::ekspresi().' as kerjaan')
            ->first();

        DB::table('transaksi_pengolahan')
            ->where('id_pengolahan', $idPengolahan)
            ->update(['kerjaan' => $baris?->kerjaan]);
    }

    /** @param iterable<string> $ids */
    public static function segarkanBanyak(iterable $ids): void
    {
        foreach ($ids as $id) {
            self::segarkan($id);
        }
    }

    /**
     * Batasi hasil ke satu kategori. Membaca kolom cache (ber-indeks), bukan menghitung ulang
     * ekspresinya -- filter lewat whereRaw memaksa scan seluruh tabel.
     */
    public static function filter(Builder|QueryBuilder $query, string $kerjaan): Builder|QueryBuilder
    {
        return $query->where('transaksi_pengolahan.kerjaan', $kerjaan);
    }

    /**
     * Jumlah per kategori untuk SELURUH daftar (bukan satu halaman). Kategori kosong tetap
     * dikembalikan bernilai 0 supaya frontend tidak perlu menebak.
     *
     * @return array<string, int>
     */
    public static function hitung(Builder|QueryBuilder $query): array
    {
        $hasil = (clone $query)
            ->reorder()
            ->groupBy('transaksi_pengolahan.kerjaan')
            ->pluck(DB::raw('count(*)'), 'transaksi_pengolahan.kerjaan');

        $hitung = array_fill_keys(self::SEMUA, 0);
        foreach ($hasil as $kerjaan => $total) {
            if (isset($hitung[$kerjaan])) {
                $hitung[$kerjaan] = (int) $total;
            }
        }
        $hitung['total'] = array_sum($hitung);

        return $hitung;
    }
}
