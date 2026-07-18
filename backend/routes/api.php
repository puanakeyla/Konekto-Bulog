<?php

use App\Http\Controllers\Api\AdminMakloonController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FotoController;
use App\Http\Controllers\Api\FotoStreamController;
use App\Http\Controllers\Api\MakloonOptionController;
use App\Http\Controllers\Api\MonitoringController;
use App\Http\Controllers\Api\OperasiController;
use App\Http\Controllers\Api\PengadaanController;
use App\Http\Controllers\Api\TransaksiController;
use Illuminate\Support\Facades\Route;

Route::pattern('transaksi', '.*');

Route::post('/login', [AuthController::class, 'login']);

Route::get('/foto/{media}', [FotoStreamController::class, 'stream'])
    ->middleware('signed')
    ->name('foto.stream');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/makloon-options', [MakloonOptionController::class, 'index']);

    Route::prefix('monitoring')->group(function () {
        Route::get('/sebaran-tahap', [MonitoringController::class, 'sebaranTahap']);
        Route::get('/makloon', [MonitoringController::class, 'makloon']);
    });

    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/roles', [AdminUserController::class, 'roles']);
        Route::apiResource('makloon', AdminMakloonController::class)
            ->parameters(['makloon' => 'makloon']);
        Route::post('/users/import-makloon', [AdminUserController::class, 'importMakloon']);
        Route::patch('/users/{user}/reset-password', [AdminUserController::class, 'resetPassword']);
        Route::patch('/users/{user}/deactivate', [AdminUserController::class, 'deactivate']);
        Route::apiResource('users', AdminUserController::class);
    });

    Route::get('/transaksi', [TransaksiController::class, 'index']);
    // HARUS sebelum '/transaksi/{transaksi}' karena pattern {transaksi} greedy ('.*'),
    // kalau tidak 'rekap' akan ditangkap sebagai id transaksi.
    Route::get('/transaksi/rekap', [TransaksiController::class, 'rekap'])
        ->middleware('role:jemput_pangan|makloon|ub_jastasma|pengadaan|keuangan|admin');
    // Route dengan suffix di belakang {transaksi} (pattern '.*', greedy) HARUS didaftarkan
    // sebelum GET /transaksi/{transaksi} (show) -- kalau tidak, show akan menelan seluruh
    // sisa path (mis. "/foto/foto_petani") sebagai bagian dari {transaksi} karena ia
    // dicocokkan lebih dulu (first-match-wins berdasar urutan registrasi).
    Route::get('/transaksi/{transaksi}/foto/{jenisFoto}', [FotoController::class, 'link']);
    Route::get('/transaksi/{transaksi}', [TransaksiController::class, 'show']);
    Route::post('/transaksi', [TransaksiController::class, 'store'])
        ->middleware('role:jemput_pangan|makloon|admin');
    Route::patch('/transaksi/{transaksi}/jemput-pangan', [TransaksiController::class, 'jemputPangan'])
        ->middleware('role:jemput_pangan|admin');
    Route::patch('/transaksi/{transaksi}/makloon', [TransaksiController::class, 'makloon'])
        ->middleware('role:makloon|admin');
    Route::patch('/transaksi/{transaksi}/ub-jastasma', [TransaksiController::class, 'ubJastasma'])
        ->middleware('role:ub_jastasma|admin');
    Route::post('/transaksi/{transaksi}/terima', [TransaksiController::class, 'terima']);
    Route::post('/transaksi/{transaksi}/tolak', [TransaksiController::class, 'tolak']);
    Route::post('/transaksi/{transaksi}/foto', [FotoController::class, 'store']);

    Route::post('/pengadaan/gabungkan-po', [PengadaanController::class, 'gabungkanPo'])
        ->middleware('role:pengadaan|admin');
    Route::get('/po', [PengadaanController::class, 'index'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');
    Route::get('/po/{dataPengadaan}', [PengadaanController::class, 'show'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');
    Route::patch('/po/{dataPengadaan}', [PengadaanController::class, 'update'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/in', [PengadaanController::class, 'isiNomorIn'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/pembayaran', [PengadaanController::class, 'pembayaran'])
        ->middleware('role:keuangan|admin');
    Route::post('/po/{dataPengadaan}/terima', [PengadaanController::class, 'terimaPo'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');
    Route::post('/po/{dataPengadaan}/tolak', [PengadaanController::class, 'tolakPo'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');

    // Modul Operasi mandiri (lepas dari PO/IN): Operasi ajukan pengeluaran stok ->
    // Pengadaan putuskan OUT -> Operasi isi hasil -> Gudang terima batch.
    Route::get('/operasi', [OperasiController::class, 'index'])
        ->middleware('role:operasi|pengadaan|gudang|admin');
    Route::post('/operasi', [OperasiController::class, 'store'])
        ->middleware('role:operasi|admin');
    Route::patch('/operasi/{permintaanOperasi}', [OperasiController::class, 'update'])
        ->middleware('role:operasi|admin');
    Route::patch('/operasi/{permintaanOperasi}/out', [OperasiController::class, 'decide'])
        ->middleware('role:pengadaan|admin');
    Route::post('/operasi/{permintaanOperasi}/hasil', [OperasiController::class, 'hasil'])
        ->middleware('role:operasi|admin');
    Route::post('/operasi/{permintaanOperasi}/gudang', [OperasiController::class, 'gudang'])
        ->middleware('role:gudang|admin');
});
