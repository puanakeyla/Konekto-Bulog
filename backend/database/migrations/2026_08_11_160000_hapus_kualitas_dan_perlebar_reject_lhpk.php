<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dua koreksi pada LHPK:
 *
 * - `kualitas` dihapus. Kolom teks bebas yang tidak dipakai perhitungan mana pun.
 * - `reject` diperlebar. Dulu decimal(8,2) alias maksimum 999.999,99 -- padahal angkanya di
 *   lapangan berskala jutaan kilogram dan tidak pernah berkoma, jadi isian yang sah pun
 *   ditolak diam-diam oleh batas kolomnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pengolahan_lhpk', function (Blueprint $table) {
            $table->dropColumn('kualitas');
            $table->decimal('reject', 15, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('pengolahan_lhpk', function (Blueprint $table) {
            $table->string('kualitas', 50)->nullable();
            $table->decimal('reject', 8, 2)->nullable()->change();
        });
    }
};
