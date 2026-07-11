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

        return response()->file($path, [
            'Content-Type' => $media->mime_type,
        ]);
    }
}
