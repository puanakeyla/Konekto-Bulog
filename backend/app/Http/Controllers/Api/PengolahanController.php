<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengolahan;
use App\Services\Pengolahan\PengolahanService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PengolahanController extends Controller
{
    public function __construct(private PengolahanService $service) {}

    public function index(Request $request)
    {
        $page = Pengolahan::with(['makloon', 'creator', 'mo'])
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

    public function kuantumIn(Request $request)
    {
        $validated = $request->validate([
            'makloon_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
        ]);

        return response()->json(['data' => ['total' => $this->service->totalKuantumIn((int) $validated['makloon_user_id'])]]);
    }

    public function store(Request $request)
    {
        $validated = $this->validatePengolahan($request);
        $pengolahan = $this->service->buat($request->user(), $validated);

        return response()->json(['data' => $pengolahan->load('makloon')], 201);
    }

    public function update(Request $request, Pengolahan $pengolahan)
    {
        $validated = $this->validatePengolahan($request, $pengolahan);
        $pengolahan = $this->service->ajukanUlang($pengolahan, $validated);

        return response()->json(['data' => $pengolahan->load('makloon')]);
    }

    public function tolak(Request $request, Pengolahan $pengolahan)
    {
        $validated = $request->validate(['catatan' => ['required', 'string', 'max:2000']]);
        $pengolahan = $this->service->tolak($pengolahan, $request->user(), $validated['catatan']);

        return response()->json(['data' => $pengolahan]);
    }

    private function validatePengolahan(Request $request, ?Pengolahan $pengolahan = null): array
    {
        $max = 999999999999.99;

        return $request->validate([
            'makloon_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'kuantum_olah' => ['required', 'numeric', 'min:0.01', "max:{$max}"],
            'no_lhpk' => ['required', 'string', 'max:255', Rule::unique('pengolahan', 'no_lhpk')->ignore($pengolahan?->id)],
            'tanggal' => ['required', 'date'],
            'ka1' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'ka2' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'ka3' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'hgl' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
            'broken' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
            'menir' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
            'katul' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
        ]);
    }
}
