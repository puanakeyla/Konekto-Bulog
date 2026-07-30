<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Modul Pengolahan (alur UB Jastasma -> Operasi -> Pengadaan -> Operasi -> Gudang) dihapus.
 * Timeline transaksi TJP/MPP (berhenti di Keuangan) tidak terpengaruh: tidak ada FK dari
 * transaksi/PO ke tabel-tabel ini -- kaitannya cuma satu arah (pengolahan.jumlah_kuantum
 * dulu dihitung dari po_detail saat runtime).
 *
 * Role `operasi` & `gudang`, kolom `users.nama_gudang`, dan endpoint /api/gudang-options
 * sengaja DIPERTAHANKAN agar modul Admin tidak tersenggol.
 *
 * down() membangun ulang struktur (bukan data) supaya rollback ke migration
 * create_pengolahan_table / create_mo_tables / widen_pengolahan_rendemen tetap jalan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('mo_detail');
        Schema::dropIfExists('mo');
        Schema::dropIfExists('pengolahan');
    }

    public function down(): void
    {
        Schema::create('pengolahan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('makloon_user_id')->constrained('users');
            $table->decimal('jumlah_kuantum', 14, 2);
            $table->decimal('kuantum_olah', 14, 2);
            $table->string('no_lhpk')->unique();
            $table->date('tanggal');
            $table->decimal('ka1', 6, 2)->nullable();
            $table->decimal('ka2', 6, 2)->nullable();
            $table->decimal('ka3', 6, 2)->nullable();
            $table->decimal('hgl', 14, 2)->nullable();
            $table->decimal('broken', 14, 2)->nullable();
            $table->decimal('menir', 14, 2)->nullable();
            $table->decimal('katul', 14, 2)->nullable();
            $table->decimal('rendemen', 7, 2)->nullable();
            $table->enum('status', ['menunggu_operasi', 'ditolak', 'digabung'])->default('menunggu_operasi');
            $table->text('catatan_penolakan')->nullable();
            $table->unsignedBigInteger('mo_id')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('locked_by')->nullable()->constrained('users');
            $table->foreignId('submitted_by')->nullable()->constrained('users');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->index(['makloon_user_id', 'status']);
            $table->index('mo_id');
        });

        Schema::create('mo', function (Blueprint $table) {
            $table->id();
            $table->string('no_mo')->unique();
            $table->string('no_tm');
            $table->foreignId('makloon_user_id')->constrained('users');
            $table->decimal('total_kuantum_olah', 14, 2);
            $table->string('no_out')->nullable()->unique();
            $table->foreignId('tujuan_gudang_user_id')->nullable()->constrained('users');
            $table->string('no_tm_gudang')->nullable();
            $table->decimal('kuantum_total', 14, 2)->nullable();
            $table->date('tanggal_terima_gudang')->nullable();
            $table->string('current_stage', 20)->default('pengadaan');
            $table->enum('status', ['berjalan', 'selesai', 'dibatalkan'])->default('berjalan');
            $table->text('catatan_penolakan')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index(['current_stage', 'makloon_user_id']);
        });

        Schema::create('mo_detail', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mo_id')->constrained('mo')->cascadeOnDelete();
            $table->foreignId('pengolahan_id')->unique()->constrained('pengolahan');
            $table->timestamps();

            $table->index('mo_id');
        });
    }
};
