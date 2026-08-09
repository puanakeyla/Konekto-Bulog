<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Akses edit rekap dulu sekali pakai: satu timestamp yang langsung dikosongkan begitu user
 * menyimpan satu kali. Kenyataannya satu koreksi jarang cukup -- petugas yang salah input
 * biasanya harus membenahi beberapa baris sekaligus dan harus minta dibukakan lagi tiap kali.
 *
 * Timestamp diganti JATAH: berapa kali simpan yang masih boleh dipakai. 0 = terkunci, dan
 * angkanya berkurang satu tiap penyimpanan berhasil (User::pakaiJatahEdit).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedSmallInteger('akses_edit_sisa')->default(0)->after('is_active');
        });

        // Yang aksesnya sedang terbuka saat migrasi jalan tetap punya satu kali simpan.
        DB::table('users')->whereNotNull('akses_edit_dibuka_at')->update(['akses_edit_sisa' => 1]);

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('akses_edit_dibuka_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('akses_edit_dibuka_at')->nullable()->after('is_active');
        });

        DB::table('users')->where('akses_edit_sisa', '>', 0)->update(['akses_edit_dibuka_at' => now()]);

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('akses_edit_sisa');
        });
    }
};
