<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `kuantum_stok_gudang` dihapus. Snapshot stok berjalan gudang saat LHPK disimpan -- angka
 * turunan yang tidak pernah dipakai perhitungan mana pun, hanya ditampilkan, dan justru
 * membingungkan karena bisa minus saat gabah diolah melampaui HGL yang tercatat masuk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pengolahan_lhpk', function (Blueprint $table) {
            $table->dropColumn('kuantum_stok_gudang');
        });
    }

    public function down(): void
    {
        Schema::table('pengolahan_lhpk', function (Blueprint $table) {
            $table->decimal('kuantum_stok_gudang', 15, 2)->nullable()->after('tanggal_lhpk');
        });
    }
};
