<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Alur Operasi diperbaiki menjadi loop independen dengan Pengadaan:
 *   1. Operasi membuat permintaan pengeluaran stok dengan `gabah_diolah_kg` (belum isi MO/TM).
 *   2. Pengadaan memutuskan `dikeluarkan` (isi No. OUT manual) atau `dikembalikan` (isi catatan).
 *   3. Setelah OUT keluar, Operasi baru mengisi No. MO/TM + hasil produksi (HGL/Broken/Menir/Katul/Rendemen).
 *
 * Karena itu: no_mo/no_tm kini nullable (diisi belakangan), status_out jadi string dengan
 * nilai menunggu_pengadaan/dikeluarkan/dikembalikan, dan ada kolom gabah_diolah_kg + catatan_pengembalian.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_operasi', function (Blueprint $table) {
            $table->decimal('gabah_diolah_kg', 12, 2)->nullable()->after('po_detail_id');
            $table->text('catatan_pengembalian')->nullable()->after('status_out');
        });

        Schema::table('data_operasi', function (Blueprint $table) {
            $table->string('no_mo')->nullable()->change();
            $table->string('no_tm')->nullable()->change();
            $table->string('status_out')->default('menunggu_pengadaan')->change();
        });

        // Data lama (demo) yang sudah 'disetujui' dipetakan ke istilah baru 'dikeluarkan'.
        DB::table('data_operasi')->where('status_out', 'disetujui')->update(['status_out' => 'dikeluarkan']);
    }

    public function down(): void
    {
        DB::table('data_operasi')->where('status_out', 'dikeluarkan')->update(['status_out' => 'disetujui']);

        Schema::table('data_operasi', function (Blueprint $table) {
            $table->dropColumn(['gabah_diolah_kg', 'catatan_pengembalian']);
        });

        Schema::table('data_operasi', function (Blueprint $table) {
            $table->enum('status_out', ['menunggu_pengadaan', 'disetujui'])
                ->default('menunggu_pengadaan')
                ->change();
            $table->string('no_mo')->nullable(false)->change();
            $table->string('no_tm')->nullable(false)->change();
        });
    }
};
