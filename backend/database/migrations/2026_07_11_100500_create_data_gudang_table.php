<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

    public function down(): void
    {
        Schema::dropIfExists('data_gudang');
    }
};
