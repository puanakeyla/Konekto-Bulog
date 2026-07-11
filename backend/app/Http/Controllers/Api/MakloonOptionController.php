<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class MakloonOptionController extends Controller
{
    public function index(Request $request)
    {
        $options = User::query()
            ->whereHas('role', fn ($q) => $q->where('nama_role', 'makloon'))
            ->where('is_active', true)
            ->whereNotNull('nama_maklon')
            ->when($request->string('q')->toString(), fn ($q, $search) => $q->where('nama_maklon', 'like', "%{$search}%"))
            ->orderBy('nama_maklon')
            ->get(['id', 'nama_maklon', 'kecamatan', 'kabupaten']);

        return response()->json(['data' => $options]);
    }
}
