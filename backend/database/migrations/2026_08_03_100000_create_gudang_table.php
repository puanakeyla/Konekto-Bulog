<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Daftar master gudang (A/B/C/D ...), dikelola Admin.
 *
 * Menggantikan pola lama "satu akun user per gudang" (users.nama_gudang) yang ternyata salah:
 * yang ada di lapangan adalah SATU akun gudang pusat, dan gudang-gudangnya adalah data.
 * Berdiri di luar alur pengolahan (dipakai lintas modul), jadi sengaja tanpa awalan
 * `pengolahan_` -- jangan tertukar dengan `pengolahan_gudang` yang berisi data tahap Gudang.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gudang', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 30)->unique();
            $table->string('nama', 150);
            $table->boolean('aktif')->default(true);
            $table->timestamps();

            $table->index(['aktif', 'nama']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gudang');
    }
};
