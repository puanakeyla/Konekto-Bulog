<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;

class DataMakloonTjp extends Model
{
    use HasStageLifecycle;

    protected $table = 'data_makloon_tjp';

    protected $fillable = [
        'transaksi_id',
        'tanggal_bongkar',
        'kuantum_bongkar',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];
}
