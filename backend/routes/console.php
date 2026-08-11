<?php

use App\Models\AuditLog;
use App\Models\Notifikasi;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 | Perawatan malam. Ini TIDAK berjalan sendiri: di VPS wajib ada satu baris cron
 |
 |   * * * * * cd /path/ke/backend && php artisan schedule:run >> /dev/null 2>&1
 |
 | Tanpa baris itu semua jadwal di bawah diam saja, tanpa error, tanpa tanda.
 |
 | timezone() ditulis eksplisit karena APP_TIMEZONE proyek ini UTC -- '01:00' polos berarti
 | pukul 08:00 WIB, tepat saat orang mulai bekerja.
 */

Schedule::command('backup:db')
    ->dailyAt('01:00')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

// Dua model disebut eksplisit, bukan mengandalkan penemuan otomatis model:prune: kalau nanti
// ada model lain yang kebetulan Prunable, ia tidak ikut terpangkas tanpa keputusan sadar.
Schedule::command('model:prune', ['--model' => [AuditLog::class, Notifikasi::class]])
    ->dailyAt('02:30')
    ->timezone('Asia/Jakarta');
