<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ubah Operasi & Gudang dari satu-per-PO menjadi satu-per-IN (per po_detail).
 * - data_operasi kini menempel ke po_detail (bukan data_pengadaan).
 * - HGL/Broken/Menir/Katul jadi nilai kg (bukan persen), Rendemen tetap persen.
 * - Realisasi HGL di gudang jadi nilai kg.
 * Data lama direset (data demo).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('data_gudang');
        Schema::dropIfExists('data_operasi');

        Schema::create('data_operasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('po_detail_id')->unique()->constrained('po_detail')->cascadeOnDelete();
            $table->string('no_mo');
            $table->string('no_tm');
            $table->decimal('hgl_kg', 12, 2)->nullable();
            $table->decimal('broken_kg', 12, 2)->nullable();
            $table->decimal('menir_kg', 12, 2)->nullable();
            $table->decimal('katul_kg', 12, 2)->nullable();
            $table->decimal('rendemen_persen', 5, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('data_gudang', function (Blueprint $table) {
            $table->id();
            $table->foreignId('data_operasi_id')->unique()->constrained('data_operasi')->cascadeOnDelete();
            $table->date('tanggal_masuk');
            $table->string('nama_gudang');
            $table->decimal('realisasi_hgl', 12, 2)->nullable();
            $table->string('no_tm');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_gudang');
        Schema::dropIfExists('data_operasi');

        // Kembali ke struktur lama (satu per PO, field persen).
        Schema::create('data_operasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('data_pengadaan_id')->constrained('data_pengadaan')->cascadeOnDelete();
            $table->string('no_mo');
            $table->string('no_tm');
            $table->decimal('hgl_persen', 5, 2)->nullable();
            $table->decimal('broken_persen', 5, 2)->nullable();
            $table->decimal('menir_persen', 5, 2)->nullable();
            $table->decimal('katul_persen', 5, 2)->nullable();
            $table->decimal('rendemen_persen', 5, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('data_gudang', function (Blueprint $table) {
            $table->id();
            $table->foreignId('data_operasi_id')->constrained('data_operasi')->cascadeOnDelete();
            $table->date('tanggal_masuk');
            $table->string('nama_gudang');
            $table->decimal('realisasi_hgl', 10, 2)->nullable();
            $table->string('no_tm');
            $table->timestamps();
        });
    }
};
