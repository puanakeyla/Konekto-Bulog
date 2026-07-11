<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transaksi', function (Blueprint $table) {
            $table->string('id_transaksi', 30)->primary();
            $table->enum('skema', ['TJP', 'MPP']);
            $table->string('current_stage', 30);
            $table->enum('status_keseluruhan', ['berjalan', 'selesai', 'dibatalkan'])->default('berjalan');
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index('current_stage');
            $table->index('status_keseluruhan');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaksi');
    }
};
