<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Buang `users.nama_gudang`.
 *
 * Kolom itu dibangun dengan asumsi "satu username per gudang" yang ternyata salah: di lapangan
 * ada SATU akun gudang pusat, dan gudang A/B/C/D adalah data master (tabel `gudang`).
 * Membiarkannya berarti dua pengertian "gudang" yang saling bertentangan hidup berdampingan.
 *
 * Kolomnya nullable dan sudah tanpa konsumen sejak modul pengolahan lama dihapus, jadi down()
 * cukup mengembalikan strukturnya -- tidak ada isi yang perlu dipulihkan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('nama_gudang');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('nama_gudang', 150)->nullable()->after('nama_maklon');
        });
    }
};
