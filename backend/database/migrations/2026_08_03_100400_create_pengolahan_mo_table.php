<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * MO (Movement Order) menggabungkan beberapa LHPK milik SATU makloon, analog `data_pengadaan`
 * yang menggabungkan beberapa transaksi jadi satu PO.
 *
 * Dua kolom total didenormalisasi saat penggabungan (meniru data_pengadaan.total_kuantum) supaya
 * daftar MO tidak perlu meng-agregasi mo_detail di tiap baris.
 *
 * Semua kolom nomor adalah teks bebas yang unik, mengikuti gaya no_po hari ini
 * (mis. OUT/00832/02/2026/ADA08001). Sengaja tanpa validasi pola: penomoran BULOG berbeda antar
 * kantor dan antar tahun, dan regex yang terlalu ketat akan menolak nomor yang sah di lapangan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengolahan_mo', function (Blueprint $table) {
            $table->id();
            $table->string('no_mo', 100)->unique();
            $table->string('no_tm_ada', 100)->nullable()->unique();
            $table->string('no_tm_gudang', 100)->nullable()->unique();
            $table->foreignId('makloon_user_id')->constrained('users');
            $table->decimal('total_kuantum_hgl', 15, 2)->default(0);
            $table->decimal('total_kuantum_gabah_diolah', 15, 2)->default(0);
            $table->string('no_out', 100)->nullable()->unique();
            $table->date('tanggal_out')->nullable();
            $table->enum('status', ['proses', 'lengkap', 'dibatalkan'])->default('proses');
            $table->enum('review_status', ['draft', 'menunggu_review', 'diterima', 'ditolak'])->default('draft');
            $table->text('catatan_penolakan')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'review_status']);
            $table->index('makloon_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pengolahan_mo');
    }
};
