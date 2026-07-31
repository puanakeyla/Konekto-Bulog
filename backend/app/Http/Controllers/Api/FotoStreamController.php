<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\HeaderUtils;

class FotoStreamController extends Controller
{
    /**
     * Signature yang valid (dicek oleh middleware 'signed') ADALAH otorisasinya --
     * pengecekan permission/visibilitas Bagian 3.3 sudah terjadi sekali saat link ini
     * diterbitkan di FotoController::link(), sama seperti presigned URL pada umumnya.
     */
    public function stream(Request $request, Media $media)
    {
        $conversion = (string) $request->query('conversion');
        $path = $conversion ? $media->getPath($conversion) : $media->getPath();

        // Konversi (thumb) dibuat lewat queue; selama worker belum memprosesnya file itu belum
        // ada. Jatuhkan ke berkas asli daripada 404 -- isinya sama, hanya lebih besar, sehingga
        // pratinjau foto tetap tampil di mesin/deploy yang queue worker-nya belum jalan.
        if ($conversion && ! file_exists($path)) {
            $conversion = '';
            $path = $media->getPath();
        }

        if (! file_exists($path)) {
            abort(404);
        }

        // URL bertanda tangan hanya berlaku 5 menit, jadi cache boleh sepanjang itu: tanpa
        // header ini browser mengunduh ulang tiap gambar setiap kali dirender.
        $headers = [
            'Content-Type' => $media->mime_type,
            'Cache-Control' => 'private, max-age=300',
        ];

        // download=1 (ikut ditandatangani saat link diterbitkan) memaksa unduhan dengan nama
        // ramah "{id_transaksi}-{jenis_foto}.ext", bukan tampil inline di tab.
        $namaUnduhan = $request->boolean('download') ? $this->namaUnduhan($media) : null;

        if ($prefix = config('foto.xaccel_prefix')) {
            $headers['X-Accel-Redirect'] = rtrim($prefix, '/').'/'.$media->getPathRelativeToRoot($conversion);
            if ($namaUnduhan !== null) {
                $headers['Content-Disposition'] = HeaderUtils::makeDisposition('attachment', $namaUnduhan);
            }

            return response('', 200, $headers);
        }

        if ($namaUnduhan !== null) {
            return response()->download($path, $namaUnduhan, $headers);
        }

        return response()->file($path, $headers);
    }

    private function namaUnduhan(Media $media): string
    {
        $ext = pathinfo($media->file_name, PATHINFO_EXTENSION) ?: 'jpg';
        // id_transaksi mengandung "/" (mis. 00001/07/2026/...) yang ilegal untuk nama file,
        // jadi diganti "-" agar Content-Disposition valid.
        $transaksiId = str_replace(['/', '\\'], '-', (string) $media->model?->transaksi_id);
        $base = $transaksiId !== '' ? "{$transaksiId}-{$media->collection_name}" : $media->collection_name;

        return "{$base}.{$ext}";
    }
}
