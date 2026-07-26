<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_makloon_mpp', function (Blueprint $table) {
            $table->decimal('kuantum_bongkar', 15, 2)->nullable()->after('kuantum');
        });
    }

    public function down(): void
    {
        Schema::table('data_makloon_mpp', function (Blueprint $table) {
            $table->dropColumn('kuantum_bongkar');
        });
    }
};
