<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Gudang;

/**
 * Daftar ringan gudang aktif untuk dropdown -- paralel dengan MakloonOptionController.
 *
 * Dulu membaca akun user ber-role gudang (satu username per gudang). Asumsi itu salah: yang ada
 * di lapangan adalah SATU akun gudang pusat, dan gudang A/B/C/D adalah data master. Endpoint-nya
 * dipertahankan (route tidak berubah), sumbernya yang dialihkan ke tabel `gudang`.
 *
 * Hanya yang aktif yang dikembalikan: gudang nonaktif tidak boleh jadi pilihan baru, tapi data
 * lama yang sudah menunjuknya tetap utuh karena relasinya lewat id.
 */
class GudangOptionController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => Gudang::aktif()->orderBy('nama')->get(['id', 'kode', 'nama']),
        ]);
    }
}
