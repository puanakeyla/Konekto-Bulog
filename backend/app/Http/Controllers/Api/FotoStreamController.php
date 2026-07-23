<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class FotoStreamController extends Controller
{
    /**
     * Signature yang valid (dicek oleh middleware 'signed') ADALAH otorisasinya --
     * pengecekan permission/visibilitas Bagian 3.3 sudah terjadi sekali saat link ini
     * diterbitkan di FotoController::link(), sama seperti presigned URL pada umumnya.
     */
    public function stream(Request $request, Media $media)
    {
        $conversion = $request->query('conversion');
        $path = $conversion ? $media->getPath($conversion) : $media->getPath();

        if (! file_exists($path)) {
            abort(404);
        }

        // download=1 (ikut ditandatangani saat link diterbitkan) memaksa unduhan dengan nama
        // ramah "{id_transaksi}-{jenis_foto}.ext", bukan tampil inline di tab.
        if ($request->boolean('download')) {
            $ext = pathinfo($media->file_name, PATHINFO_EXTENSION) ?: 'jpg';
            // id_transaksi mengandung "/" (mis. 00001/07/2026/...) yang ilegal untuk nama file,
            // jadi diganti "-" agar Content-Disposition valid.
            $transaksiId = str_replace(['/', '\\'], '-', (string) $media->model?->transaksi_id);
            $base = $transaksiId !== '' ? "{$transaksiId}-{$media->collection_name}" : $media->collection_name;

            return response()->download($path, "{$base}.{$ext}", [
                'Content-Type' => $media->mime_type,
            ]);
        }

        return response()->file($path, [
            'Content-Type' => $media->mime_type,
        ]);
    }
}
