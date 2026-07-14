<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_operasi', function (Blueprint $table) {
            $table->string('no_out')->nullable()->unique()->after('no_tm');
            $table->enum('status_out', ['menunggu_pengadaan', 'disetujui'])
                ->default('menunggu_pengadaan')
                ->after('no_out');
        });
    }

    public function down(): void
    {
        Schema::table('data_operasi', function (Blueprint $table) {
            $table->dropUnique(['no_out']);
            $table->dropColumn(['no_out', 'status_out']);
        });
    }
};
