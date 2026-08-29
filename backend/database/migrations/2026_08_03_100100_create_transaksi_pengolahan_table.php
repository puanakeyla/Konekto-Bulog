<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rantai kerja KEDUA, sejajar dengan `transaksi` (TJP/MPP) dan tidak menyentuhnya.
 * SerGab melacak GKP masuk sampai pembayaran; Pengolahan melacak hasil olah (HGL) dari
 * gudang sampai dokumen pengeluaran (OUT).
 *
 * `makloon_user_id` sengaja di header, bukan di tabel tahap Gudang seperti rancangan awal:
 * pada skema UBJ, UB Jastasma menulis LHPK LEBIH DULU, dan LHPK adalah laporan hasil olah
 * milik makloon tertentu. Kalau makloon baru diketahui saat Gudang mengisi di tahap 2,
 * filter makloon di layar Operasi jadi bolong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transaksi_pengolahan', function (Blueprint $table) {
            $table->string('id_pengolahan', 30)->primary();
            $table->enum('skema', ['GDG', 'UBJ']);
            $table->foreignId('makloon_user_id')->constrained('users');
            $table->string('current_stage', 30);
            $table->enum('status_keseluruhan', ['berjalan', 'selesai'])->default('berjalan');
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index(['status_keseluruhan', 'current_stage']);
            $table->index('makloon_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaksi_pengolahan');
    }
};
