<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Bulatkan kuantum/harga yang terlanjur tersimpan berkoma. Sejak validasi kuantum & harga
 * diubah jadi `integer`, data baru dijamin bulat -- migrasi ini membersihkan data lama yang
 * masuk sebelum aturan itu ada (mis. total rekap yang tampil sebagai 263.623,99).
 *
 * Kolomnya tetap decimal(x,2); yang dibulatkan nilainya, bukan tipenya. Mengubah tipe kolom
 * berarti kehilangan ruang gerak kalau suatu saat ada satuan yang memang perlu pecahan, dan
 * tidak memberi manfaat tambahan karena API sudah menolak koma di pintu masuk.
 *
 * Persentase (KA1-3, hampa, butir hijau, rendemen) dan jarak (km) SENGAJA tidak disentuh --
 * nilai-nilai itu memang berkoma di dunia nyata.
 */
return new class extends Migration
{
    /** tabel => kolom kuantum/harga yang harus bulat. */
    private const KOLOM_BULAT = [
        'data_jemput_pangan' => ['kuantum'],
        'data_makloon_mpp' => ['kuantum', 'kuantum_bongkar'],
        'data_makloon_tjp' => ['kuantum_bongkar'],
        'po_detail' => ['kuantum_kontribusi'],
        'pengolahan' => ['jumlah_kuantum', 'kuantum_olah', 'hgl', 'broken', 'menir', 'katul'],
        'mo' => ['total_kuantum_olah', 'kuantum_total'],
    ];

    public function up(): void
    {
        foreach (self::KOLOM_BULAT as $tabel => $kolom) {
            foreach ($kolom as $nama) {
                DB::table($tabel)
                    ->whereNotNull($nama)
                    ->update([$nama => DB::raw("ROUND({$nama})")]);
            }
        }

        DB::table('data_pengadaan')->update(['harga' => DB::raw('ROUND(harga)')]);

        // Total PO diturunkan dari anggotanya, jadi dihitung ulang -- bukan dibulatkan
        // sendiri-sendiri. Membulatkan total secara terpisah bisa membuatnya tidak lagi sama
        // dengan jumlah baris po_detail yang barusan dibulatkan (selisih pembulatan menumpuk).
        foreach (DB::table('data_pengadaan')->select('id', 'harga')->get() as $po) {
            $totalKuantum = (float) DB::table('po_detail')
                ->where('data_pengadaan_id', $po->id)
                ->sum('kuantum_kontribusi');

            DB::table('data_pengadaan')->where('id', $po->id)->update([
                'total_kuantum' => $totalKuantum,
                'total_harga' => $totalKuantum * (float) $po->harga,
            ]);
        }
    }

    /**
     * Pembulatan membuang informasi; angka pecahan aslinya tidak tersimpan di mana pun,
     * jadi tidak ada yang bisa dipulihkan.
     */
    public function down(): void
    {
        //
    }
};
