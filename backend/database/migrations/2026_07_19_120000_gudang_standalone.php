<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gudang menjadi MODUL MANDIRI, lepas dari Operasi.
 * Sebelumnya data_gudang menempel ke permintaan_operasi (satu batch = satu penerimaan).
 * Sekarang Gudang mencatat sendiri (Tanggal Masuk, Nama Gudang, Kuantum Realisasi HGL,
 * No. TM) tanpa menunggu Operasi, dan punya rekap sendiri. Karena itu FK
 * permintaan_operasi_id dihapus dan diganti created_by (pencatat). Data demo direset,
 * mengikuti pola migrasi operasi_standalone (2026_07_18).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('data_gudang');

        Schema::create('data_gudang', function (Blueprint $table) {
            $table->id();
            $table->date('tanggal_masuk');
            $table->string('nama_gudang');
            $table->decimal('realisasi_hgl', 12, 2);
            $table->string('no_tm');
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_gudang');

        // Kembali ke struktur lama yang menempel ke permintaan_operasi (best effort; data demo).
        Schema::create('data_gudang', function (Blueprint $table) {
            $table->id();
            $table->foreignId('permintaan_operasi_id')->unique()->constrained('permintaan_operasi')->cascadeOnDelete();
            $table->date('tanggal_masuk');
            $table->string('nama_gudang');
            $table->decimal('realisasi_hgl', 12, 2)->nullable();
            $table->string('no_tm');
            $table->timestamps();
        });
    }
};
