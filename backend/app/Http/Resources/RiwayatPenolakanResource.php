<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RiwayatPenolakanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tahap' => $this->tahap,
            'catatan' => $this->catatan,
            'ditolak_oleh' => $this->ditolak_oleh,
            'ditolak_oleh_nama' => $this->penolak?->nama_maklon ?? $this->penolak?->username,
            'ditolak_pada' => $this->ditolak_pada,
        ];
    }
}
