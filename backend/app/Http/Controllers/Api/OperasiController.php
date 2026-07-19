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
        $page = PermintaanOperasi::with(['creator', 'reviewer'])
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
            'gabah_diolah_kg' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
        ]);

        $permintaan = $this->service->ajukan($request->user(), (float) $validated['gabah_diolah_kg']);

        return response()->json(['data' => $permintaan], 201);
    }

    public function update(Request $request, PermintaanOperasi $permintaanOperasi)
    {
        $validated = $request->validate([
            'gabah_diolah_kg' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
        ]);

        $permintaan = $this->service->ajukanUlang($permintaanOperasi, (float) $validated['gabah_diolah_kg']);

        return response()->json(['data' => $permintaan]);
    }

    public function decide(Request $request, PermintaanOperasi $permintaanOperasi)
    {
        $validated = $request->validate([
            'keputusan' => ['required', 'in:dikeluarkan,dikembalikan'],
            'no_out' => ['nullable', 'required_if:keputusan,dikeluarkan', 'string', 'max:255'],
            'kuantum_out' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
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
        // Batas atas kolom decimal(12,2) di DB. Tanpa ini, nilai kelewat besar lolos
        // validasi lalu ditolak MySQL (SQLSTATE 22003) sebagai error 500, bukan 422.
        $maxDesimal = 9999999999.99;
        // HGL (beras giling) tidak mungkin melebihi gabah yang diolah -> jaga agar
        // rendemen (HGL/gabah*100) tetap <= 100 dan tidak meluap kolom decimal(5,2).
        $maxHgl = min((float) $permintaanOperasi->gabah_diolah_kg, $maxDesimal);

        $validated = $request->validate([
            'no_mo' => ['required', 'string', 'max:255'],
            'no_tm' => ['required', 'string', 'max:255'],
            'hgl_kg' => ['nullable', 'numeric', 'min:0', "max:{$maxHgl}"],
            'broken_kg' => ['nullable', 'numeric', 'min:0', "max:{$maxDesimal}"],
            'menir_kg' => ['nullable', 'numeric', 'min:0', "max:{$maxDesimal}"],
            'katul_kg' => ['nullable', 'numeric', 'min:0', "max:{$maxDesimal}"],
            'rendemen_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ], [
            'hgl_kg.max' => 'HGL tidak boleh melebihi gabah yang diolah ('.rtrim(rtrim(number_format((float) $permintaanOperasi->gabah_diolah_kg, 2, '.', ''), '0'), '.').' kg).',
        ]);

        $permintaan = $this->service->isiHasil($permintaanOperasi, $validated);

        return response()->json(['data' => $permintaan]);
    }
}
