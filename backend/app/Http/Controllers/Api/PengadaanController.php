<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DataPengadaanResource;
use App\Models\DataPengadaan;
use App\Models\Transaksi;
use App\Services\AuditLogService;
use App\Services\NotifikasiService;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Pengadaan\PoLifecycleService;
use App\Services\Pengadaan\PoReviewService;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;

class PengadaanController extends Controller
{
    private const FOTO_SERGAB = [
        'foto_barang',
        'foto_serah_terima',
        'foto_bukti_pembayaran',
        'foto_surat_pernyataan_usia_panen',
    ];

    public function __construct(
        private PoGroupingService $service,
        private PoLifecycleService $lifecycleService,
        private PoReviewService $reviewService,

        private AuditLogService $auditLog,
        private NotifikasiService $notifikasi,
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
            'harga' => ['nullable', 'integer', 'min:0', 'max:9999999999999'],
            'status' => ['sometimes', Rule::in(['proses', 'lengkap', 'kwitansi_belum_upload', 'foto_belum_lengkap', 'dibatalkan'])],
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

        $this->notifikasi->kirimKeRole(['pengadaan'], $request->user(), 'dikirim', 'PO dibuat', "PO {$dataPengadaan->no_po} dibuat dan siap diisi nomor IN.", $validated['transaksi_ids'][0] ?? null, [
            'data_pengadaan_id' => $dataPengadaan->id,
            'no_po' => $dataPengadaan->no_po,
        ]);

        return response()->json(['data' => $dataPengadaan], 201);
    }

