<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Keanggotaan MO. Indeks UNIQUE pada transaksi_pengolahan_id menegakkan "satu transaksi
 * pengolahan maksimal satu MO" di level database.
 *
 * Di modul PO aturan setara dijaga lewat exists() manual di dua tempat (PoGroupingService::
 * gabungkanPo dan ::ubahAnggota) -- pernah bocor lewat jalur pembatalan yang lupa membersihkan
 * po_detail. Indeks unik lebih murah dan tidak bisa bocor lewat jalur yang lupa memeriksa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengolahan_mo_detail', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pengolahan_mo_id')->constrained('pengolahan_mo')->cascadeOnDelete();
            $table->string('transaksi_pengolahan_id', 30)->unique();
            $table->foreign('transaksi_pengolahan_id')
                ->references('id_pengolahan')->on('transaksi_pengolahan')->cascadeOnDelete();
            $table->decimal('kuantum_hgl_kontribusi', 15, 2)->default(0);
            $table->decimal('kuantum_gabah_diolah_kontribusi', 15, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pengolahan_mo_detail');
    }
};
