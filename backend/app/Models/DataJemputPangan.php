<?php

namespace App\Models;

use App\Models\Concerns\HasStageLifecycle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataJemputPangan extends Model
{
    use HasStageLifecycle;

    protected $table = 'data_jemput_pangan';

    protected $fillable = [
        'transaksi_id',
        'id_pemasok',
        'supir',
        'plat_mobil',
        'nama_poktan_gapoktan',
        'desa',
        'kecamatan',
        'kabupaten',
        'makloon_user_id',
        'tanggal_kirim',
        'kuantum',
        'jarak_ke_makloon_km',
        'status',
        'catatan_penolakan',
        'locked_at',
        'locked_by',
        'submitted_by',
        'submitted_at',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }
}
