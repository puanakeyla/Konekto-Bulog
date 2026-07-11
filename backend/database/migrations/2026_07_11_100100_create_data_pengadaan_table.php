<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_pengadaan', function (Blueprint $table) {
            $table->id();
            $table->date('tanggal_bongkar');
            $table->string('id_pemasok');
            $table->foreignId('makloon_user_id')->constrained('users');
            $table->decimal('total_kuantum', 12, 2);
            $table->decimal('harga', 10, 2)->default(6500);
            $table->decimal('total_harga', 14, 2);
            $table->string('no_po')->unique();
            $table->string('no_spp')->nullable()->unique();
            $table->enum('status', ['lengkap', 'dibatalkan'])->default('lengkap');
            $table->timestamps();

            $table->index(['tanggal_bongkar', 'id_pemasok', 'makloon_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_pengadaan');
    }
};
