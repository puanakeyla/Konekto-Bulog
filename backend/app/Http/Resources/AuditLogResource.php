<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'transaksi_id' => $this->transaksi_id,
            'user_id' => $this->user_id,
            'username' => $this->user?->username,
            'role' => $this->user?->role?->nama_role,
            'aksi' => $this->aksi,
            'detail' => $this->detail,
            'created_at' => $this->created_at,
        ];
    }
}
