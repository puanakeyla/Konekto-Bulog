<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PermintaanOperasi;
use App\Services\Operasi\OperasiService;
use Illuminate\Http\Request;

class OperasiController extends Controller
{
    public function __construct(private OperasiService $service) {}

    public function index(Request $request)
    {
        $page = PermintaanOperasi::with(['dataGudang', 'creator', 'reviewer'])
            ->orderByDesc('created_at')
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
        $validated = $request->validate([
            'gabah_diolah_kg' => ['required', 'numeric', 'min:0.01'],
        ]);

        $permintaan = $this->service->ajukan($request->user(), (float) $validated['gabah_diolah_kg']);

        return response()->json(['data' => $permintaan], 201);
    }

    public function update(Request $request, PermintaanOperasi $permintaanOperasi)
    {
        $validated = $request->validate([
            'gabah_diolah_kg' => ['required', 'numeric', 'min:0.01'],
        ]);

        $permintaan = $this->service->ajukanUlang($permintaanOperasi, (float) $validated['gabah_diolah_kg']);

        return response()->json(['data' => $permintaan]);
    }

    public function decide(Request $request, PermintaanOperasi $permintaanOperasi)
    {
        $validated = $request->validate([
            'keputusan' => ['required', 'in:dikeluarkan,dikembalikan'],
            'no_out' => ['nullable', 'required_if:keputusan,dikeluarkan', 'string', 'max:255'],
            'kuantum_out' => ['nullable', 'numeric', 'min:0'],
            'catatan' => ['nullable', 'required_if:keputusan,dikembalikan', 'string', 'max:1000'],
        ]);

        $permintaan = $this->service->putuskan(
            $permintaanOperasi,
            $validated['keputusan'],
            $validated['no_out'] ?? null,
            isset($validated['kuantum_out']) ? (float) $validated['kuantum_out'] : null,
            $validated['catatan'] ?? null,
            $request->user(),
        );

        return response()->json(['data' => $permintaan]);
    }

    public function hasil(Request $request, PermintaanOperasi $permintaanOperasi)
    {
        $validated = $request->validate([
            'no_mo' => ['required', 'string', 'max:255'],
            'no_tm' => ['required', 'string', 'max:255'],
            'hgl_kg' => ['nullable', 'numeric', 'min:0'],
            'broken_kg' => ['nullable', 'numeric', 'min:0'],
            'menir_kg' => ['nullable', 'numeric', 'min:0'],
            'katul_kg' => ['nullable', 'numeric', 'min:0'],
            'rendemen_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $permintaan = $this->service->isiHasil($permintaanOperasi, $validated);

        return response()->json(['data' => $permintaan]);
    }

    public function gudang(Request $request, PermintaanOperasi $permintaanOperasi)
    {
        $validated = $request->validate([
            'tanggal_masuk' => ['required', 'date'],
            'nama_gudang' => ['required', 'string', 'max:255'],
            'realisasi_hgl' => ['nullable', 'numeric', 'min:0'],
            'no_tm' => ['required', 'string', 'max:255'],
        ]);

        $gudang = $this->service->terimaGudang($permintaanOperasi, $validated);

        return response()->json(['data' => $gudang], 201);
    }
}
