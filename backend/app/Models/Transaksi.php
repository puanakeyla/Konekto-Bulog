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
}
