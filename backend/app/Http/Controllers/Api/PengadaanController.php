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

        // Status Sergab dikerjakan Pengadaan SETELAH PO dikirim ke Keuangan (No. SPP), jadi
        // penguncian "sudah diterima" hanya berlaku untuk isi kontrak PO -- nomor, harga, dan
        // pembatalan. Kalau `status` ikut dikunci, Keuangan yang cepat menerima PO akan membuat
        // Pengadaan tidak pernah bisa menutup Sergab-nya.
        $menguncikanKontrak = array_key_exists('no_po', $validated)
            || array_key_exists('harga', $validated)
            || ($validated['status'] ?? null) === 'dibatalkan';
        if ($dataPengadaan->review_status === 'diterima' && $menguncikanKontrak) {
            abort(422, 'Data Pengadaan sudah diterima Keuangan; hanya Status Sergab yang masih bisa diubah.');
        }

        $before = $dataPengadaan->only(['no_po', 'harga', 'total_harga', 'status']);
        // Ditangkap lebih awal karena saat pembatalan po_detail dihapus (transaksi dilepas dari PO).
        $transaksiIds = $dataPengadaan->poDetail()->pluck('transaksi_id');

        return DB::transaction(function () use ($request, $dataPengadaan, $validated, $before, $transaksiIds) {
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
                abort(422, 'No. SPP wajib diisi sebelum Status Sergab bisa dinyatakan lengkap.');
            }

            $dataPengadaan->save();

            // Status Sergab 'lengkap' = langkah penutup. Pengirimannya ke Keuangan sudah terjadi
            // saat No. SPP disimpan (simpanSpp), jadi di sini tinggal menutup transaksinya.
            // `current_stage` dibiarkan di 'keuangan' supaya pembayaran yang belum rampung tetap
            // punya tempat; yang menandai rampung adalah status_keseluruhan.
            if ($dataPengadaan->status === 'lengkap') {
                Transaksi::whereIn('id_transaksi', $transaksiIds)
                    ->update(['status_keseluruhan' => 'selesai']);

                $this->notifikasi->kirimKeRole(['keuangan', 'pengadaan'], $request->user(), 'diterima', 'Status Sergab lengkap', "Status Sergab PO {$dataPengadaan->no_po} lengkap; transaksinya ditandai selesai.", $transaksiIds->first(), [
                    'data_pengadaan_id' => $dataPengadaan->id,
                    'no_po' => $dataPengadaan->no_po,
                ]);
            }

            // PO dibatalkan: transaksi dilepas dari PO (po_detail dihapus) dan dikembalikan ke tahap
            // Pengadaan agar bisa digabung ulang ke PO lain (Bagian 3.4). data_pengadaan transaksi
            // kembali null sehingga form gabung muncul lagi di timeline.
            if ($dataPengadaan->status === 'dibatalkan') {
                // status_keseluruhan ikut dikembalikan: PO yang sempat 'lengkap' sudah menandai
                // transaksinya selesai, dan tanpa reset ini transaksi kembali ke Pengadaan dalam
                // keadaan 'selesai' -- hilang dari semua antrean sehingga tidak bisa digabung ulang.
                Transaksi::whereIn('id_transaksi', $transaksiIds)
                    ->update(['current_stage' => 'pengadaan', 'status_keseluruhan' => 'berjalan']);
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

        // No. SPP ADALAH titik serah ke Keuangan: begitu tersimpan, PO langsung dikirim
        // (review_status 'menunggu_review' + current_stage anggotanya pindah ke 'keuangan')
        // sehingga Keuangan bisa mulai memproses pembayaran. Status Sergab TIDAK lagi jadi
        // syarat kirim -- ia sekarang langkah penutup Pengadaan yang berjalan paralel dan
        // menandai transaksi selesai (lihat update()).
        DB::transaction(function () use ($dataPengadaan, $validated, $transaksiIds) {
            $dataPengadaan->no_spp = $validated['no_spp'];
            $dataPengadaan->review_status = 'menunggu_review';
            $dataPengadaan->catatan_penolakan = null;
            $dataPengadaan->reviewed_by = null;
            $dataPengadaan->reviewed_at = null;
            $dataPengadaan->save();

            Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['current_stage' => 'keuangan']);
        });

        $this->auditLog->logMany($request->user(), 'simpan_spp_pengadaan', $transaksiIds, [
            'data_pengadaan_id' => $dataPengadaan->id,
            'before' => $before,
            'after' => $dataPengadaan->only(['no_spp', 'review_status']),
        ]);

        $this->notifikasi->kirimKeRole(['keuangan', 'pengadaan'], $request->user(), 'dikirim', 'PO dikirim ke Keuangan', "No. SPP PO {$dataPengadaan->no_po} diisi; PO dikirim ke Keuangan.", $transaksiIds->first(), [
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
        // No. SPP sengaja TIDAK diterima di sini. Nomornya milik Pengadaan -- mengisinya adalah
        // aksi yang mengirim PO ke Keuangan (simpanSpp) -- jadi bagi Keuangan sifatnya baca saja.
        // Selama masih boleh dikirim dari endpoint ini, Keuangan bisa menimpa nomor milik tahap
        // sebelumnya, dan mengunci input di UI saja tidak menutup jalannya.
        $validated = $request->validate([
            'status_bayar' => ['required', Rule::in(['belum', 'dibayarkan'])],
            'tanggal_bayar' => ['required_if:status_bayar,dibayarkan', 'nullable', 'date'],
        ]);

        $dataKeuangan = $this->lifecycleService->updatePembayaran(
            $dataPengadaan,
            $validated['status_bayar'],
            $validated['tanggal_bayar'] ?? null,
        );

        $this->auditLog->logMany($request->user(), 'update_pembayaran', $dataPengadaan->poDetail()->pluck('transaksi_id'), [
            'data_pengadaan_id' => $dataPengadaan->id,
            'status_bayar' => $dataKeuangan->status_bayar,
            'tanggal_bayar' => $dataKeuangan->tanggal_bayar,
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
