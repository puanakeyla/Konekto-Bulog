<?php

use Illuminate\Support\Facades\Route;

/*
 | Backend ini murni API -- antarmukanya aplikasi React terpisah di folder frontend/.
 | Route ini cuma penanda supaya root tidak menampilkan halaman kosong atau 404 telanjang
 | saat ada yang membukanya di browser. Endpoint sesungguhnya ada di routes/api.php,
 | dan pemeriksaan kesehatan otomatis memakai /up (diatur di bootstrap/app.php).
 */
Route::get('/', fn () => response()->json([
    'aplikasi' => 'Konekto BULOG - API Serap Gabah & Pengolahan',
    'antarmuka' => 'Aplikasi React terpisah (folder frontend/)',
]));
