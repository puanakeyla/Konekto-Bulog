<?php

namespace App\Http\Resources;

use App\Support\FieldVisibility;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DataJemputPanganResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $role = $request->user()?->role?->nama_role;
        $bolehLihatKuantum = FieldVisibility::bolehLihatDataSensitifJp($role);

        return [
            'id' => $this->id,
            'transaksi_id' => $this->transaksi_id,
            'id_pemasok' => $this->id_pemasok,
            'supir' => $this->supir,
            'plat_mobil' => $this->plat_mobil,
            'nama_poktan_gapoktan' => $this->nama_poktan_gapoktan,
            'desa' => $this->desa,
            'kecamatan' => $this->kecamatan,
            'kabupaten' => $this->kabupaten,
            'makloon_user_id' => $this->makloon_user_id,
            'tanggal_kirim' => $this->tanggal_kirim,
            'kuantum' => $this->when($bolehLihatKuantum, $this->kuantum),
            'jarak_ke_makloon_km' => $this->jarak_ke_makloon_km,
            'status' => $this->status,
            'catatan_penolakan' => $this->catatan_penolakan,
            'locked_at' => $this->locked_at,
            'locked_by' => $this->locked_by,
            'submitted_by' => $this->submitted_by,
            'submitted_at' => $this->submitted_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
