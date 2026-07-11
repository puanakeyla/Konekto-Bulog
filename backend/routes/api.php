<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MakloonOptionController;
use App\Http\Controllers\Api\OperasiController;
use App\Http\Controllers\Api\PengadaanController;
use App\Http\Controllers\Api\TransaksiController;
use Illuminate\Support\Facades\Route;

Route::pattern('transaksi', '.*');

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/makloon-options', [MakloonOptionController::class, 'index']);

    Route::get('/transaksi', [TransaksiController::class, 'index']);
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

    Route::post('/pengadaan/gabungkan-po', [PengadaanController::class, 'gabungkanPo'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}', [PengadaanController::class, 'update'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/in', [PengadaanController::class, 'isiNomorIn'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/pembayaran', [PengadaanController::class, 'pembayaran'])
        ->middleware('role:keuangan|admin');
    Route::post('/po/{dataPengadaan}/operasi', [PengadaanController::class, 'operasi'])
        ->middleware('role:operasi|admin');
    Route::post('/operasi/{dataOperasi}/gudang', [OperasiController::class, 'gudang'])
        ->middleware('role:gudang|admin');
});
