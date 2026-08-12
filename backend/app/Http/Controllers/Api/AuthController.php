<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Percobaan gagal yang ditoleransi per menit, per (username + IP).
     *
     * ponytail: tidak ada batas per-IP, jadi satu penyerang masih boleh mencoba 5 tebakan ke
     * BANYAK akun sekaligus dari satu tempat. Ditinggalkan karena batas per-IP ikut menghitung
     * kantor ber-NAT yang login barengan. Kalau log nanti menunjukkan penyapuan lintas akun,
     * tambahkan limiter kedua per-IP yang juga hanya dinaikkan saat gagal.
     */
    private const BATAS_PERCOBAAN = 5;

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $kunci = $this->kunciPercobaan($request);

        if (RateLimiter::tooManyAttempts($kunci, self::BATAS_PERCOBAAN)) {
            throw ValidationException::withMessages([
                'username' => ['Terlalu banyak percobaan masuk. Coba lagi dalam '.RateLimiter::availableIn($kunci).' detik.'],
            ])->status(429);
        }

        /*
         | Pencocokan username HARUS persis huruf besar-kecilnya.
         |
         | Kolom MySQL proyek ini bercollation *_ci (case-insensitive), jadi
         | `where('username', 'ADMIN')` cocok dengan baris 'admin' -- dan Auth::attempt()
         | memakai query yang sama, sehingga "admin"/"Admin"/"ADMIN" semuanya bisa masuk.
         | Penyaringan ulang di PHP di bawah ini yang menegakkan kesamaan sebenarnya, tanpa
         | perlu SQL khusus driver (BINARY tidak ada di SQLite yang dipakai test).
         |
         | Passwordnya sendiri tidak pernah case-insensitive: bcrypt membandingkan hash.
         */
        $user = User::where('username', $credentials['username'])
            ->get()
            ->firstWhere(fn (User $kandidat) => $kandidat->username === $credentials['username']);

        // Login lewat objek user yang SUDAH dipastikan, bukan Auth::attempt() yang akan
        // menjalankan query case-insensitive itu lagi dari nol.
        $lolos = $user
            && $user->is_active
            && Hash::check($credentials['password'], $user->password);

        if ($lolos) {
            Auth::guard('web')->login($user);
        }

        if (! $lolos) {
            // Hanya kegagalan yang menambah hitungan. Login yang benar tidak pernah memakai
            // jatah, jadi berapa pun banyaknya orang masuk bersamaan tidak ada yang terkunci.
            RateLimiter::hit($kunci);

            throw ValidationException::withMessages([
                'username' => ['Username atau password salah.'],
            ]);
        }

        RateLimiter::clear($kunci);

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json([
            'user' => $user->load('role'),
        ]);
    }

    /**
     * Kuncinya username + IP, bukan username saja: kalau hanya username, siapa pun dari luar
     * bisa mengunci akun orang lain cukup dengan menghajar username-nya lima kali semenit.
     */
    private function kunciPercobaan(Request $request): string
    {
        return 'login:'.Str::lower((string) $request->input('username')).'|'.$request->ip();
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $request->user()->load('role'),
        ]);
    }
}
