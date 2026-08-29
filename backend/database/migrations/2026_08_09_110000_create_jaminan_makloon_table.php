<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('jaminan_makloon', function (Blueprint $table) {
            $table->id();
            $table->foreignId('makloon_user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_makloon_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('jaminan_rp', 15, 2)->default(0);
            $table->decimal('kapasitas_per_hari_kg', 15, 2)->default(0);
            $table->unsignedInteger('batas_hari')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('user_makloon_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('jaminan_makloon');
    }
};