    public function update(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'no_po' => ['sometimes', 'string', 'max:255', Rule::unique('data_pengadaan', 'no_po')->ignore($dataPengadaan->id)],
            'harga' => ['sometimes', 'integer', 'min:0', 'max:9999999999999'],
            'status' => ['sometimes', Rule::in(['proses', 'lengkap', 'kwitansi_belum_upload', 'foto_belum_lengkap', 'dibatalkan'])],
        ]);

        if ($dataPengadaan->review_status === 'diterima') {
            abort(422, 'Data Pengadaan sudah diterima dan tidak dapat diubah.');
        }

        // Ditangkap sebelum diubah: dipakai untuk menahan demosi PO yang sudah lepas dari tangan
        // Pengadaan (lihat cabang elseif di bawah).
        $reviewStatusSebelum = $dataPengadaan->review_status;

        $before = $dataPengadaan->only(['no_po', 'harga', 'total_harga', 'status']);
        // Ditangkap lebih awal karena saat pembatalan po_detail dihapus (transaksi dilepas dari PO).
        $transaksiIds = $dataPengadaan->poDetail()->pluck('transaksi_id');

        return DB::transaction(function () use ($request, $dataPengadaan, $validated, $before, $transaksiIds, $reviewStatusSebelum) {
            if (array_key_exists('no_po', $validated)) {
                $dataPengadaan->no_po = $validated['no_po'];
            }

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

            if ($dataPengadaan->status === 'lengkap' && trim((string) $dataPengadaan->no_spp) === '') {
                abort(422, 'No. SPP wajib diisi sebelum PO dikirim ke Keuangan.');
            }

            if ($dataPengadaan->status === 'lengkap') {
                $dataPengadaan->review_status = 'menunggu_review';
                $dataPengadaan->catatan_penolakan = null;
                $dataPengadaan->reviewed_by = null;
                $dataPengadaan->reviewed_at = null;
            } elseif ($dataPengadaan->status !== 'dibatalkan' && $reviewStatusSebelum !== 'menunggu_review') {
                // Disimpan tapi belum lengkap = draft. PO yang sudah diterima Keuangan tidak
                // sampai ke sini -- ditahan penjaga di awal method. PO yang sudah menunggu_review
                // (sudah dikirim ke Keuangan, current_stage anggotanya sudah 'keuangan') sengaja
                // TIDAK didemosikan ke draft di sini: baris di bawah yang memajukan current_stage
                // hanya berjalan saat status 'lengkap', jadi kalau review_status ikut turun ke
                // draft, PO tersangkut -- current_stage tetap 'keuangan' tapi tidak ada kartu
                // review/pembayaran apa pun yang bisa menanganinya (lihat KerjaanTransaksi::ekspresi()).
                $dataPengadaan->review_status = 'draft';
            }

            $dataPengadaan->save();

            if ($dataPengadaan->status === 'lengkap') {
                Transaksi::whereIn('id_transaksi', $transaksiIds)
                    ->update(['current_stage' => 'keuangan']);

                $this->notifikasi->kirimKeRole(['keuangan'], $request->user(), 'dikirim', 'PO dikirim ke Keuangan', "PO {$dataPengadaan->no_po} dikirim ke Keuangan untuk direview.", $transaksiIds->first(), [
                    'data_pengadaan_id' => $dataPengadaan->id,
                    'no_po' => $dataPengadaan->no_po,
                ]);
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
                'after' => $dataPengadaan->only(['no_po', 'harga', 'total_harga', 'status']),
            ]);

            return response()->json(['data' => $dataPengadaan]);
        });
    }

    public function ubahAnggota(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'transaksi_ids' => ['required', 'array', 'min:1'],
            'transaksi_ids.*' => ['required', 'string', Rule::exists('transaksi', 'id_transaksi')],
            'harga' => ['sometimes', 'integer', 'min:0', 'max:9999999999999'],
            'no_po' => ['sometimes', 'string', 'max:255', Rule::unique('data_pengadaan', 'no_po')->ignore($dataPengadaan->id)],
        ]);

        $dataPengadaan = $this->service->ubahAnggota(
            $dataPengadaan,
            $validated['transaksi_ids'],
            $validated['harga'] ?? null,
            $validated['no_po'] ?? null,
        );

        $this->auditLog->logMany($request->user(), 'update_po', $validated['transaksi_ids'], [
            'data_pengadaan_id' => $dataPengadaan->id,
            'no_po' => $dataPengadaan->no_po,
            'anggota' => $validated['transaksi_ids'],
        ]);

        return response()->json(['data' => $dataPengadaan]);
    }

    public function isiNomorIn(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.po_detail_id' => ['required', 'integer'],
            'items.*.no_in' => ['required', 'string', 'max:255'],
            'no_spp' => ['nullable', 'string', 'max:255', Rule::unique('data_pengadaan', 'no_spp')->ignore($dataPengadaan->id)],
            'status' => ['sometimes', Rule::in(['proses', 'lengkap', 'kwitansi_belum_upload', 'foto_belum_lengkap', 'dibatalkan'])],
        ]);

        $dataPengadaan = $this->service->isiNomorIn(
            $dataPengadaan,
            $validated['items'],
            $validated['no_spp'] ?? null,
            $validated['status'] ?? null,
        );

        $this->auditLog->logMany($request->user(), 'isi_nomor_in', $dataPengadaan->poDetail->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'items' => $validated['items'],
            'status' => $dataPengadaan->status,
        ]);

        $this->notifikasi->kirimKeRole(['pengadaan'], $request->user(), 'dikirim', 'Nomor IN disimpan', "Nomor IN PO {$dataPengadaan->no_po} disimpan sebagai draft.", $dataPengadaan->poDetail->first()?->transaksi_id, [
            'data_pengadaan_id' => $dataPengadaan->id,
            'no_po' => $dataPengadaan->no_po,
            'status' => $dataPengadaan->status,
        ]);

        return response()->json(['data' => $dataPengadaan]);
    }

    public function simpanSpp(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'no_spp' => ['required', 'string', 'max:255', Rule::unique('data_pengadaan', 'no_spp')->ignore($dataPengadaan->id)],
        ]);

        if ($dataPengadaan->review_status === 'diterima') {
            abort(422, 'Data Pengadaan sudah diterima dan tidak dapat diubah.');
        }

        if ($dataPengadaan->status === 'dibatalkan') {
            abort(422, 'PO sudah dibatalkan dan tidak dapat diubah.');
        }

        if ($dataPengadaan->poDetail()->whereNull('no_in')->exists()) {
            abort(422, 'Isi seluruh nomor IN sebelum mengisi No. SPP.');
        }

        $before = $dataPengadaan->only(['no_spp', 'review_status']);
        $transaksiIds = $dataPengadaan->poDetail()->pluck('transaksi_id');

        $dataPengadaan->no_spp = $validated['no_spp'];
        if (! in_array($dataPengadaan->review_status, ['menunggu_review', 'diterima'], true)) {
            $dataPengadaan->review_status = 'draft';
        }
        $dataPengadaan->save();

        $this->auditLog->logMany($request->user(), 'simpan_spp_pengadaan', $transaksiIds, [
            'data_pengadaan_id' => $dataPengadaan->id,
            'before' => $before,
            'after' => $dataPengadaan->only(['no_spp', 'review_status']),
        ]);

        $this->notifikasi->kirimKeRole(['keuangan', 'pengadaan'], $request->user(), 'dikirim', 'SPP dikirim', "No. SPP PO {$dataPengadaan->no_po} sudah diisi dan dikirim.", $transaksiIds->first(), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'no_po' => $dataPengadaan->no_po,
            'no_spp' => $dataPengadaan->no_spp,
        ]);

        return response()->json(['data' => $dataPengadaan->fresh('poDetail')]);
    }

    public function fotoIndex(Request $request, DataPengadaan $dataPengadaan)
    {
        return response()->json([
            'data' => collect(self::FOTO_SERGAB)
                ->map(function (string $jenisFoto) use ($dataPengadaan) {
                    $media = $dataPengadaan->getFirstMedia($jenisFoto);
                    if (! $media) {
                        return null;
                    }

                    return [
                        'jenis_foto' => $jenisFoto,
                        'thumb_url' => URL::temporarySignedRoute('foto.stream', now()->addMinutes(5), [
                            'media' => $media->id,
                            'conversion' => 'thumb',
                        ]),
                    ];
                })
                ->filter()
                ->values()
                ->all(),
        ]);
    }

    public function fotoUpload(Request $request, DataPengadaan $dataPengadaan)
    {
        $validated = $request->validate([
            'jenis_foto' => ['required', Rule::in(self::FOTO_SERGAB)],
            'foto' => ['required', 'file', 'mimes:jpeg,png', 'max:5120'],
        ]);

        if ($dataPengadaan->review_status === 'diterima') {
            abort(422, 'Data Pengadaan sudah diterima dan foto tidak dapat diubah.');
        }

        if ($dataPengadaan->status === 'dibatalkan') {
            abort(422, 'PO sudah dibatalkan dan foto tidak dapat diubah.');
        }

        $media = $dataPengadaan
            ->addMedia($request->file('foto'))
            ->toMediaCollection($validated['jenis_foto']);

        return response()->json(['data' => [
            'id' => $media->id,
            'collection_name' => $media->collection_name,
            'file_name' => $media->file_name,
            'size' => $media->size,
            'mime_type' => $media->mime_type,
        ]], 201);
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
            $validated['no_spp'] ?? null,
        );

        $this->auditLog->logMany($request->user(), 'update_pembayaran', $dataPengadaan->poDetail()->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'status_bayar' => $dataKeuangan->status_bayar,
            'tanggal_bayar' => $dataKeuangan->tanggal_bayar,
            'no_spp' => $dataPengadaan->fresh()->no_spp,
        ]);

        $this->notifikasi->kirimKeRole(['pengadaan', 'keuangan'], $request->user(), $dataKeuangan->status_bayar === 'dibayarkan' ? 'diterima' : 'dikirim', 'Pembayaran PO diperbarui', "Pembayaran PO {$dataPengadaan->no_po} diperbarui: {$dataKeuangan->status_bayar}.", $dataPengadaan->poDetail()->value('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'no_po' => $dataPengadaan->no_po,
            'status_bayar' => $dataKeuangan->status_bayar,
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
