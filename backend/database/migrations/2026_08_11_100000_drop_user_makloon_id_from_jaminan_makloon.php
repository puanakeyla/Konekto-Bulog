<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Urutannya mengikat: MySQL menolak melepas index yang masih dipakai foreign key,
        // sedangkan SQLite tidak ikut membuang index saat kolomnya hilang. Jadi FK dulu,
        // index, baru kolomnya -- satu-satunya urutan yang jalan di kedua driver.
        Schema::table('jaminan_makloon', function (Blueprint $table) {
            $table->dropForeign(['user_makloon_id']);
            $table->dropIndex(['user_makloon_id']);
            $table->dropColumn('user_makloon_id');
        });
    }

    public function down(): void
    {
        Schema::table('jaminan_makloon', function (Blueprint $table) {
            $table->foreignId('user_makloon_id')->nullable()->constrained('users')->nullOnDelete();
            $table->index('user_makloon_id');
        });
    }
};
