<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\PastikanUserAktif;
use App\Http\Middleware\RoleMiddleware as AppRoleMiddleware;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleOrPermissionMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->statefulApi();

        $middleware->alias([
            'user.aktif' => PastikanUserAktif::class,
            'role' => AppRoleMiddleware::class,
            'permission' => PermissionMiddleware::class,
            'role_or_permission' => RoleOrPermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        /*
         | Konteks yang ikut tercatat di SETIAP exception. Di produksi APP_DEBUG=false, jadi
         | layar cuma menampilkan "Server Error" -- log inilah satu-satunya keterangan yang
         | tersisa, dan "SQLSTATE..." tanpa siapa/di mana hampir tidak bisa ditindaklanjuti.
         |
         | Semuanya dibungkus null-safe: exception juga terjadi di perintah artisan & queue
         | worker, yang tidak punya request maupun user.
         */
        $exceptions->context(fn () => [
            'user_id' => auth()->id(),
            'url' => request()?->fullUrl(),
            'metode' => request()?->method(),
            'ip' => request()?->ip(),
        ]);
    })->create();
