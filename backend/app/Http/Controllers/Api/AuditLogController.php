<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $logs = AuditLog::with(['user.role'])
            ->when($request->filled('transaksi_id'), fn ($query) => $query->where('transaksi_id', $request->string('transaksi_id')))
            ->when($request->filled('aksi'), fn ($query) => $query->where('aksi', $request->string('aksi')))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 20));

        return AuditLogResource::collection($logs);
    }
}
