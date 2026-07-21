<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Mo;
use App\Models\Role;
use App\Services\Pengolahan\MoService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MoController extends Controller
{
    public function __construct(private MoService $service) {}

    public function index(Request $request)
    {
        $request->validate([
            'stage' => ['sometimes', Rule::in(['pengadaan', 'operasi', 'gudang', 'selesai'])],
        ]);

        $page = Mo::with(['makloon', 'tujuanGudang', 'moDetail.pengolahan'])
            ->when($request->filled('stage'), fn ($q) => $q->where('current_stage', $request->query('stage')))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 50));

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
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        $validated = $request->validate([
            // Tujuan wajib akun ber-role gudang yang aktif — kalau tidak, MO pindah ke tahap
            // gudang tapi tak ada akun gudang yang bisa menerima (tersangkut).
            'tujuan_gudang_user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role_id', $gudangRoleId)->where('is_active', true)],
            'no_tm_gudang' => ['required', 'string', 'max:255'],
            'kuantum_total' => ['required', 'numeric', 'min:0.01', 'max:999999999999.99'],
        ]);

        $mo = $this->service->kirimGudang($mo, $validated, $request->user());

        return response()->json(['data' => $mo]);
    }

    public function ulangPengadaan(Request $request, Mo $mo)
    {
        $mo = $this->service->kirimUlangPengadaan($mo, $request->user());

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
