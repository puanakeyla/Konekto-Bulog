<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pass-through resource: bentuk item sengaja identik dengan serialisasi model mentah
 * (atribut + relasi yang di-load, snake_case). Tujuannya hanya menyeragamkan envelope
 * daftar PO menjadi { data: [...], meta: {...} } lewat ResourceCollection, sama seperti
 * TransaksiResource, supaya /api/po dan /api/transaksi punya bentuk pagination yang sama.
 * Data PO (agregat level PO) tidak memuat field sensitif Bagian 3.3, jadi tak perlu filter.
 */
class DataPengadaanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request);
    }
}
