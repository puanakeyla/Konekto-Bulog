<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

    public function down(): void
    {
        Schema::dropIfExists('mo_detail');
        Schema::dropIfExists('mo');
    }
};
