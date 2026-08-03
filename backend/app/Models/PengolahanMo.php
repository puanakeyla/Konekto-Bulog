<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * MO menggabungkan beberapa LHPK milik SATU makloon, analog data_pengadaan untuk PO.
 */
class PengolahanMo extends Model
{
    protected $table = 'pengolahan_mo';

    protected $fillable = [
        'no_mo',
        'no_tm_ada',
        'no_tm_gudang',
        'makloon_user_id',
        'total_kuantum_hgl',
        'total_kuantum_gabah_diolah',
        'no_out',
        'tanggal_out',
        'status',
        'review_status',
        'catatan_penolakan',
        'reviewed_by',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'total_kuantum_hgl' => 'decimal:2',
            'total_kuantum_gabah_diolah' => 'decimal:2',
            'tanggal_out' => 'date',
            'reviewed_at' => 'datetime',
        ];
    }

    public function moDetail(): HasMany
    {
        return $this->hasMany(PengolahanMoDetail::class, 'pengolahan_mo_id');
    }

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /** Isi kontrak MO terkunci begitu Pengadaan menerimanya atau MO sudah final. */
    public function terkunci(): bool
    {
        return $this->status !== 'proses' || $this->review_status === 'diterima';
    }
}
