<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_keuangan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('data_pengadaan_id')->constrained('data_pengadaan')->cascadeOnDelete();
            $table->enum('status_bayar', ['belum', 'dibayarkan'])->default('belum');
            $table->date('tanggal_bayar')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_keuangan');
    }
};
