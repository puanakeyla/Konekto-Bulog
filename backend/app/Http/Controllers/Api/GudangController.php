<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataGudang;
use Illuminate\Http\Request;

/**
 * Modul Gudang mandiri (lepas dari Operasi). Gudang mencatat sendiri penerimaan:
 * Tanggal Masuk, Nama Gudang, Kuantum Realisasi HGL, No. TM. Punya rekap sendiri.
 */
class GudangController extends Controller
{
    public function index(Request $request)
    {
        $page = DataGudang::with('creator')
            ->orderByDesc('tanggal_masuk')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateGudang($request);

        $gudang = DataGudang::create([
            ...$validated,
            'created_by' => $request->user()->id,
        ])->load('creator');

        return response()->json(['data' => $gudang], 201);
    }

    public function update(Request $request, DataGudang $dataGudang)
    {
        $validated = $this->validateGudang($request);

        $dataGudang->update($validated);

        return response()->json(['data' => $dataGudang->fresh('creator')]);
    }

    public function destroy(DataGudang $dataGudang)
    {
        $dataGudang->delete();

        return response()->noContent();
    }

    private function validateGudang(Request $request): array
    {
        // max: batas kolom decimal(12,2) supaya nilai kelewat besar ditolak sebagai 422,
        // bukan lolos ke MySQL dan meledak jadi 500 (SQLSTATE 22003).
        return $request->validate([
            'tanggal_masuk' => ['required', 'date'],
            'nama_gudang' => ['required', 'string', 'max:255'],
            'realisasi_hgl' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
            'no_tm' => ['required', 'string', 'max:255'],
        ]);
    }
}
