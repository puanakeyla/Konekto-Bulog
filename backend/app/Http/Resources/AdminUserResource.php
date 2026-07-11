<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'role_id' => $this->role_id,
            'role' => $this->whenLoaded('role'),
            'nama_maklon' => $this->nama_maklon,
            'kecamatan' => $this->kecamatan,
            'kabupaten' => $this->kabupaten,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
