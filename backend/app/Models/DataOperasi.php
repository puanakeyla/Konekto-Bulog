<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DataOperasi extends Model
{
    protected $table = 'data_operasi';

    protected $fillable = [
        'po_detail_id',
        'no_mo',
        'no_tm',
        'no_out',
        'status_out',
        'hgl_kg',
        'broken_kg',
        'menir_kg',
        'katul_kg',
        'rendemen_persen',
    ];

    public function poDetail(): BelongsTo
    {
        return $this->belongsTo(PoDetail::class);
    }

    public function dataGudang(): HasOne
    {
        return $this->hasOne(DataGudang::class);
    }

    protected function casts(): array
    {
        return [
            'hgl_kg' => 'decimal:2',
            'broken_kg' => 'decimal:2',
            'menir_kg' => 'decimal:2',
            'katul_kg' => 'decimal:2',
            'rendemen_persen' => 'decimal:2',
        ];
    }
}
