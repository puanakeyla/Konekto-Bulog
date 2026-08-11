<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('jaminan_makloon', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_makloon_id');
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
