<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perbesar kolom kuantum & harga agar bisa menampung nilai besar.
 * Sebelumnya decimal(10,2) hanya sampai ~99,999,999.99 (100 juta) — angka seperti
 * 123.456.789 ditolak MySQL (SQLSTATE 22003) dan muncul sebagai "gagal input".
 * Dinaikkan ke decimal(15,2) (~10 triliun) untuk kuantum/harga, dan total_harga
 * ke decimal(18,2) karena ia hasil kali kuantum x harga.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_jemput_pangan', function (Blueprint $table) {
            $table->decimal('kuantum', 15, 2)->nullable()->change();
        });
        Schema::table('data_makloon_mpp', function (Blueprint $table) {
            $table->decimal('kuantum', 15, 2)->nullable()->change();
        });
        Schema::table('data_makloon_tjp', function (Blueprint $table) {
            $table->decimal('kuantum_bongkar', 15, 2)->nullable()->change();
        });
        Schema::table('po_detail', function (Blueprint $table) {
            $table->decimal('kuantum_kontribusi', 15, 2)->change();
        });
        Schema::table('data_pengadaan', function (Blueprint $table) {
            $table->decimal('total_kuantum', 15, 2)->change();
            $table->decimal('harga', 15, 2)->default(6500)->change();
            $table->decimal('total_harga', 18, 2)->change();
        });
    }

    public function down(): void
    {
        Schema::table('data_jemput_pangan', function (Blueprint $table) {
            $table->decimal('kuantum', 10, 2)->nullable()->change();
        });
        Schema::table('data_makloon_mpp', function (Blueprint $table) {
            $table->decimal('kuantum', 10, 2)->nullable()->change();
        });
        Schema::table('data_makloon_tjp', function (Blueprint $table) {
            $table->decimal('kuantum_bongkar', 10, 2)->nullable()->change();
        });
        Schema::table('po_detail', function (Blueprint $table) {
            $table->decimal('kuantum_kontribusi', 10, 2)->change();
        });
        Schema::table('data_pengadaan', function (Blueprint $table) {
            $table->decimal('total_kuantum', 12, 2)->change();
            $table->decimal('harga', 10, 2)->default(6500)->change();
            $table->decimal('total_harga', 14, 2)->change();
        });
    }
};
