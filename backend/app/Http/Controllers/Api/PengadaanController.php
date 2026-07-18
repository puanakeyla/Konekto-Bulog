<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DataPengadaanResource;
use App\Models\DataPengadaan;
use App\Models\Transaksi;
use App\Services\AuditLogService;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Pengadaan\PoLifecycleService;
use App\Services\Pengadaan\PoReviewService;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        $search = trim((string) $request->query('q', ''));

        $dataPengadaan = DataPengadaan::with(['poDetail.transaksi.riwayatPenolakan.penolak', 'dataKeuangan'])
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('no_po', 'like', "%{$search}%")
                        ->orWhere('no_spp', 'like', "%{$search}%")
                        ->orWhere('id_pemasok', 'like', "%{$search}%")
                        ->orWhereHas('makloon', fn ($query) => $query->where('nama_maklon', 'like', "%{$search}%"))
                        ->orWhereHas('poDetail', fn ($query) => $query->where('transaksi_id', 'like', "%{$search}%"));
                });
            })
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return DataPengadaanResource::collection($dataPengadaan);
    }

    public function show(Request $request, DataPengadaan $dataPengadaan)
    {
        $dataPengadaan->load(['poDetail.transaksi.riwayatPenolakan.penolak', 'dataKeuangan', 'makloon']);

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

        if ($dataPengadaan->review_status === 'diterima') {
            abort(422, 'Data Pengadaan sudah diterima dan tidak dapat diubah.');
        }

        $before = $dataPengadaan->only(['harga', 'total_harga', 'status']);
        // Ditangkap lebih awal karena saat pembatalan po_detail dihapus (transaksi dilepas dari PO).
        $transaksiIds = $dataPengadaan->poDetail()->pluck('transaksi_id');

        return DB::transaction(function () use ($request, $dataPengadaan, $validated, $before, $transaksiIds) {
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

            if ($dataPengadaan->status === 'lengkap') {
                $dataPengadaan->review_status = 'menunggu_review';
                $dataPengadaan->catatan_penolakan = null;
                $dataPengadaan->reviewed_by = null;
                $dataPengadaan->reviewed_at = null;
            }

            $dataPengadaan->save();

            if ($dataPengadaan->status === 'lengkap') {
                Transaksi::whereIn('id_transaksi', $transaksiIds)
                    ->update(['current_stage' => 'keuangan']);
            }

            // PO dibatalkan: transaksi dilepas dari PO (po_detail dihapus) dan dikembalikan ke tahap
            // Pengadaan agar bisa digabung ulang ke PO lain (Bagian 3.4). data_pengadaan transaksi
            // kembali null sehingga form gabung muncul lagi di timeline.
            if ($dataPengadaan->status === 'dibatalkan') {
                Transaksi::whereIn('id_transaksi', $transaksiIds)
                    ->update(['current_stage' => 'pengadaan']);
                $dataPengadaan->poDetail()->delete();
            }

            $this->auditLog->logMany($request->user(), 'update_po', $transaksiIds, [
                'data_pengadaan_id' => $dataPengadaan->id,
                'no_po' => $dataPengadaan->no_po,
                'before' => $before,
                'after' => $dataPengadaan->only(['harga', 'total_harga', 'status']),
            ]);

            return response()->json(['data' => $dataPengadaan]);
        });
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
