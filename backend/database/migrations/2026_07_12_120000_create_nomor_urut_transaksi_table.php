<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Counter monoton per (skema, tahun, bulan) untuk membuat nomor urut id_transaksi
        // secara atomik. Menggantikan pola count(created_at)+1 yang rawan race & ikut turun
        // saat ada transaksi dihapus/dibatalkan. Unique key menjaga hanya ada satu baris
        // counter per kombinasi, sehingga increment ber-lock tidak pernah bentrok.
        Schema::create('nomor_urut_transaksi', function (Blueprint $table) {
            $table->id();
            $table->enum('skema', ['TJP', 'MPP']);
            $table->unsignedSmallInteger('tahun');
            $table->unsignedTinyInteger('bulan');
            $table->unsignedInteger('urut')->default(0);
            $table->timestamps();

            $table->unique(['skema', 'tahun', 'bulan']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nomor_urut_transaksi');
    }
};
