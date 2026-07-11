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
     * Bagian 6: bukan URL publik langsung -- endpoint ini (di belakang auth:sanctum) mengecek
     * permission peminta lalu menerbitkan signed URL berumur pendek ke route streaming terpisah.
     */
    public function link(Request $request, Transaksi $transaksi, string $jenisFoto)
    {
        $validated = $request->validate([
            'conversion' => ['sometimes', Rule::in(['thumb'])],
        ]);

        $media = $this->accessService->resolveDanOtorisasi($transaksi, $jenisFoto, $request->user());

        if (! $media) {
            abort(404, 'Foto tidak ditemukan.');
        }

        $url = URL::temporarySignedRoute('foto.stream', now()->addMinutes(5), array_filter([
            'media' => $media->id,
            'conversion' => $validated['conversion'] ?? null,
        ]));

        return response()->json(['url' => $url]);
    }
}
