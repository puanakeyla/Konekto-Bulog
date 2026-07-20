<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;

/**
 * Daftar ringan akun gudang (satu user per gudang, ber-role gudang) untuk dropdown
 * "Tujuan Gudang" di modul Pengolahan — paralel dengan MakloonOptionController.
 */
class GudangOptionController extends Controller
{
    public function index()
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        $data = User::where('role_id', $gudangRoleId)
            ->where('is_active', true)
            ->orderBy('nama_gudang')
            ->get(['id', 'nama_gudang'])
            ->map(fn (User $u) => ['id' => $u->id, 'nama_gudang' => $u->nama_gudang]);

        return response()->json(['data' => $data]);
    }
}
