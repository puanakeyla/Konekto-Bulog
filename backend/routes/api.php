<?php

use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FotoController;
use App\Http\Controllers\Api\FotoStreamController;
use App\Http\Controllers\Api\GudangController;
use App\Http\Controllers\Api\GudangOptionController;
use App\Http\Controllers\Api\MakloonOptionController;
use App\Http\Controllers\Api\MoController;
use App\Http\Controllers\Api\MonitoringController;
use App\Http\Controllers\Api\NotifikasiController;
use App\Http\Controllers\Api\PengadaanController;
use App\Http\Controllers\Api\PengolahanController;
use App\Http\Controllers\Api\TransaksiController;
use Illuminate\Support\Facades\Route;

Route::pattern('transaksi', '.*');
// id_pengolahan memuat garis miring (00001/08/2026/GDG), sama seperti id_transaksi.
Route::pattern('pengolahan', '.*');

Route::post('/login', [AuthController::class, 'login']);

Route::get('/foto/{media}', [FotoStreamController::class, 'stream'])
    ->middleware('signed')
    ->name('foto.stream');

// `user.aktif` menendang akun yang dinonaktifkan admin dari sesi yang masih berjalan --
// lihat App\Http\Middleware\PastikanUserAktif.
Route::middleware(['auth:sanctum', 'user.aktif'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/notifikasi', [NotifikasiController::class, 'index']);
    Route::patch('/notifikasi/read-all', [NotifikasiController::class, 'markAllRead']);
    Route::patch('/notifikasi/{notifikasi}/read', [NotifikasiController::class, 'markRead']);

    Route::get('/makloon-options', [MakloonOptionController::class, 'index']);
    Route::get('/gudang-options', [GudangOptionController::class, 'index']);

    // Angka ringkasan dashboard dihitung di database, bukan dari baris yang ter-fetch browser.
    Route::get('/dashboard/ringkasan', [DashboardController::class, 'ringkasan']);

    Route::prefix('monitoring')->group(function () {
        Route::get('/sebaran-tahap', [MonitoringController::class, 'sebaranTahap']);
        // Perbandingan volume antar-makloon adalah alat pengawasan internal BULOG. Tanpa gerbang
        // ini seorang mitra makloon bisa melihat nama & jumlah transaksi seluruh pesaingnya.
        Route::get('/makloon', [MonitoringController::class, 'makloon'])->middleware('role:admin');
    });

    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/roles', [AdminUserController::class, 'roles']);
        Route::post('/users/import-makloon', [AdminUserController::class, 'importMakloon']);
        Route::patch('/users/{user}/reset-password', [AdminUserController::class, 'resetPassword']);
        Route::patch('/users/{user}/deactivate', [AdminUserController::class, 'deactivate']);
        Route::patch('/users/{user}/akses-edit', [AdminUserController::class, 'aksesEdit']);
        Route::apiResource('users', AdminUserController::class);
        // Gudang A/B/C/D adalah data master, bukan akun user -- lihat GudangOptionController.
        Route::post('/gudang/import', [GudangController::class, 'import']);
        Route::apiResource('gudang', GudangController::class)->except(['show']);
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
    // Sengaja tanpa middleware `role:admin`: selain admin, user yang aksesnya sedang dibuka
    // admin (users.akses_edit_dibuka_at) juga boleh masuk, tapi hanya untuk blok data
    // miliknya sendiri. Keputusan itu butuh konteks transaksi + payload, jadi ditegakkan di
    // adminUpdateRekap(), bukan di daftar role.
    Route::patch('/transaksi/{transaksi}/admin-rekap', [TransaksiController::class, 'adminUpdateRekap']);
    Route::get('/transaksi/{transaksi}/foto', [FotoController::class, 'index']);
    Route::get('/transaksi/{transaksi}/foto/{jenisFoto}', [FotoController::class, 'link']);
    Route::delete('/transaksi/{transaksi}/foto/{jenisFoto}', [FotoController::class, 'destroy'])
        ->middleware('role:admin');
    Route::get('/transaksi/{transaksi}', [TransaksiController::class, 'show']);
    Route::delete('/transaksi/{transaksi}', [TransaksiController::class, 'destroy'])
        ->middleware('role:admin');
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
    // Upload dibatasi: 5MB per request tanpa batas laju = satu akun bisa menguras disk VPS.
    // 40/menit masih longgar untuk pengiriman satu tahap (maks ~7 foto) beserta retry-nya.
    Route::post('/transaksi/{transaksi}/foto', [FotoController::class, 'store'])
        ->middleware('throttle:40,1');

    // === Alur Pengolahan (rantai kedua, GDG/UBJ) ===
    // Route bersuffix WAJIB didaftarkan sebelum '/pengolahan/{pengolahan}': pattern-nya greedy
    // ('.*'), jadi show akan menelan 'rekap'/'kandidat-mo' sebagai bagian dari id.
    Route::get('/pengolahan', [PengolahanController::class, 'index']);
    Route::get('/pengolahan/rekap', [PengolahanController::class, 'rekap']);
    Route::get('/pengolahan/kandidat-mo', [PengolahanController::class, 'kandidatMo'])
        ->middleware('role:operasi|admin');
    Route::post('/pengolahan', [PengolahanController::class, 'store'])
        ->middleware('role:gudang|ub_jastasma|admin');
    Route::patch('/pengolahan/{pengolahan}/gudang', [PengolahanController::class, 'gudang'])
        ->middleware('role:gudang|admin');
    Route::patch('/pengolahan/{pengolahan}/lhpk', [PengolahanController::class, 'lhpk'])
        ->middleware('role:ub_jastasma|admin');
    Route::post('/pengolahan/{pengolahan}/terima', [PengolahanController::class, 'terima']);
    Route::post('/pengolahan/{pengolahan}/tolak', [PengolahanController::class, 'tolak']);
    Route::get('/pengolahan/{pengolahan}/foto/{jenisFoto}', [PengolahanController::class, 'fotoLink']);
    Route::post('/pengolahan/{pengolahan}/foto', [PengolahanController::class, 'fotoUpload'])
        ->middleware('throttle:40,1');
    Route::get('/pengolahan/{pengolahan}', [PengolahanController::class, 'show']);

    Route::post('/mo/gabungkan', [MoController::class, 'gabungkan'])
        ->middleware('role:operasi|admin');
    Route::get('/mo', [MoController::class, 'index'])
        ->middleware('role:gudang|ub_jastasma|operasi|pengadaan|admin');
    Route::get('/mo/{mo}', [MoController::class, 'show'])
        ->middleware('role:gudang|ub_jastasma|operasi|pengadaan|admin');
    Route::patch('/mo/{mo}', [MoController::class, 'update'])
        ->middleware('role:operasi|admin');
    Route::patch('/mo/{mo}/anggota', [MoController::class, 'ubahAnggota'])
        ->middleware('role:operasi|admin');
    Route::post('/mo/{mo}/kirim', [MoController::class, 'kirim'])
        ->middleware('role:operasi|admin');
    Route::post('/mo/{mo}/batalkan', [MoController::class, 'batalkan'])
        ->middleware('role:operasi|admin');
    Route::post('/mo/{mo}/terima', [MoController::class, 'terima'])
        ->middleware('role:pengadaan|admin');
    Route::post('/mo/{mo}/tolak', [MoController::class, 'tolak'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/mo/{mo}/out', [MoController::class, 'isiOut'])
        ->middleware('role:pengadaan|admin');

    Route::post('/pengadaan/gabungkan-po', [PengadaanController::class, 'gabungkanPo'])
        ->middleware('role:pengadaan|admin');
    Route::get('/po', [PengadaanController::class, 'index'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');
    Route::get('/po/{dataPengadaan}', [PengadaanController::class, 'show'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');
    Route::get('/po/{dataPengadaan}/foto', [PengadaanController::class, 'fotoIndex'])
        ->middleware('role:pengadaan|keuangan|admin');
    Route::post('/po/{dataPengadaan}/foto', [PengadaanController::class, 'fotoUpload'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}', [PengadaanController::class, 'update'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/anggota', [PengadaanController::class, 'ubahAnggota'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/in', [PengadaanController::class, 'isiNomorIn'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/spp', [PengadaanController::class, 'simpanSpp'])
        ->middleware('role:pengadaan|admin');
    Route::patch('/po/{dataPengadaan}/pembayaran', [PengadaanController::class, 'pembayaran'])
        ->middleware('role:keuangan|admin');
    Route::post('/po/{dataPengadaan}/terima', [PengadaanController::class, 'terimaPo'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');
    Route::post('/po/{dataPengadaan}/tolak', [PengadaanController::class, 'tolakPo'])
        ->middleware('role:pengadaan|keuangan|operasi|gudang|admin');
});
