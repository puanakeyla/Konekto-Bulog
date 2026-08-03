<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Data tahap UB Jastasma (LHPK -- Laporan Hasil Pemeriksaan Kualitas).
 *
 * Rendemen sengaja TIDAK disimpan sebagai kolom: ia cuma kuantum_beras_hgl / kuantum_gabah_diolah,
 * dan kolom tersimpan hanya menambah satu tempat lagi yang bisa melenceng dari sumbernya.
 * Dihitung di accessor model dan langsung di SQL untuk rekap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengolahan_lhpk', function (Blueprint $table) {
            $table->id();
            $table->string('transaksi_pengolahan_id', 30)->unique();
            $table->foreign('transaksi_pengolahan_id')
                ->references('id_pengolahan')->on('transaksi_pengolahan')->cascadeOnDelete();
            $table->foreignId('gudang_tujuan_id')->nullable()->constrained('gudang')->nullOnDelete();
            $table->string('no_lhpk', 100)->nullable()->unique();
            $table->date('tanggal_lhpk')->nullable();
            $table->decimal('kuantum_stok_gudang', 15, 2)->nullable();
            $table->decimal('kuantum_gabah_diolah', 15, 2)->nullable();
            $table->decimal('kuantum_beras_hgl', 15, 2)->nullable();
            $table->string('kualitas', 50)->nullable();
            $table->decimal('broken', 8, 2)->nullable();
            $table->decimal('menir', 8, 2)->nullable();
            $table->decimal('katul', 8, 2)->nullable();
            $table->decimal('ka1', 8, 2)->nullable();
            $table->decimal('ka2', 8, 2)->nullable();
            $table->decimal('ka3', 8, 2)->nullable();
            $table->decimal('reject', 8, 2)->nullable();

            $table->enum('status', ['draft', 'menunggu_review', 'diterima', 'ditolak'])->default('draft');
            $table->text('catatan_penolakan')->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('locked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('locked_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pengolahan_lhpk');
    }
};
