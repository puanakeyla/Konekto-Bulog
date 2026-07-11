<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_pengadaan', function (Blueprint $table) {
            $table->enum('status', ['proses', 'lengkap', 'dibatalkan'])->default('proses')->change();
        });
    }

    public function down(): void
    {
        DB::table('data_pengadaan')->where('status', 'proses')->update(['status' => 'lengkap']);

        Schema::table('data_pengadaan', function (Blueprint $table) {
            $table->enum('status', ['lengkap', 'dibatalkan'])->default('lengkap')->change();
        });
    }
};
