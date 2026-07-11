<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;

class DataMakloonMpp extends Model
{
    use HasStageLifecycle;

    protected $table = 'data_makloon_mpp';

    protected $fillable = [
        'transaksi_id',
        'id_pemasok',
        'supir',
        'plat_mobil',
        'desa',
        'kecamatan',
        'kabupaten',
        'tanggal_bongkar',
        'kuantum',
        'jarak_ke_makloon_km',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];
}
