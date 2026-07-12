<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('riwayat_penolakan', function (Blueprint $table) {
            $table->id();
            $table->string('transaksi_id', 30);
            $table->foreign('transaksi_id')->references('id_transaksi')->on('transaksi')->cascadeOnDelete();
            $table->string('tahap', 50);
            $table->text('catatan');
            $table->foreignId('ditolak_oleh')->constrained('users');
            $table->timestamp('ditolak_pada');

            $table->index(['transaksi_id', 'ditolak_pada']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('riwayat_penolakan');
    }
};
