<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('transaksi')
            ->where('skema', 'MPP')
            ->where('current_stage', 'makloon')
            ->update(['current_stage' => 'makloon_kirim']);
    }

    public function down(): void
    {
        DB::table('transaksi')
            ->where('skema', 'MPP')
            ->where('current_stage', 'makloon_kirim')
            ->update(['current_stage' => 'makloon']);
    }
};
