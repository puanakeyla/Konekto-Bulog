<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('po_detail', function (Blueprint $table) {
            $table->id();
            $table->foreignId('data_pengadaan_id')->constrained('data_pengadaan')->cascadeOnDelete();
            $table->string('transaksi_id', 30);
            $table->foreign('transaksi_id')->references('id_transaksi')->on('transaksi')->cascadeOnDelete();
            $table->decimal('kuantum_kontribusi', 10, 2);
            $table->string('no_in')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('po_detail');
    }
};
