<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_operasi', function (Blueprint $table) {
            $table->decimal('kuantum_out', 12, 2)->nullable()->after('no_out');
        });
    }

    public function down(): void
    {
        Schema::table('data_operasi', function (Blueprint $table) {
            $table->dropColumn('kuantum_out');
        });
    }
};
