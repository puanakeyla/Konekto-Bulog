<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DataPengadaanResource;
use App\Models\DataPengadaan;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Pengadaan\PoLifecycleService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PengadaanController extends Controller
{
    public function __construct(
        private PoGroupingService $service,
        private PoLifecycleService $lifecycleService,
    ) {
    }

    public function index(Request $request)
    {
        $dataPengadaan = DataPengadaan::with(['poDetail', 'dataKeuangan', 'dataOperasi.dataGudang'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return DataPengadaanResource::collection($dataPengadaan);
    }

    public function show(Request $request, DataPengadaan $dataPengadaan)
    {
        $dataPengadaan->load(['poDetail', 'dataKeuangan', 'dataOperasi.dataGudang', 'makloon']);

        return response()->json(['data' => new DataPengadaanResource($dataPengadaan)]);
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
            'status' => ['sometimes', Rule::in(['proses', 'lengkap', 'dibatalkan'])],
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

    public function isiNomorIn(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.po_detail_id' => ['required', 'integer'],
            'items.*.no_in' => ['required', 'string', 'max:255'],
        ]);

        $dataPengadaan = $this->service->isiNomorIn($dataPengadaan, $validated['items']);

        return response()->json(['data' => $dataPengadaan]);
    }

    public function pembayaran(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'status_bayar' => ['required', Rule::in(['belum', 'dibayarkan'])],
            'tanggal_bayar' => ['required_if:status_bayar,dibayarkan', 'nullable', 'date'],
            'no_spp' => ['nullable', 'string', 'max:255', Rule::unique('data_pengadaan', 'no_spp')->ignore($dataPengadaan->id)],
        ]);

        $dataKeuangan = $this->lifecycleService->updatePembayaran(
            $dataPengadaan,
            $validated['status_bayar'],
            $validated['tanggal_bayar'] ?? null,
            $validated['no_spp'] ?? null
        );

        return response()->json(['data' => $dataKeuangan]);
    }

    public function operasi(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'no_mo' => ['required', 'string', 'max:255'],
            'no_tm' => ['required', 'string', 'max:255'],
            'hgl_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'broken_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'menir_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'katul_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'rendemen_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $dataOperasi = $this->lifecycleService->inputOperasi($dataPengadaan, $validated);

        return response()->json(['data' => $dataOperasi], 201);
    }
}
