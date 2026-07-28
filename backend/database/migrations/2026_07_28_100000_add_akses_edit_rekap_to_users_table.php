<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Akses edit rekap sementara per USER (bukan per role): admin membukanya di Kelola User
 * saat seorang petugas perlu memperbaiki datanya sendiri yang sudah terkunci (mis. salah
 * unggah foto). Timestamp, bukan boolean, supaya sekalian tercatat kapan dibukanya.
 * NULL = terkunci seperti biasa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('akses_edit_dibuka_at')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('akses_edit_dibuka_at');
        });
    }
};
