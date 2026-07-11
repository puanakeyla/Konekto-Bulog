<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataOperasi;
use App\Services\Pengadaan\PoLifecycleService;
use Illuminate\Http\Request;

class OperasiController extends Controller
{
    public function __construct(private PoLifecycleService $service)
    {
    }

    public function gudang(Request $request, DataOperasi $dataOperasi)
    {
        $validated = $request->validate([
            'tanggal_masuk' => ['required', 'date'],
            'nama_gudang' => ['required', 'string', 'max:255'],
            'realisasi_hgl' => ['nullable', 'numeric', 'min:0'],
            'no_tm' => ['required', 'string', 'max:255'],
        ]);

        $dataGudang = $this->service->inputGudang($dataOperasi, $validated);

        return response()->json(['data' => $dataGudang], 201);
    }
}
