<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
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
            $table->decimal('rendemen', 5, 2)->nullable();
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
    }

    public function down(): void
    {
        Schema::dropIfExists('pengolahan');
    }
};
