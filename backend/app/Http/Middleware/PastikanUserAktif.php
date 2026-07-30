<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * `is_active` dulu hanya diperiksa saat login (AuthController::login), sehingga menonaktifkan
 * akun tidak menendang sesi yang sedang berjalan -- user tetap bisa bekerja sampai sesinya
 * kedaluwarsa sendiri. Untuk sistem yang mencatat serah-terima gabah dan pembayaran PO itu
 * terlalu longgar, jadi status akun diperiksa ulang di SETIAP request.
 *
 * Dipasang di grup auth:sanctum (routes/api.php) supaya berlaku untuk seluruh endpoint
 * terautentikasi sekaligus -- termasuk endpoint baru yang belum ada saat ini.
 */
class PastikanUserAktif
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // `=== false` (bukan `! $user->is_active`) disengaja. `is_active` di-cast boolean, jadi
        // false berarti DB benar-benar bilang nonaktif, sedangkan null berarti atribut itu tidak
        // ikut terhidrasi -- kasus yang hanya muncul pada model yang dibangun di memori, bukan
        // pada request sungguhan: guard session/sanctum selalu memuat baris user secara utuh.
        // Menolak null juga akan menendang user aktif tanpa alasan.
        if ($user?->is_active === false) {
            // Sesi ikut dimatikan, bukan sekadar request ini ditolak: kalau tidak, cookie-nya
            // tetap hidup dan user terus menabrak 401 tanpa pernah benar-benar ter-logout.
            Auth::guard('web')->logout();

            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            abort(401, 'Akun Anda sudah dinonaktifkan.');
        }

        return $next($request);
    }
}
