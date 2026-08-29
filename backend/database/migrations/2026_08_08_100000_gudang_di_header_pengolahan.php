<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gudang pindah ke HEADER pengolahan, makloon pindah ke tahap pertama.
 *
 * Rancangan awal terbalik dari kenyataan lapangan: satu pengolahan adalah "ambil dari makloon
 * X, taruh di gudang Y", dan yang menentukan berkasnya sejak awal adalah GUDANG-nya (Campang
 * Raya dst) -- itu juga satu-satunya sumbu yang stok bisa dihitung di atasnya. Makloon baru
 * diketahui saat tahap pertama diisi, jadi ia tidak bisa lagi jadi syarat pembuatan.
 *
 * `gudang_id` nullable secara skema (baris lama tidak punya) tapi WAJIB untuk pembuatan baru --
 * lihat PengolahanController::store(). Kolom gudang di tabel tahap sengaja DIPERTAHANKAN dan
 * kini diisi salinan dari header supaya rekap & query lama tidak perlu disentuh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transaksi_pengolahan', function (Blueprint $table) {
            $table->foreignId('gudang_id')->nullable()->after('skema')->constrained('gudang')->nullOnDelete();
            $table->foreignId('makloon_user_id')->nullable()->change();
        });

        // Baris lama: ambil gudang dari tahap yang sudah terisi supaya rekapnya tidak kosong.
        DB::table('transaksi_pengolahan')->whereNull('gudang_id')->update([
            'gudang_id' => DB::raw('COALESCE(
                (SELECT gudang_id FROM pengolahan_gudang WHERE transaksi_pengolahan_id = transaksi_pengolahan.id_pengolahan),
                (SELECT gudang_tujuan_id FROM pengolahan_lhpk WHERE transaksi_pengolahan_id = transaksi_pengolahan.id_pengolahan)
            )'),
        ]);
    }

    public function down(): void
    {
        Schema::table('transaksi_pengolahan', function (Blueprint $table) {
            $table->dropForeign(['gudang_id']);
            $table->dropColumn('gudang_id');
        });
    }
};
