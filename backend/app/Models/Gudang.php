<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Master gudang (A/B/C/D ...). Satu akun gudang pusat memilih dari daftar ini saat mengisi;
 * UB Jastasma memilih gudang tujuan dari daftar yang sama.
 *
 * Jangan tertukar dengan PengolahanGudang, yang berisi data tahap Gudang pada satu transaksi.
 */
class Gudang extends Model
{
    protected $table = 'gudang';

    protected $fillable = ['kode', 'nama', 'aktif'];

    protected function casts(): array
    {
        return ['aktif' => 'boolean'];
    }

    public function scopeAktif(Builder $query): Builder
    {
        return $query->where('aktif', true);
    }

    /**
     * Gudang yang sudah dipakai tidak boleh dihapus -- baris pengolahan lama akan kehilangan
     * identitas gudangnya. Admin diarahkan menonaktifkan saja.
     */
    public function sudahDipakai(): bool
    {
        return PengolahanGudang::where('gudang_id', $this->id)->exists()
            || PengolahanLhpk::where('gudang_tujuan_id', $this->id)->exists();
    }
}
