<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Data tahap Gudang. Kolom lifecycle (status/catatan/submitted/locked) meniru tabel `data_*`
 * pada alur SerGab supaya PengolahanStageService bisa memperlakukan kedua tabel tahap seragam.
 *
 * `kuantum_hgl` di sini adalah hasil TIMBANGAN FISIK yang masuk gudang -- sengaja berbeda dari
 * `pengolahan_lhpk.kuantum_beras_hgl` yang merupakan hasil olah menurut LHPK. Selisih keduanya
 * adalah susut, dan itu angka yang memang mau dipantau; tidak ada validasi yang memaksa sama.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengolahan_gudang', function (Blueprint $table) {
            $table->id();
            $table->string('transaksi_pengolahan_id', 30)->unique();
            $table->foreign('transaksi_pengolahan_id')
                ->references('id_pengolahan')->on('transaksi_pengolahan')->cascadeOnDelete();
            $table->foreignId('gudang_id')->nullable()->constrained('gudang')->nullOnDelete();
            $table->date('tanggal_masuk_gudang')->nullable();
            $table->decimal('kuantum_hgl', 15, 2)->nullable();
            $table->string('plat_mobil', 20)->nullable();
            $table->string('supir', 100)->nullable();

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
        Schema::dropIfExists('pengolahan_gudang');
    }
};
