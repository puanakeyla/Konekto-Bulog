<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Longgarkan kolom skema pada counter nomor urut supaya rantai pengolahan (GDG/UBJ) ikut
 * memakai generator ID yang sama.
 *
 * Sengaja memakai ulang tabel ini, bukan membuat counter sendiri: increment ber-lockForUpdate
 * di TransaksiStageService sudah menangani race antar-request dan penyelarasan dengan nomor
 * tertinggi yang terpakai. Menyalinnya berarti menyalin pula seluruh kasus tepi itu.
 *
 * Diubah jadi string biasa, bukan enum yang dilebarkan: enum harus diubah lewat SQL mentah yang
 * sintaksnya beda per driver, sedangkan test suite berjalan di sqlite dan produksi di MySQL.
 * Tidak ada yang hilang -- tabel ini murni counter internal, dan kombinasinya sudah dijaga
 * unique index (skema, tahun, bulan).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nomor_urut_transaksi', function (Blueprint $table) {
            $table->string('skema', 10)->change();
        });
    }

    public function down(): void
    {
        Schema::table('nomor_urut_transaksi', function (Blueprint $table) {
            $table->enum('skema', ['TJP', 'MPP'])->change();
        });
    }
};
