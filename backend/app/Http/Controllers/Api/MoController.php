<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Mo;
use App\Services\Pengolahan\MoService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MoController extends Controller
{
    public function __construct(private MoService $service) {}

    public function index(Request $request)
    {
        $page = Mo::with(['makloon', 'tujuanGudang', 'moDetail.pengolahan'])
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

    public function show(Mo $mo)
    {
        return response()->json(['data' => $mo->load(['makloon', 'tujuanGudang', 'moDetail.pengolahan'])]);
    }

    public function gabungkan(Request $request)
    {
        $validated = $request->validate([
            'pengolahan_ids' => ['required', 'array', 'min:1'],
            'pengolahan_ids.*' => ['required', 'integer', Rule::exists('pengolahan', 'id')],
            'no_mo' => ['required', 'string', 'max:255', 'unique:mo,no_mo'],
            'no_tm' => ['required', 'string', 'max:255'],
        ]);

        $mo = $this->service->gabungkan($validated['pengolahan_ids'], $validated['no_mo'], $validated['no_tm'], $request->user());

        return response()->json(['data' => $mo], 201);
    }

    public function out(Request $request, Mo $mo)
    {
        $validated = $request->validate([
            'keputusan' => ['required', 'in:diterima,ditolak'],
            'no_out' => ['nullable', 'required_if:keputusan,diterima', 'string', 'max:255'],
            'catatan' => ['nullable', 'required_if:keputusan,ditolak', 'string', 'max:2000'],
        ]);

        $mo = $this->service->putuskanOut($mo, $validated['keputusan'], $validated['no_out'] ?? null, $validated['catatan'] ?? null, $request->user());

        return response()->json(['data' => $mo]);
    }

    public function kirimGudang(Request $request, Mo $mo)
    {
        $validated = $request->validate([
            'tujuan_gudang_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'no_tm_gudang' => ['required', 'string', 'max:255'],
            'kuantum_total' => ['required', 'numeric', 'min:0.01', 'max:999999999999.99'],
        ]);

        $mo = $this->service->kirimGudang($mo, $validated, $request->user());

        return response()->json(['data' => $mo]);
    }

    public function terima(Request $request, Mo $mo)
    {
        $validated = $request->validate(['tanggal' => ['required', 'date']]);
        $mo = $this->service->terimaGudang($mo, $request->user(), $validated['tanggal']);

        return response()->json(['data' => $mo]);
    }

    public function tolak(Request $request, Mo $mo)
    {
        $validated = $request->validate(['catatan' => ['required', 'string', 'max:2000']]);
        $mo = $this->service->tolakGudang($mo, $request->user(), $validated['catatan']);

        return response()->json(['data' => $mo]);
    }
}
