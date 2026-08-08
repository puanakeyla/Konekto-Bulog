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

    /**
     * Stok berjalan satu gudang: seluruh kuantum HGL yang sudah DITERIMA masuk ke gudang ini,
     * dikurangi yang sudah diolah menurut LHPK yang juga sudah DITERIMA.
     *
     * Sumbunya GUDANG, bukan makloon dan bukan satu transaksi -- sebelumnya angka ini cuma
     * menyalin kuantum HGL transaksinya sendiri, sehingga tidak pernah mencerminkan isi gudang.
     *
     * Syarat 'diterima' di kedua sisi membuat baris yang sedang dikerjakan (draft / menunggu
     * review) otomatis tidak ikut -- termasuk LHPK yang sedang diisi saat angka ini dibaca,
     * jadi yang tampil adalah stok SEBELUM pengolahan berjalan ini dibukukan.
     */
    public static function stokBerjalan(?int $gudangId): float
    {
        if (! $gudangId) {
            return 0.0;
        }

        $masuk = (float) PengolahanGudang::where('gudang_id', $gudangId)
            ->where('status', 'diterima')
            ->sum('kuantum_hgl');

        $keluar = (float) PengolahanLhpk::where('gudang_tujuan_id', $gudangId)
            ->where('status', 'diterima')
            ->sum('kuantum_gabah_diolah');

        return $masuk - $keluar;
    }
}
