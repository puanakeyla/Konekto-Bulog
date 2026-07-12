<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataOperasi;
use App\Services\AuditLogService;
use App\Services\Pengadaan\PoLifecycleService;
use Illuminate\Http\Request;

class OperasiController extends Controller
{
    public function __construct(
        private PoLifecycleService $service,
        private AuditLogService $auditLog,
    )
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

        $dataPengadaan = $dataOperasi->dataPengadaan()->with('poDetail')->first();
        $this->auditLog->logMany($request->user(), 'input_gudang', $dataPengadaan->poDetail->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'data_operasi_id' => $dataOperasi->id,
            'data_gudang_id' => $dataGudang->id,
            'nama_gudang' => $dataGudang->nama_gudang,
            'no_tm' => $dataGudang->no_tm,
        ]);

        return response()->json(['data' => $dataGudang], 201);
    }
}
