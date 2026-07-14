<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DataPengadaanResource;
use App\Models\DataPengadaan;
use App\Services\AuditLogService;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Pengadaan\PoLifecycleService;
use App\Services\Pengadaan\PoReviewService;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PengadaanController extends Controller
{
    public function __construct(
        private PoGroupingService $service,
        private PoLifecycleService $lifecycleService,
        private PoReviewService $reviewService,

        private AuditLogService $auditLog,
    ) {}

    public function index(Request $request)
    {
        $dataPengadaan = DataPengadaan::with(['poDetail.transaksi.riwayatPenolakan.penolak', 'poDetail.dataOperasi.dataGudang', 'dataKeuangan'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return DataPengadaanResource::collection($dataPengadaan);
    }

    public function show(Request $request, DataPengadaan $dataPengadaan)
    {
        $dataPengadaan->load(['poDetail.transaksi.riwayatPenolakan.penolak', 'poDetail.dataOperasi.dataGudang', 'dataKeuangan', 'makloon']);

        return response()->json(['data' => new DataPengadaanResource($dataPengadaan)]);
    }

    public function gabungkanPo(Request $request)
    {
        $validated = $request->validate([
            'transaksi_ids' => ['required', 'array', 'min:1'],
            'transaksi_ids.*' => ['required', 'string', Rule::exists('transaksi', 'id_transaksi')],
            'no_po' => ['required', 'string', 'max:255', 'unique:data_pengadaan,no_po'],
            'harga' => ['nullable', 'numeric', 'min:0'],
            'status' => ['sometimes', Rule::in(['proses', 'lengkap', 'dibatalkan'])],
        ]);

        $dataPengadaan = $this->service->gabungkanPo(
            $validated['transaksi_ids'],
            $validated['no_po'],
            $request->user(),
            $validated['harga'] ?? null,
            $validated['status'] ?? 'proses'
        );

        $this->auditLog->logMany($request->user(), 'gabungkan_po', $validated['transaksi_ids'], [
            'data_pengadaan_id' => $dataPengadaan->id,
            'no_po' => $dataPengadaan->no_po,
            'harga' => $dataPengadaan->harga,
        ]);

        return response()->json(['data' => $dataPengadaan], 201);
    }

    public function update(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'harga' => ['sometimes', 'numeric', 'min:0'],
            'status' => ['sometimes', Rule::in(['proses', 'lengkap', 'dibatalkan'])],
        ]);

        $before = $dataPengadaan->only(['harga', 'total_harga', 'status']);

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

        $this->auditLog->logMany($request->user(), 'update_po', $dataPengadaan->poDetail()->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'no_po' => $dataPengadaan->no_po,
            'before' => $before,
            'after' => $dataPengadaan->only(['harga', 'total_harga', 'status']),
        ]);

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

        $this->auditLog->logMany($request->user(), 'isi_nomor_in', $dataPengadaan->poDetail->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'items' => $validated['items'],
            'status' => $dataPengadaan->status,
        ]);

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

        $this->auditLog->logMany($request->user(), 'update_pembayaran', $dataPengadaan->poDetail()->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'status_bayar' => $dataKeuangan->status_bayar,
            'tanggal_bayar' => $dataKeuangan->tanggal_bayar,
            'no_spp' => $dataPengadaan->fresh()->no_spp,
        ]);

        return response()->json(['data' => $dataKeuangan]);
    }

    public function operasi(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.po_detail_id' => ['required', 'integer'],
            'items.*.no_mo' => ['required', 'string', 'max:255'],
            'items.*.no_tm' => ['required', 'string', 'max:255'],
            'items.*.hgl_kg' => ['nullable', 'numeric', 'min:0'],
            'items.*.broken_kg' => ['nullable', 'numeric', 'min:0'],
            'items.*.menir_kg' => ['nullable', 'numeric', 'min:0'],
            'items.*.katul_kg' => ['nullable', 'numeric', 'min:0'],
            'items.*.rendemen_persen' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $created = $this->lifecycleService->inputOperasi($dataPengadaan, $validated['items']);

        $this->auditLog->logMany($request->user(), 'input_operasi', $dataPengadaan->poDetail()->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'jumlah_in' => $created->count(),
        ]);

        return response()->json(['data' => $created], 201);
    }

    public function approveOut(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.po_detail_id' => ['required', 'integer'],
            'items.*.no_out' => ['required', 'string', 'max:255'],
        ]);

        $approved = $this->lifecycleService->approveNomorOut($dataPengadaan, $validated['items']);

        $this->auditLog->logMany($request->user(), 'approve_nomor_out', $dataPengadaan->poDetail()->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'items' => $validated['items'],
            'jumlah_out' => $approved->count(),
        ]);

        return response()->json(['data' => $approved]);
    }

    public function gudang(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.po_detail_id' => ['required', 'integer'],
            'items.*.tanggal_masuk' => ['required', 'date'],
            'items.*.nama_gudang' => ['required', 'string', 'max:255'],
            'items.*.realisasi_hgl' => ['nullable', 'numeric', 'min:0'],
            'items.*.no_tm' => ['required', 'string', 'max:255'],
        ]);

        $created = $this->lifecycleService->inputGudang($dataPengadaan, $validated['items']);

        $this->auditLog->logMany($request->user(), 'input_gudang', $dataPengadaan->poDetail()->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'jumlah_in' => $created->count(),
        ]);

        return response()->json(['data' => $created], 201);
    }

    public function terimaPo(Request $request, DataPengadaan $dataPengadaan)
    {
        $result = $this->reviewService->terima($dataPengadaan, $request->user());

        return response()->json(['data' => $result['data_pengadaan'], 'stage' => $result['stage']]);
    }

    public function tolakPo(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'catatan' => ['required', 'string', 'max:2000'],
        ]);

        $result = $this->reviewService->tolak($dataPengadaan, $request->user(), $validated['catatan']);

        return response()->json(['data' => $result['data_pengadaan'], 'stage' => $result['stage']]);
    }

}
