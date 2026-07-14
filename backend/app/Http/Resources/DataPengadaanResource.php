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
        $data = parent::toArray($request);

        $poDetails = $this->resource->relationLoaded('poDetail') ? $this->poDetail : collect();
        $operasiRecords = $poDetails->map(fn ($detail) => $detail->dataOperasi)->filter()->values();
        $gudangRecords = $operasiRecords->map(fn ($operasi) => $operasi->dataGudang)->filter()->values();
        $keuanganRecord = $this->resource->relationLoaded('dataKeuangan') ? $this->dataKeuangan : null;

        return array_merge($data, [
            'current_stage' => $poDetails->map(fn ($detail) => $detail->transaksi?->current_stage)->filter()->unique()->values()->all(),
            'review_timeline' => [
                'pengadaan' => $this->reviewSummary($this->resource),
                'keuangan' => $this->reviewSummary($keuanganRecord),
                'operasi' => $this->reviewCollectionSummary($operasiRecords, $poDetails->count()),
                'gudang' => $this->reviewCollectionSummary($gudangRecords, $poDetails->count()),
            ],
        ]);
    }

    private function reviewSummary($record): array
    {
        if (! $record) {
            return [
                'status' => 'belum_ada',
                'catatan_penolakan' => null,
                'reviewed_by' => null,
                'reviewed_at' => null,
            ];
        }

        return [
            'status' => $record->review_status ?? 'menunggu_review',
            'catatan_penolakan' => $record->catatan_penolakan ?? null,
            'reviewed_by' => $record->reviewed_by ?? null,
            'reviewed_at' => $record->reviewed_at ?? null,
        ];
    }

    private function reviewCollectionSummary($records, int $expectedCount): array
    {
        if ($expectedCount === 0 || $records->isEmpty()) {
            return ['status' => 'belum_ada', 'total' => 0, 'diterima' => 0, 'ditolak' => 0, 'menunggu_review' => 0];
        }

        $counts = $records->countBy(fn ($record) => $record->review_status ?? 'menunggu_review');
        $status = 'menunggu_review';
        if (($counts['ditolak'] ?? 0) > 0) {
            $status = 'ditolak';
        } elseif ($records->count() === $expectedCount && ($counts['diterima'] ?? 0) === $expectedCount) {
            $status = 'diterima';
        }

        return [
            'status' => $status,
            'total' => $records->count(),
            'diterima' => $counts['diterima'] ?? 0,
            'ditolak' => $counts['ditolak'] ?? 0,
            'menunggu_review' => $counts['menunggu_review'] ?? 0,
        ];
    }
}
