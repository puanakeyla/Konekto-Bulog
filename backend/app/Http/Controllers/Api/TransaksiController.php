<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TransaksiResource;
use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Services\Transaksi\TransaksiStageService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TransaksiController extends Controller
{
    public function __construct(private TransaksiStageService $service)
    {
    }

    public function index(Request $request)
    {
        $transaksi = Transaksi::where('current_stage', $request->user()->role->nama_role)
            ->with(['dataJemputPangan', 'dataMakloonMpp', 'dataMakloonTjp', 'dataUbJastasma'])
            ->orderBy('created_at')
            ->paginate($request->integer('per_page', 20));

        return TransaksiResource::collection($transaksi);
    }

    public function show(Request $request, Transaksi $transaksi)
    {
        $transaksi->load(['dataJemputPangan', 'dataMakloonMpp', 'dataMakloonTjp', 'dataUbJastasma']);

        return response()->json(['data' => new TransaksiResource($transaksi)]);
    }

    public function store(Request $request)
    {
        $transaksi = $this->service->createTransaksi($request->user());

        return response()->json(['data' => $transaksi], 201);
    }

    public function jemputPangan(Request $request, Transaksi $transaksi)
    {
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');

        $data = $request->validate([
            'id_pemasok' => ['required', 'string', 'max:255'],
            'supir' => ['required', 'string', 'max:255'],
            'plat_mobil' => ['required', 'string', 'max:255'],
            'nama_poktan_gapoktan' => ['required', 'string', 'max:255'],
            'desa' => ['required', 'string', 'max:255'],
            'kecamatan' => ['required', 'string', 'max:255'],
            'kabupaten' => ['required', 'string', 'max:255'],
            'makloon_user_id' => ['required', Rule::exists('users', 'id')->where('role_id', $makloonRoleId)],
            'tanggal_kirim' => ['required', 'date'],
            'kuantum' => ['required', 'numeric', 'min:0'],
            'jarak_ke_makloon_km' => ['required', 'numeric', 'min:0'],
        ]);

        $record = $this->service->submitStage($transaksi, $request->user(), 'jemput_pangan', DataJemputPangan::class, $data);

        return response()->json(['data' => $record]);
    }

    public function makloon(Request $request, Transaksi $transaksi)
    {
        if ($transaksi->skema === 'TJP') {
            $data = $request->validate([
                'tanggal_bongkar' => ['required', 'date'],
                'kuantum_bongkar' => ['required', 'numeric', 'min:0'],
            ]);
            $model = DataMakloonTjp::class;
        } else {
            $data = $request->validate([
                'id_pemasok' => ['required', 'string', 'max:255'],
                'supir' => ['required', 'string', 'max:255'],
                'plat_mobil' => ['required', 'string', 'max:255'],
                'desa' => ['required', 'string', 'max:255'],
                'kecamatan' => ['required', 'string', 'max:255'],
                'kabupaten' => ['required', 'string', 'max:255'],
                'tanggal_bongkar' => ['required', 'date'],
                'kuantum' => ['required', 'numeric', 'min:0'],
                'jarak_ke_makloon_km' => ['required', 'numeric', 'min:0'],
            ]);
            $model = DataMakloonMpp::class;
        }

        $record = $this->service->submitStage($transaksi, $request->user(), 'makloon', $model, $data);

        return response()->json(['data' => $record]);
    }

    public function ubJastasma(Request $request, Transaksi $transaksi)
    {
        $data = $request->validate([
            'ka1' => ['required', 'numeric', 'min:0', 'max:100'],
            'ka2' => ['required', 'numeric', 'min:0', 'max:100'],
            'ka3' => ['required', 'numeric', 'min:0', 'max:100'],
            'hampa' => ['required', 'numeric', 'min:0', 'max:100'],
            'butir_hijau' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);

        $record = $this->service->submitStage($transaksi, $request->user(), 'ub_jastasma', DataUbJastasma::class, $data);

        return response()->json(['data' => $record]);
    }

    public function terima(Request $request, Transaksi $transaksi)
    {
        $record = $this->service->terima($transaksi, $request->user());

        return response()->json(['data' => $record, 'transaksi' => $transaksi->fresh()]);
    }

    public function tolak(Request $request, Transaksi $transaksi)
    {
        $validated = $request->validate([
            'catatan' => ['required', 'string'],
        ]);

        $record = $this->service->tolak($transaksi, $request->user(), $validated['catatan']);

        return response()->json(['data' => $record, 'transaksi' => $transaksi->fresh()]);
    }
}
