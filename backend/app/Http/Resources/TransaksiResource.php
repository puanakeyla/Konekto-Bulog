<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransaksiResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id_transaksi' => $this->id_transaksi,
            'skema' => $this->skema,
            'current_stage' => $this->current_stage,
            'status_keseluruhan' => $this->status_keseluruhan,
            'created_by' => $this->created_by,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'data_jemput_pangan' => $this->whenLoaded(
                'dataJemputPangan',
                fn () => $this->dataJemputPangan ? new DataJemputPanganResource($this->dataJemputPangan) : null
            ),
            'data_makloon_mpp' => $this->whenLoaded('dataMakloonMpp'),
            'data_makloon_tjp' => $this->whenLoaded('dataMakloonTjp'),
            'data_ub_jastasma' => $this->whenLoaded('dataUbJastasma'),
        ];
    }
}
