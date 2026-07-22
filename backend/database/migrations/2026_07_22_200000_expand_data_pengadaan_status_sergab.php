<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("ALTER TABLE data_pengadaan MODIFY status ENUM('proses','lengkap','kwitansi_belum_upload','foto_belum_lengkap','dibatalkan') NOT NULL DEFAULT 'proses'");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::table('data_pengadaan')
            ->whereIn('status', ['kwitansi_belum_upload', 'foto_belum_lengkap'])
            ->update(['status' => 'proses']);

        DB::statement("ALTER TABLE data_pengadaan MODIFY status ENUM('proses','lengkap','dibatalkan') NOT NULL DEFAULT 'proses'");
    }
};
