<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('transaksi_id', 30)->nullable();
            $table->foreign('transaksi_id')->references('id_transaksi')->on('transaksi')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('aksi', 100);
            $table->json('detail')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['transaksi_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
            $table->index(['aksi', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
