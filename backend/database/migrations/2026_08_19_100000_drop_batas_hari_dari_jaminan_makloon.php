<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Jaminan makloon tidak lagi punya dimensi waktu: plafonnya murni kg (kapasitas total
 * dikurangi estimasi gabah). Sejak aturan itu berlaku, `batas_hari` selalu ditulis 1 dan
 * tidak pernah dibaca -- kolom yang isinya konstan hanya menipu pembaca skema berikutnya.
 *
 * down() mengembalikan kolomnya dengan default 0 seperti definisi aslinya; nilai lamanya
 * tidak dipulihkan karena memang sudah tidak bermakna.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('jaminan_makloon', function (Blueprint $table) {
            $table->dropColumn('batas_hari');
        });
    }

    public function down(): void
    {
        Schema::table('jaminan_makloon', function (Blueprint $table) {
            $table->unsignedInteger('batas_hari')->default(0);
        });
    }
};
