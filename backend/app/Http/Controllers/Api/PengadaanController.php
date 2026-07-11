<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataPengadaan;
use App\Services\Pengadaan\PoGroupingService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PengadaanController extends Controller
{
    public function __construct(private PoGroupingService $service)
    {
    }

    public function gabungkanPo(Request $request)
    {
        $validated = $request->validate([
            'transaksi_ids' => ['required', 'array', 'min:1'],
            'transaksi_ids.*' => ['required', 'string', Rule::exists('transaksi', 'id_transaksi')],
            'no_po' => ['required', 'string', 'max:255', 'unique:data_pengadaan,no_po'],
            'harga' => ['nullable', 'numeric', 'min:0'],
        ]);

        $dataPengadaan = $this->service->gabungkanPo(
            $validated['transaksi_ids'],
            $validated['no_po'],
            $request->user(),
            $validated['harga'] ?? null
        );

        return response()->json(['data' => $dataPengadaan], 201);
    }

    public function update(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'harga' => ['sometimes', 'numeric', 'min:0'],
            'status' => ['sometimes', Rule::in(['lengkap', 'dibatalkan'])],
        ]);

        if (array_key_exists('harga', $validated)) {
            $dataPengadaan->harga = number_format($validated['harga'], 2, '.', '');
            $dataPengadaan->total_harga = number_format(
                (float) $dataPengadaan->total_kuantum * (float) $validated['harga'],
                2,
                '.',
                ''
            );
        }

        if (array_key_exists('status', $validated)) {
            $dataPengadaan->status = $validated['status'];
        }

        $dataPengadaan->save();

        return response()->json(['data' => $dataPengadaan]);
    }
}
