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
     * Batasi hasil ke satu kategori. WHERE, bukan HAVING -- ekspresinya tidak memuat agregat, dan
     * HAVING kacau ketika paginate() membungkus query jadi COUNT.
     */
    public static function filter(Builder|QueryBuilder $query, string $kerjaan): Builder|QueryBuilder
    {
        return $query->whereRaw(self::ekspresi().' = ?', [$kerjaan]);
    }

    /**
     * Jumlah per kategori untuk SELURUH daftar (bukan satu halaman). Kategori kosong tetap
     * dikembalikan bernilai 0 supaya frontend tidak perlu menebak.
     *
     * @return array<string, int>
     */
    public static function hitung(Builder|QueryBuilder $query): array
    {
        $sub = self::joinTahap(clone $query)
            ->select([DB::raw(self::ekspresi().' as kerjaan')])
            ->reorder();

        $hasil = DB::query()
            ->fromSub($sub, 'k')
            ->select('kerjaan', DB::raw('count(*) as total'))
            ->groupBy('kerjaan')
            ->pluck('total', 'kerjaan');

        $hitung = array_fill_keys(self::SEMUA, 0);
        foreach ($hasil as $kerjaan => $total) {
            $hitung[$kerjaan] = (int) $total;
        }
        $hitung['total'] = array_sum($hitung);

        return $hitung;
    }
}
