<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $userRole = $request->user()?->role?->nama_role;
        $allowedRoles = collect($roles)
            ->flatMap(fn (string $role) => explode('|', $role))
            ->filter()
            ->values()
            ->all();

        abort_unless($userRole && in_array($userRole, $allowedRoles, true), 403, 'Anda tidak berwenang mengakses halaman ini.');

        return $next($request);
    }
}
