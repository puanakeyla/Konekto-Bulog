<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rendemen = HGL ÷ jumlah_kuantum × 100. Untuk data awal (makloon dengan total IN kecil)
 * hasilnya bisa jauh > 100, sehingga decimal(5,2) (maks 999.99) berisiko overflow → 500.
 * Dilebarkan ke decimal(7,2) supaya nilai wajar maupun salah-input moderat tidak crash.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pengolahan', function (Blueprint $table) {
            $table->decimal('rendemen', 7, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('pengolahan', function (Blueprint $table) {
            $table->decimal('rendemen', 5, 2)->nullable()->change();
        });
    }
};
