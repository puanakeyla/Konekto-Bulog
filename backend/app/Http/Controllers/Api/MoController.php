<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PengolahanMo;
use App\Services\Pengolahan\MoGroupingService;
use App\Services\Pengolahan\MoReviewService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MoController extends Controller
{
    public function __construct(
        private MoGroupingService $grouping,
        private MoReviewService $review,
    ) {
    }

    public function index(Request $request)
    {
        $validated = $request->validate([
            'search' => ['sometimes', 'string', 'max:100'],
            'status' => ['sometimes', Rule::in(['proses', 'lengkap', 'dibatalkan'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $query = PengolahanMo::query()
            ->with(['makloon:id,nama_maklon', 'moDetail.transaksiPengolahan.dataLhpk'])
            ->when(isset($validated['status']), fn ($q) => $q->where('status', $validated['status']))
            ->when(isset($validated['search']), function ($q) use ($validated) {
                $cari = $validated['search'];
                $q->where(function ($sub) use ($cari) {
                    $sub->where('no_mo', 'like', "%{$cari}%")
                        ->orWhere('no_out', 'like', "%{$cari}%")
                        ->orWhere('no_tm_ada', 'like', "%{$cari}%")
                        ->orWhere('no_tm_gudang', 'like', "%{$cari}%");
                });
            })
            ->orderByDesc('created_at');

        return response()->json($query->paginate($validated['per_page'] ?? 25));
    }

    public function show(PengolahanMo $mo)
    {
        return response()->json([
            'data' => $mo->load([
                'makloon:id,nama_maklon',
                'reviewer:id,username,nama_maklon',
                'moDetail.transaksiPengolahan.dataLhpk',
                'moDetail.transaksiPengolahan.dataGudang',
            ]),
        ]);
    }

    public function gabungkan(Request $request)
    {
        $validated = $request->validate([
            'pengolahan_ids' => ['required', 'array', 'min:1'],
            'pengolahan_ids.*' => ['required', 'string', Rule::exists('transaksi_pengolahan', 'id_pengolahan')],
            'no_mo' => ['required', 'string', 'max:100', 'unique:pengolahan_mo,no_mo'],
            'no_tm_ada' => ['nullable', 'string', 'max:100', 'unique:pengolahan_mo,no_tm_ada'],
            'no_tm_gudang' => ['nullable', 'string', 'max:100', 'unique:pengolahan_mo,no_tm_gudang'],
        ]);

        $mo = $this->grouping->gabungkanMo(
            $validated['pengolahan_ids'],
            $validated['no_mo'],
            $request->user(),
            $validated['no_tm_ada'] ?? null,
            $validated['no_tm_gudang'] ?? null,
        );

        return response()->json(['data' => $mo], 201);
    }

    public function update(Request $request, PengolahanMo $mo)
    {
        $validated = $request->validate([
            'no_mo' => ['sometimes', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_mo')->ignore($mo->id)],
            'no_tm_ada' => ['sometimes', 'nullable', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_tm_ada')->ignore($mo->id)],
            'no_tm_gudang' => ['sometimes', 'nullable', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_tm_gudang')->ignore($mo->id)],
        ]);

        if ($mo->terkunci()) {
            abort(422, 'MO ini sudah final dan nomornya tidak bisa diubah lagi.');
        }

        $mo->fill($validated)->save();

        return response()->json(['data' => $mo->fresh('moDetail')]);
    }

    public function ubahAnggota(Request $request, PengolahanMo $mo)
    {
        $validated = $request->validate([
            'pengolahan_ids' => ['required', 'array', 'min:1'],
            'pengolahan_ids.*' => ['required', 'string', Rule::exists('transaksi_pengolahan', 'id_pengolahan')],
        ]);

        return response()->json([
            'data' => $this->grouping->ubahAnggota($mo, $validated['pengolahan_ids'], $request->user()),
        ]);
    }

    public function kirim(Request $request, PengolahanMo $mo)
    {
        return response()->json(['data' => $this->grouping->kirimKePengadaan($mo, $request->user())]);
    }

    public function batalkan(Request $request, PengolahanMo $mo)
    {
        return response()->json(['data' => $this->grouping->batalkan($mo, $request->user())]);
    }

    public function terima(Request $request, PengolahanMo $mo)
    {
        return response()->json(['data' => $this->review->terima($mo, $request->user())]);
    }

    public function tolak(Request $request, PengolahanMo $mo)
    {
        $validated = $request->validate([
            'catatan' => ['required', 'string', 'max:1000'],
        ]);

        return response()->json([
            'data' => $this->review->tolak($mo, $request->user(), $validated['catatan']),
        ]);
    }

    public function isiOut(Request $request, PengolahanMo $mo)
    {
        $validated = $request->validate([
            'no_out' => ['required', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_out')->ignore($mo->id)],
            'tanggal_out' => ['required', 'date'],
        ]);

        return response()->json([
            'data' => $this->review->isiOut($mo, $request->user(), $validated['no_out'], $validated['tanggal_out']),
        ]);
    }
}
