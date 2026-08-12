<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    protected $fillable = [
        'username',
        'password',
        'role_id',
        'nama_maklon',
        'kecamatan',
        'kabupaten',
        'is_active',
        'akses_edit_dibuka_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'akses_edit_dibuka_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Boleh menembus kunci tahap (edit rekap / ganti foto)? Admin selalu boleh. Role lain
     * hanya selama admin membukakan aksesnya di Kelola User, dan tetap dibatasi dua lapis
     * lagi: cuma blok field milik role-nya (TransaksiController::SCOPE_EDIT_REKAP) dan cuma
     * transaksi yang dia tangani (Transaksi::dimilikiOleh()). Akses tertutup sendiri setelah
     * satu kali simpan.
     */
    public function bolehEditRekap(): bool
    {
        return $this->role?->nama_role === 'admin' || $this->akses_edit_dibuka_at !== null;
    }

    protected static function booted(): void
    {
        static::saved(function (User $user) {
            if ($user->wasChanged('role_id') || $user->wasRecentlyCreated) {
                $user->syncRoles($user->role->nama_role);
            }
        });
    }
}
