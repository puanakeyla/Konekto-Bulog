<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MoDetail extends Model
{
    protected $table = 'mo_detail';

    protected $fillable = ['mo_id', 'pengolahan_id'];

    public function mo(): BelongsTo
    {
        return $this->belongsTo(Mo::class);
    }

    public function pengolahan(): BelongsTo
    {
        return $this->belongsTo(Pengolahan::class);
    }
}
