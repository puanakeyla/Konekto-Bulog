<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bentuk jaminan yang dipegang Operasi atas satu makloon -- mis. "Bank Garansi BNI No.
 * 0012/BG/2026", "Deposito", "Cek mundur". Sengaja teks bebas, bukan enum: daftar bentuk
 * jaminan yang dipakai BULOG belum tentu lengkap sekarang, dan kolom ini hanya dibaca
 * manusia (tidak pernah jadi dasar perhitungan).
 *
 * Nullable supaya baris jaminan yang sudah ada tidak perlu di-backfill: kosong berarti
 * Operasi belum sempat mencatatnya, dan itu tidak menghalangi gerbang mana pun.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('jaminan_makloon', function (Blueprint $table) {
            $table->string('bentuk_jaminan', 200)->nullable()->after('makloon_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('jaminan_makloon', function (Blueprint $table) {
            $table->dropColumn('bentuk_jaminan');
        });
    }
};
