<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_makloon_mpp', function (Blueprint $table) {
            $table->id();
            $table->string('transaksi_id', 30);
            $table->foreign('transaksi_id')->references('id_transaksi')->on('transaksi')->cascadeOnDelete();
            $table->string('id_pemasok')->nullable();
            $table->string('supir')->nullable();
            $table->string('plat_mobil')->nullable();
            $table->string('desa')->nullable();
            $table->string('kecamatan')->nullable();
            $table->string('kabupaten')->nullable();
            $table->date('tanggal_bongkar')->nullable();
            $table->decimal('kuantum', 10, 2)->nullable();
            $table->decimal('jarak_ke_makloon_km', 10, 2)->nullable();
            $table->enum('status', ['draft', 'menunggu_review', 'diterima', 'ditolak'])->default('draft');
            $table->text('catatan_penolakan')->nullable();
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('locked_by')->nullable()->constrained('users');
            $table->foreignId('submitted_by')->nullable()->constrained('users');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->index(['tanggal_bongkar', 'id_pemasok']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_makloon_mpp');
    }
};
