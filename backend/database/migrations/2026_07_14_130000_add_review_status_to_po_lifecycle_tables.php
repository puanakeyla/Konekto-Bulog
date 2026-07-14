<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('data_pengadaan', function (Blueprint $table) {
            $table->enum('review_status', ['menunggu_review', 'diterima', 'ditolak'])->default('menunggu_review')->after('status');
            $table->text('catatan_penolakan')->nullable()->after('review_status');
        });

        Schema::table('data_pengadaan', function (Blueprint $table) {
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
        });

        Schema::table('data_keuangan', function (Blueprint $table) {
            $table->enum('review_status', ['menunggu_review', 'diterima', 'ditolak'])->default('menunggu_review')->after('tanggal_bayar');
            $table->text('catatan_penolakan')->nullable()->after('review_status');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
        });

        Schema::table('data_operasi', function (Blueprint $table) {
            $table->enum('review_status', ['menunggu_review', 'diterima', 'ditolak'])->default('menunggu_review')->after('status_out');
            $table->text('catatan_penolakan')->nullable()->after('review_status');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
        });

        Schema::table('data_gudang', function (Blueprint $table) {
            $table->enum('review_status', ['menunggu_review', 'diterima', 'ditolak'])->default('menunggu_review')->after('no_tm');
            $table->text('catatan_penolakan')->nullable()->after('review_status');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
        });
    }

    public function down(): void
    {
        foreach (['data_pengadaan', 'data_keuangan', 'data_operasi', 'data_gudang'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropConstrainedForeignId('reviewed_by');
                $table->dropColumn(['review_status', 'catatan_penolakan', 'reviewed_at']);
            });
        }
    }
};
