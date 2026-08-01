<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notifikasi;
use Illuminate\Http\Request;

class NotifikasiController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $limit = min(max($request->integer('limit', 15), 1), 50);

        $items = Notifikasi::with(['actor.role'])
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        $unread = Notifikasi::where('user_id', $user->id)->whereNull('read_at')->count();

        return response()->json([
            'data' => $items->map(fn (Notifikasi $item) => [
                'id' => $item->id,
                'tipe' => $item->tipe,
                'judul' => $item->judul,
                'pesan' => $item->pesan,
                'transaksi_id' => $item->transaksi_id,
                'data' => $item->data,
                'read_at' => $item->read_at,
                'created_at' => $item->created_at,
                'actor' => $item->actor ? [
                    'id' => $item->actor->id,
                    'username' => $item->actor->username,
                    'role' => $item->actor->role?->nama_role,
                    'nama_maklon' => $item->actor->nama_maklon,
                    'nama_gudang' => $item->actor->nama_gudang,
                ] : null,
            ])->values(),
            'unread_count' => $unread,
        ]);
    }

    public function markRead(Request $request, Notifikasi $notifikasi)
    {
        abort_unless($notifikasi->user_id === $request->user()->id, 403);

        if ($notifikasi->read_at === null) {
            $notifikasi->read_at = now();
            $notifikasi->save();
        }

        return response()->json(['data' => $notifikasi]);
    }

    public function markAllRead(Request $request)
    {
        Notifikasi::where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Semua notifikasi ditandai sudah dibaca.']);
    }
}
