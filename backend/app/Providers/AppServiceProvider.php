<?php

namespace App\Providers;

use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /*
         | /up bawaan Laravel cuma membuktikan PHP masih bisa merespons -- ia tetap menjawab 200
         | walau database mati, padahal saat itu tidak ada satu pun halaman yang bisa dipakai.
         | Melempar dari sini membuat /up menjawab 500, sehingga pemantau di luar (UptimeRobot,
         | Better Stack, atau cron `curl -f`) ikut tahu, bukan cuma pengguna yang kebingungan.
         */
        Event::listen(DiagnosingHealth::class, fn () => DB::connection()->getPdo());
    }
}
