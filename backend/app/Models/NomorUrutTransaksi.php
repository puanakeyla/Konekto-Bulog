<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NomorUrutTransaksi extends Model
{
    protected $table = 'nomor_urut_transaksi';

    protected $fillable = [
        'skema',
        'tahun',
        'bulan',
        'urut',
    ];

    protected $casts = [
        'tahun' => 'integer',
        'bulan' => 'integer',
        'urut' => 'integer',
    ];
}
