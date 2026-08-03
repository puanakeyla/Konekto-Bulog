<?php

namespace App\Models;

use App\Services\Pengolahan\PengolahanStages;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class TransaksiPengolahan extends Model
{
    protected $table = 'transaksi_pengolahan';
    protected $primaryKey = 'id_pengolahan';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id_pengolahan',
        'skema',
        'makloon_user_id',
        'current_stage',
        'status_keseluruhan',
        'created_by',
    ];

    public function getRouteKeyName(): string
    {
        return 'id_pengolahan';
    }

    /**
     * Sama seperti Transaksi: id berpola urut sehingga bisa ditebak satu per satu. Pola dicek
     * lebih dulu supaya tebakan asal berhenti di 404, bukan menjadi query.
     */
    public function resolveRouteBinding($value, $field = null)
    {
        if (! preg_match('#^\d{5}/\d{2}/\d{4}/(GDG|UBJ)$#', (string) $value)) {
            abort(404);
        }

        return $this->where('id_pengolahan', $value)->firstOrFail();
    }

    /**
     * FK cascadeOnDelete menghapus baris tahap di level MySQL sehingga event Eloquent-nya tidak
     * pernah jalan -- padahal di situlah medialibrary membersihkan berkas foto. Tanpa hook ini
     * tiap transaksi yang dihapus meninggalkan baris `media` yatim beserta filenya. Pola yang
     * sama sudah dipakai Transaksi::booted().
     */
    protected static function booted(): void
    {
        static::deleting(function (self $transaksi) {
            $transaksi->dataGudang?->delete();
            $transaksi->dataLhpk?->delete();
        });
    }

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function dataGudang(): HasOne
    {
        return $this->hasOne(PengolahanGudang::class, 'transaksi_pengolahan_id', 'id_pengolahan');
    }

    public function dataLhpk(): HasOne
    {
        return $this->hasOne(PengolahanLhpk::class, 'transaksi_pengolahan_id', 'id_pengolahan');
    }

    public function moDetail(): HasOne
    {
        return $this->hasOne(PengolahanMoDetail::class, 'transaksi_pengolahan_id', 'id_pengolahan');
    }

    public function riwayatPenolakan(): HasMany
    {
        return $this->hasMany(RiwayatPenolakan::class, 'pengolahan_id', 'id_pengolahan');
    }

    /**
     * Antrean kerja satu role: transaksi berjalan yang sedang berada di tahap milik role itu.
     * Sengaja satu tempat supaya daftar dan hitungannya tidak bisa menyimpang -- alasan yang
     * sama dengan Transaksi::scopeAntreanRole().
     */
    public function scopeAntreanRole(Builder $query, string $role): Builder
    {
        $stageRoles = collect(['GDG', 'UBJ'])
            ->flatMap(fn (string $skema) => PengolahanStages::sequence($skema))
            ->filter(fn (array $stage) => $stage['role'] === $role)
            ->pluck('role')
            ->unique()
            ->values()
            ->all();

        return $query
            ->where('transaksi_pengolahan.status_keseluruhan', 'berjalan')
            ->whereIn('transaksi_pengolahan.current_stage', $stageRoles ?: [$role]);
    }

    /** Data tahap yang diisi lebih dulu pada skema ini, beserta yang menyusul. */
    public function dataTahap(string $role): ?Model
    {
        return match ($role) {
            'gudang' => $this->dataGudang,
            'ub_jastasma' => $this->dataLhpk,
            default => null,
        };
    }
}
