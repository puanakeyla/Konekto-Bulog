<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Operasi menjadi MODUL MANDIRI (lepas dari PO/IN dan timeline transaksi).
 * Operasi mengajukan permintaan pengeluaran stok dengan jumlah gabah bebas -> Pengadaan
 * memutuskan dikeluarkan (No. OUT manual) / dikembalikan -> Operasi isi hasil produksi ->
 * Gudang menerima per batch permintaan. Karena itu data_operasi (per-IN) diganti tabel
 * `permintaan_operasi` yang berdiri sendiri, dan data_gudang menempel ke permintaan itu.
 * Data lama (demo) direset, mengikuti pola migrasi 2026_07_13.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('data_gudang');
        Schema::dropIfExists('data_operasi');

        Schema::create('permintaan_operasi', function (Blueprint $table) {
            $table->id();
            $table->decimal('gabah_diolah_kg', 12, 2);
            // menunggu_pengadaan | dikeluarkan | dikembalikan
            $table->string('status_out')->default('menunggu_pengadaan');
            $table->string('no_out')->nullable()->unique();
            $table->decimal('kuantum_out', 12, 2)->nullable();
            $table->text('catatan_pengembalian')->nullable();
            // Diisi Operasi SETELAH No. OUT keluar:
            $table->string('no_mo')->nullable();
            $table->string('no_tm')->nullable();
            $table->decimal('hgl_kg', 12, 2)->nullable();
            $table->decimal('broken_kg', 12, 2)->nullable();
            $table->decimal('menir_kg', 12, 2)->nullable();
            $table->decimal('katul_kg', 12, 2)->nullable();
            $table->decimal('rendemen_persen', 5, 2)->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('reviewed_by')->nullable()->constrained('users');
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

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

    public function down(): void
    {
        Schema::dropIfExists('data_gudang');
        Schema::dropIfExists('permintaan_operasi');

        // Kembali ke struktur per-IN (best effort; data demo).
        Schema::create('data_operasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('po_detail_id')->unique()->constrained('po_detail')->cascadeOnDelete();
            $table->decimal('gabah_diolah_kg', 12, 2)->nullable();
            $table->string('no_mo')->nullable();
            $table->string('no_tm')->nullable();
            $table->string('no_out')->nullable()->unique();
            $table->decimal('kuantum_out', 12, 2)->nullable();
            $table->string('status_out')->default('menunggu_pengadaan');
            $table->text('catatan_pengembalian')->nullable();
            $table->decimal('hgl_kg', 12, 2)->nullable();
            $table->decimal('broken_kg', 12, 2)->nullable();
            $table->decimal('menir_kg', 12, 2)->nullable();
            $table->decimal('katul_kg', 12, 2)->nullable();
            $table->decimal('rendemen_persen', 5, 2)->nullable();
            $table->string('review_status')->default('menunggu_review');
            $table->text('catatan_penolakan')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users');
            $table->timestamp('reviewed_at')->nullable();
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
};
