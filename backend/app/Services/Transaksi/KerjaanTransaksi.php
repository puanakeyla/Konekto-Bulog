<?php

namespace App\Services\Transaksi;

use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Klasifikasi "apa yang harus dikerjakan" untuk satu transaksi di antrean sebuah role.
 *
 * Dulu logika ini hidup di frontend (src/lib/kerjaanTransaksi.ts) dan dihitung dari baris yang
 * kebetulan ter-fetch. Begitu antrean melebihi satu halaman, angka pada chip filter hanya
 * mencerminkan halaman itu -- bukan antrean sebenarnya. Karena itu klasifikasinya dipindah ke
 * SQL: satu ekspresi yang dipakai bersama untuk MENGHITUNG (chip & kartu), MEMFILTER (?kerjaan=),
 * dan MENANDAI tiap baris. Ketiganya mustahil berbeda karena sumbernya satu.
 *
 * URUTAN CASE WAJIB: penolakan menang atas segalanya (saat ditolak transaksi dikembalikan ke
 * tahap asal sehingga kolom "menunggu review" bisa ikut terisi), lalu periksa, lalu draft.
 * Pengadaan & Keuangan tidak lagi punya kategori buntu sendiri: keduanya diklasifikasi dari
 * kondisi PO-nya (kj_pd/kj_keu) seperti role lain diklasifikasi dari record tahapnya.
 */
class KerjaanTransaksi
{
    public const SEMUA = ['periksa', 'isi', 'draft', 'ditolak'];

    /**
     * LEFT JOIN semua tabel tahap dengan alias berprefiks `kj_` supaya tidak pernah bentrok
     * dengan join lain yang sudah dipasang pemanggil (TransaksiController::index memakai join
     * tanpa alias untuk pengurutan).
     */
    public static function joinTahap(Builder|QueryBuilder $query): Builder|QueryBuilder
    {
        return $query
            ->leftJoin('data_jemput_pangan as kj_jp', 'kj_jp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_makloon_tjp as kj_tjp', 'kj_tjp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_makloon_mpp as kj_mpp', 'kj_mpp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_ub_jastasma as kj_ub', 'kj_ub.transaksi_id', '=', 'transaksi.id_transaksi')
            // Satu transaksi hanya bernaung di satu PO, jadi join ini tidak menggandakan baris.
            ->leftJoin('po_detail as kj_pod', 'kj_pod.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_pengadaan as kj_pd', 'kj_pd.id', '=', 'kj_pod.data_pengadaan_id')
            ->leftJoin('data_keuangan as kj_keu', 'kj_keu.data_pengadaan_id', '=', 'kj_pd.id');
    }

    /** Ekspresi SQL yang menghasilkan salah satu dari self::SEMUA. */
    public static function ekspresi(): string
    {
        return "CASE
            WHEN kj_jp.status = 'ditolak'
              OR kj_tjp.status = 'ditolak'
              OR kj_mpp.status = 'ditolak'
              OR kj_ub.status = 'ditolak'
              OR kj_pd.review_status = 'ditolak'
              OR kj_keu.review_status = 'ditolak' THEN 'ditolak'
            WHEN (transaksi.current_stage = 'makloon' AND kj_jp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'makloon_terima' AND kj_mpp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'ub_jastasma' AND transaksi.skema = 'MPP' AND kj_mpp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'ub_jastasma' AND transaksi.skema = 'TJP' AND kj_tjp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'pengadaan' AND kj_ub.status = 'menunggu_review')
              OR (transaksi.current_stage = 'keuangan' AND kj_pd.review_status = 'menunggu_review') THEN 'periksa'
            WHEN (transaksi.current_stage = 'jemput_pangan' AND kj_jp.status = 'draft')
              OR (transaksi.current_stage = 'makloon' AND kj_tjp.status = 'draft')
              OR (transaksi.current_stage = 'makloon_kirim' AND kj_mpp.status = 'draft')
              OR (transaksi.current_stage = 'ub_jastasma' AND kj_ub.status = 'draft')
              OR (transaksi.current_stage = 'pengadaan' AND kj_pd.review_status = 'draft')
              OR (transaksi.current_stage = 'keuangan' AND kj_keu.review_status IN ('draft', 'menunggu_review')) THEN 'draft'
            ELSE 'isi'
        END";
    }

    /**
     * Hanya syarat "ditolak" -- cabang pertama dari ekspresi(). Dipakai untuk menghitung kartu
     * Ditolak tanpa memaksa MySQL mengevaluasi seluruh CASE bertingkat untuk tiap baris.
     */
    public static function syaratDitolak(): string
    {
        return "(kj_jp.status = 'ditolak'
            OR kj_tjp.status = 'ditolak'
            OR kj_mpp.status = 'ditolak'
            OR kj_ub.status = 'ditolak'
            OR kj_pd.review_status = 'ditolak'
            OR kj_keu.review_status = 'ditolak')";
    }

    /**
     * Batasi hasil ke satu kategori kerjaan. Memakai WHERE, bukan HAVING: ekspresinya hanya
     * membaca kolom hasil join (tidak ada agregat), dan HAVING kacau ketika paginate()
     * membungkus query jadi COUNT -- binding-nya ikut terlepas dari klausanya.
     */
    public static function filter(Builder|QueryBuilder $query, string $kerjaan): Builder|QueryBuilder
    {
        return $query->whereRaw(self::ekspresi().' = ?', [$kerjaan]);
    }

    /**
     * Jumlah transaksi per kategori untuk SELURUH antrean (bukan satu halaman).
     * Kategori yang kosong tetap dikembalikan bernilai 0 supaya frontend tidak perlu menebak.
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
