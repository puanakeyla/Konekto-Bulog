<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indeks yang baru terasa pada puluhan ribu baris.
 *
 * `created_at` adalah kunci urut daftar DAN rekap pengolahan; tanpa indeks, tiap permintaan
 * memaksa filesort atas seluruh tabel. `(skema, created_at)` melayani rekap yang memang selalu
 * dipisah per skema.
 *
 * Pada tabel tahap, `(status, ...)` dipasang untuk dua pemakaian panas: penyaring rekap
 * (status = 'diterima') dan Gudang::stokBerjalan yang menjumlah per gudang + status.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transaksi_pengolahan', function (Blueprint $table) {
            $table->index('created_at', 'tp_created_at_idx');
            $table->index(['skema', 'created_at'], 'tp_skema_created_idx');
        });

        Schema::table('pengolahan_gudang', function (Blueprint $table) {
            $table->index(['gudang_id', 'status'], 'pg_gudang_status_idx');
        });

        Schema::table('pengolahan_lhpk', function (Blueprint $table) {
            $table->index(['gudang_tujuan_id', 'status'], 'pl_gudang_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('transaksi_pengolahan', function (Blueprint $table) {
            $table->dropIndex('tp_created_at_idx');
            $table->dropIndex('tp_skema_created_idx');
        });

        Schema::table('pengolahan_gudang', function (Blueprint $table) {
            $table->dropIndex('pg_gudang_status_idx');
        });

        Schema::table('pengolahan_lhpk', function (Blueprint $table) {
            $table->dropIndex('pl_gudang_status_idx');
        });
    }
};
