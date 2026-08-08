<?php

use App\Services\Pengolahan\KerjaanPengolahan;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Klasifikasi antrean disimpan sebagai kolom, bukan dihitung ulang tiap kali daftar dibuka.
 *
 * Sebelumnya tiap permintaan daftar menjalankan CASE besar di atas 4 LEFT JOIN untuk SELURUH
 * tabel -- dua kali malah, sekali buat angka chip dan sekali buat halamannya. Pada 30k baris itu
 * ~1,5 detik per buka halaman, dan tidak ada indeks yang bisa menolong karena yang mahal adalah
 * mengklasifikasi tiap baris, bukan mencarinya.
 *
 * Kolom ini CACHE, bukan sumber kebenaran kedua: nilainya selalu ditulis dari
 * KerjaanPengolahan::ekspresi() yang sama, lewat KerjaanPengolahan::segarkan(). Jangan pernah
 * mengisinya dengan logika PHP yang ditulis ulang -- itu justru bug yang mau dihindari.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transaksi_pengolahan', function (Blueprint $table) {
            $table->string('kerjaan', 20)->nullable()->after('status_keseluruhan');
            $table->index('kerjaan', 'tp_kerjaan_idx');
        });

        // Isi ulang baris lama, satu UPDATE per kategori (bukan per baris) supaya migrasi pada
        // puluhan ribu baris tetap hitungan detik.
        foreach (KerjaanPengolahan::SEMUA as $kerjaan) {
            $ids = KerjaanPengolahan::joinTahap(DB::table('transaksi_pengolahan'))
                ->whereRaw(KerjaanPengolahan::ekspresi().' = ?', [$kerjaan])
                ->pluck('transaksi_pengolahan.id_pengolahan');

            foreach ($ids->chunk(1000) as $bagian) {
                DB::table('transaksi_pengolahan')
                    ->whereIn('id_pengolahan', $bagian->all())
                    ->update(['kerjaan' => $kerjaan]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('transaksi_pengolahan', function (Blueprint $table) {
            $table->dropIndex('tp_kerjaan_idx');
            $table->dropColumn('kerjaan');
        });
    }
};
