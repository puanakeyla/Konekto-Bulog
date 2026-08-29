<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kunci urut Rekap Transaksi dihitung dengan `SELECT data_pengadaan_id, MIN(transaksi_id)
 * ... GROUP BY data_pengadaan_id` (TransaksiController::kunciUrutPo). Indeks tunggal
 * data_pengadaan_id yang dibuat foreign key tidak memuat transaksi_id, jadi MySQL harus
 * membaca baris tabelnya. Indeks gabungan ini membuat agregat itu cukup membaca indeks.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('po_detail', function (Blueprint $table) {
            $table->index(['data_pengadaan_id', 'transaksi_id'], 'po_detail_pengadaan_transaksi_idx');
        });
    }

    public function down(): void
    {
        Schema::table('po_detail', function (Blueprint $table) {
            $table->dropIndex('po_detail_pengadaan_transaksi_idx');
        });
    }
};
