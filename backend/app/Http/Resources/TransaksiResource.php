<?php

namespace App\Http\Resources;

use App\Models\User;
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
            'nama_maklon' => $this->makloonUser()?->nama_maklon,
            'makloon_kecamatan' => $this->makloonUser()?->kecamatan,
            'makloon_kabupaten' => $this->makloonUser()?->kabupaten,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'data_jemput_pangan' => $this->whenLoaded(
                'dataJemputPangan',
                fn () => $this->dataJemputPangan ? new DataJemputPanganResource($this->dataJemputPangan) : null
            ),
            'data_makloon_mpp' => $this->whenLoaded('dataMakloonMpp'),
            'data_makloon_tjp' => $this->whenLoaded('dataMakloonTjp'),
            'data_ub_jastasma' => $this->whenLoaded('dataUbJastasma'),
            'riwayat_penolakan' => RiwayatPenolakanResource::collection($this->whenLoaded('riwayatPenolakan')),
        ];
    }

    /**
     * User mitra makloon transaksi ini -- sumbernya beda per skema: MPP dibuat oleh
     * makloon sendiri (creator), TJP menunjuk makloon lewat data_jemput_pangan.makloon_user_id.
     * Dipakai frontend untuk mengelompokkan daftar transaksi per makloon beserta lokasinya.
     */
    private function makloonUser(): ?User
    {
        if ($this->skema === 'MPP') {
            return $this->creator;
        }

        return $this->dataJemputPangan?->makloon;
    }
}
