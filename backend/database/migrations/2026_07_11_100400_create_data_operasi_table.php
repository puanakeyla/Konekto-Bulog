<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('data_operasi');
    }
};
