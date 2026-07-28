<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Transaksi extends Model
{
    protected $table = 'transaksi';
    protected $primaryKey = 'id_transaksi';
    protected $keyType = 'string';
    public $incrementing = false;

    public function getRouteKeyName(): string
    {
        return 'id_transaksi';
    }

    public function resolveRouteBinding($value, $field = null)
    {
        if (! preg_match('#^\d{5}/\d{2}/\d{4}/(TJP|MPP)$#', (string) $value)) {
            abort(404);
        }

        return $this->where('id_transaksi', $value)->firstOrFail();
    }

    protected $fillable = [
        'id_transaksi',
        'skema',
        'current_stage',
        'status_keseluruhan',
        'created_by',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function dataJemputPangan(): HasOne
    {
        return $this->hasOne(DataJemputPangan::class, 'transaksi_id', 'id_transaksi');
    }

    public function dataMakloonMpp(): HasOne
    {
        return $this->hasOne(DataMakloonMpp::class, 'transaksi_id', 'id_transaksi');
    }

    public function dataMakloonTjp(): HasOne
    {
        return $this->hasOne(DataMakloonTjp::class, 'transaksi_id', 'id_transaksi');
    }

    public function dataUbJastasma(): HasOne
    {
        return $this->hasOne(DataUbJastasma::class, 'transaksi_id', 'id_transaksi');
    }

    public function poDetail(): HasMany
    {
        return $this->hasMany(PoDetail::class, 'transaksi_id', 'id_transaksi');
    }

    public function riwayatPenolakan(): HasMany
    {
        return $this->hasMany(RiwayatPenolakan::class, 'transaksi_id', 'id_transaksi');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class, 'transaksi_id', 'id_transaksi');
    }

    /**
     * Transaksi ini ditangani oleh user tersebut? Dipakai saat user non-admin dibukakan
     * akses edit rekap: dia hanya boleh menyentuh transaksinya sendiri, bukan seluruh
     * baris role-nya (rekap difilter per role, bukan per user).
     *
     * Kepemilikan hanya terekam untuk dua role: Jemput Pangan lewat `created_by`, dan
     * Makloon lewat creator (MPP dibuat makloon sendiri) atau tunjukan JP (TJP). Role
     * lain (UB Jastasma, Pengadaan, Keuangan) tidak punya kolom pemilik -- datanya
     * memang milik bersama/level PO -- jadi pembatasnya tinggal scope field di
     * TransaksiController::SCOPE_EDIT_REKAP.
     */
    public function dimilikiOleh(User $user): bool
    {
        $this->loadMissing('dataJemputPangan');

        return match ($user->role?->nama_role) {
            'jemput_pangan' => (int) $this->created_by === (int) $user->id,
            'makloon' => $this->skema === 'MPP'
                ? (int) $this->created_by === (int) $user->id
                : (int) $this->dataJemputPangan?->makloon_user_id === (int) $user->id,
            default => true,
        };
    }
}
