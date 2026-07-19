<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Permintaan pengeluaran stok oleh Operasi (modul mandiri, lepas dari PO/IN).
 * Alur: menunggu_pengadaan -> (Pengadaan) dikeluarkan + No. OUT / dikembalikan
 *       -> (Operasi) isi hasil produksi. Gudang kini modul mandiri terpisah (tidak terkait).
 */
class PermintaanOperasi extends Model
{
    protected $table = 'permintaan_operasi';

    protected $fillable = [
        'gabah_diolah_kg',
        'status_out',
        'no_out',
        'kuantum_out',
        'catatan_pengembalian',
        'no_mo',
        'no_tm',
        'hgl_kg',
        'broken_kg',
        'menir_kg',
        'katul_kg',
        'rendemen_persen',
        'created_by',
        'reviewed_by',
        'reviewed_at',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    protected function casts(): array
    {
        return [
            'gabah_diolah_kg' => 'decimal:2',
            'kuantum_out' => 'decimal:2',
            'hgl_kg' => 'decimal:2',
            'broken_kg' => 'decimal:2',
            'menir_kg' => 'decimal:2',
            'katul_kg' => 'decimal:2',
            'rendemen_persen' => 'decimal:2',
            'reviewed_at' => 'datetime',
        ];
    }
}
