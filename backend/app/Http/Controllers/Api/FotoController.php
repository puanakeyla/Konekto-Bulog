<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaksi;
use App\Services\Transaksi\FotoAccessService;
use App\Services\Transaksi\FotoUploadService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;

class FotoController extends Controller
{
    public function __construct(
        private FotoUploadService $service,
        private FotoAccessService $accessService,
    ) {
    }

    public function store(Request $request, Transaksi $transaksi)
    {
        $validated = $request->validate([
            'jenis_foto' => ['required', 'string'],
            'foto' => ['required', 'file', 'mimes:jpeg,png', 'max:5120'],
            'role' => ['sometimes', 'string'],
        ]);

        $media = $this->service->upload(
            $transaksi,
            $request->user(),
            $validated['jenis_foto'],
            $request->file('foto'),
            $validated['role'] ?? null
        );

        return response()->json(['data' => [
            'id' => $media->id,
            'collection_name' => $media->collection_name,
            'file_name' => $media->file_name,
            'size' => $media->size,
            'mime_type' => $media->mime_type,
        ]], 201);
    }

    /**
     * Daftar foto yang tersimpan untuk transaksi ini (disaring per izin peminta). Dipakai
     * galeri dokumen di Rekap agar hanya menampilkan slot foto yang benar-benar ada, tanpa
     * harus menembak satu per satu. URL tetap diterbitkan lazy lewat link() saat dibuka.
     */
    public function index(Request $request, Transaksi $transaksi)
    {
        return response()->json([
            'data' => $this->accessService->daftarTersedia($transaksi, $request->user()),
        ]);
    }

    /**
     * Bagian 6: bukan URL publik langsung -- endpoint ini (di belakang auth:sanctum) mengecek
     * permission peminta lalu menerbitkan signed URL berumur pendek ke route streaming terpisah.
     * `download=1` menandai URL agar stream mengirim file sebagai attachment (unduhan), bukan inline.
     */
    public function link(Request $request, Transaksi $transaksi, string $jenisFoto)
    {
        $validated = $request->validate([
            'conversion' => ['sometimes', Rule::in(['thumb'])],
            'download' => ['sometimes', 'boolean'],
        ]);

        $media = $this->accessService->resolveDanOtorisasi($transaksi, $jenisFoto, $request->user());

        if (! $media) {
            abort(404, 'Foto tidak ditemukan.');
        }

        $url = URL::temporarySignedRoute('foto.stream', now()->addMinutes(5), array_filter([
            'media' => $media->id,
            'conversion' => $validated['conversion'] ?? null,
            'download' => ($validated['download'] ?? false) ? 1 : null,
        ]));

        return response()->json(['url' => $url]);
    }

    public function destroy(Request $request, Transaksi $transaksi, string $jenisFoto)
    {
        abort_unless($request->user()->role->nama_role === 'admin', 403);

        $media = $this->accessService->resolveDanOtorisasi($transaksi, $jenisFoto, $request->user());

        if (! $media) {
            abort(404, 'Foto tidak ditemukan.');
        }

        $media->delete();

        return response()->json(['message' => 'Foto dihapus.']);
    }
}
