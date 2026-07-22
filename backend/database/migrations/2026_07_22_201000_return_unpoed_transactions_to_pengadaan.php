<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('transaksi')
            ->where('current_stage', 'keuangan')
            ->where('status_keseluruhan', 'berjalan')
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('po_detail')
                    ->whereColumn('po_detail.transaksi_id', 'transaksi.id_transaksi');
            })
            ->update(['current_stage' => 'pengadaan']);
    }

    public function down(): void
    {
        // Tidak dibalik agar transaksi yang sudah siap diproses PO tidak lompat lagi ke Keuangan.
    }
};
