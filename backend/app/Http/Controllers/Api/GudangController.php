<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Gudang;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * CRUD master gudang (Admin). Gudang A/B/C/D adalah DATA, bukan akun user -- lihat
 * migration create_gudang_table untuk latar belakang koreksi ini.
 */
class GudangController extends Controller
{
    public function __construct(private AuditLogService $auditLog)
    {
    }

    public function index()
    {
        return response()->json(['data' => Gudang::orderBy('nama')->get()]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'kode' => ['required', 'string', 'max:30', 'unique:gudang,kode'],
            'nama' => ['required', 'string', 'max:150'],
            'aktif' => ['sometimes', 'boolean'],
        ]);

        $gudang = Gudang::create($validated);

        $this->auditLog->log($request->user(), 'buat_gudang', null, $gudang->only(['id', 'kode', 'nama']));

        return response()->json(['data' => $gudang], 201);
    }

    public function update(Request $request, Gudang $gudang)
    {
        $validated = $request->validate([
            'kode' => ['sometimes', 'string', 'max:30', Rule::unique('gudang', 'kode')->ignore($gudang->id)],
            'nama' => ['sometimes', 'string', 'max:150'],
            'aktif' => ['sometimes', 'boolean'],
        ]);

        $before = $gudang->only(['kode', 'nama', 'aktif']);
        $gudang->fill($validated)->save();

        $this->auditLog->log($request->user(), 'ubah_gudang', null, [
            'id' => $gudang->id,
            'before' => $before,
            'after' => $gudang->only(['kode', 'nama', 'aktif']),
        ]);

        return response()->json(['data' => $gudang]);
    }

    /**
     * Gudang yang sudah dipakai TIDAK dihapus -- baris pengolahan lama akan kehilangan
     * identitas gudangnya dan rekap jadi bolong tanpa jejak. Admin diarahkan menonaktifkan,
     * yang menyembunyikannya dari dropdown tanpa merusak data lama.
     */
    public function destroy(Request $request, Gudang $gudang)
    {
        if ($gudang->sudahDipakai()) {
            abort(422, 'Gudang ini sudah dipakai pada data pengolahan. Nonaktifkan saja agar data lama tetap utuh.');
        }

        $detail = $gudang->only(['id', 'kode', 'nama']);
        $gudang->delete();

        $this->auditLog->log($request->user(), 'hapus_gudang', null, $detail);

        return response()->json(['message' => 'Gudang dihapus.']);
    }
}
