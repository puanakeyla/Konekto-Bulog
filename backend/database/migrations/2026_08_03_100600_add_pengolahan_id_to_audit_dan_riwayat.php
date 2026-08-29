<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Beri ruang bagi ID pengolahan di dua tabel lintas modul.
 *
 * Kolom `transaksi_id` yang ada punya FK ke tabel `transaksi`, jadi ID pengolahan TIDAK bisa
 * dititipkan ke situ -- perlu kolom sendiri. `notifikasi` sengaja tidak ikut: kolomnya string
 * nullable tanpa FK, jadi sudah bisa menampung ID pengolahan apa adanya.
 *
 * riwayat_penolakan.transaksi_id ikut dibuat nullable karena satu baris kini merujuk SALAH SATU
 * dari dua rantai, tidak pernah keduanya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->string('pengolahan_id', 30)->nullable()->after('transaksi_id');
            $table->foreign('pengolahan_id')
                ->references('id_pengolahan')->on('transaksi_pengolahan')->nullOnDelete();
            $table->index(['pengolahan_id', 'created_at']);
        });

        Schema::table('riwayat_penolakan', function (Blueprint $table) {
            $table->string('transaksi_id', 30)->nullable()->change();
            $table->string('pengolahan_id', 30)->nullable()->after('transaksi_id');
            $table->foreign('pengolahan_id')
                ->references('id_pengolahan')->on('transaksi_pengolahan')->cascadeOnDelete();
            $table->index(['pengolahan_id', 'ditolak_pada']);
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropForeign(['pengolahan_id']);
            $table->dropIndex(['pengolahan_id', 'created_at']);
            $table->dropColumn('pengolahan_id');
        });

        Schema::table('riwayat_penolakan', function (Blueprint $table) {
            $table->dropForeign(['pengolahan_id']);
            $table->dropIndex(['pengolahan_id', 'ditolak_pada']);
            $table->dropColumn('pengolahan_id');
            $table->string('transaksi_id', 30)->nullable(false)->change();
        });
    }
};
