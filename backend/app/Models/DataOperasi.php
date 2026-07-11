<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DataOperasi extends Model
{
    protected $table = 'data_operasi';

    protected $fillable = [
        'data_pengadaan_id',
        'no_mo',
        'no_tm',
        'hgl_persen',
        'broken_persen',
        'menir_persen',
        'katul_persen',
        'rendemen_persen',
    ];

    public function dataPengadaan(): BelongsTo
    {
        return $this->belongsTo(DataPengadaan::class);
    }

    public function dataGudang(): HasOne
    {
        return $this->hasOne(DataGudang::class);
    }

    protected function casts(): array
    {
        return [
            'hgl_persen' => 'decimal:2',
            'broken_persen' => 'decimal:2',
            'menir_persen' => 'decimal:2',
            'katul_persen' => 'decimal:2',
            'rendemen_persen' => 'decimal:2',
        ];
    }
}
