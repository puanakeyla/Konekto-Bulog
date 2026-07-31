<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pengadaan & Keuangan sebelumnya tidak punya cara menyimpan tanpa mengirim. 'draft' memakai
 * kosakata yang sama dengan record tahap (draft/menunggu_review/diterima/ditolak) supaya tidak
 * ada dua istilah untuk satu konsep.
 *
 * Default ikut berubah: PO yang baru dibuat selama ini langsung bernilai 'menunggu_review'
 * padahal belum dikirim ke siapa pun. Baris lama sengaja TIDAK di-backfill -- yang bernilai
 * 'menunggu_review' sekarang memang benar-benar sedang menunggu direview.
 *
 * Memakai ->change() dan bukan `ALTER TABLE ... MODIFY ... ENUM` mentah: produksi jalan di MySQL
 * tapi test jalan di SQLite in-memory (lihat .env.testing), dan di SQLite `enum` diterjemahkan
 * jadi CHECK constraint. Raw SQL MySQL akan membuat seluruh test suite gagal bermigrasi.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['data_pengadaan', 'data_keuangan'] as $tabel) {
            Schema::table($tabel, function (Blueprint $table) {
                $table->enum('review_status', ['draft', 'menunggu_review', 'diterima', 'ditolak'])
                    ->default('draft')->change();
            });
        }
    }

    public function down(): void
    {
        foreach (['data_pengadaan', 'data_keuangan'] as $tabel) {
            // Dipetakan lebih dulu, kalau tidak baris ber-nilai 'draft' ditolak constraint baru.
            DB::table($tabel)->where('review_status', 'draft')->update(['review_status' => 'menunggu_review']);

            Schema::table($tabel, function (Blueprint $table) {
                $table->enum('review_status', ['menunggu_review', 'diterima', 'ditolak'])
                    ->default('menunggu_review')->change();
            });
        }
    }
};
