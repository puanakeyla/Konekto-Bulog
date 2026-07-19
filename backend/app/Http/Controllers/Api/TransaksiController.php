<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TransaksiResource;
use App\Models\DataJemputPangan;
use App\Models\DataKeuangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Services\AuditLogService;
use App\Services\Transaksi\TransaksiStageService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TransaksiController extends Controller
{
    public function __construct(
        private TransaksiStageService $service,
        private AuditLogService $auditLog,
    )
    {
    }

    public function index(Request $request)
    {
        $query = Transaksi::where('current_stage', $request->user()->role->nama_role)
            ->with(['dataJemputPangan.makloon', 'dataMakloonMpp', 'dataMakloonTjp', 'dataUbJastasma', 'creator'])
            ->orderBy('created_at');

        // Khusus daftar "siap PO" di Pengadaan: hanya transaksi yang UB Jastasma-nya
        // sudah diterima (menunggu_review = belum ditinjau Pengadaan, jangan dimunculkan).
        if ($request->boolean('siap_po')) {
            $query->whereHas('dataUbJastasma', fn ($q) => $q->where('status', 'diterima'));
        }

        $transaksi = $query->paginate($request->integer('per_page', 20));

        return TransaksiResource::collection($transaksi);
    }

    /**
     * Rekap lintas tahap untuk halaman tabel/ekspor. Beda dari index(): TIDAK difilter
     * `current_stage`, jadi transaksi tetap tampil walau sudah lewat tahap role tersebut.
     * Data tiap tahap ikut dimuat sehingga tabel selalu mencerminkan kondisi terkini —
     * termasuk status kunci tiap tahap (`menunggu_review`/`diterima`/`ditolak`).
     * Visibilitas field tetap dijaga oleh resource masing-masing (lihat FieldVisibility).
     */
    public function rekap(Request $request)
    {
        $role = $request->user()->role->nama_role;

        $query = Transaksi::query()
            ->select('transaksi.*')
            ->with([
                'dataJemputPangan.makloon',
                'dataMakloonMpp',
                'dataMakloonTjp',
                'dataUbJastasma',
                'poDetail.dataPengadaan.poDetail',
                'poDetail.dataPengadaan.dataKeuangan',
                'creator',
            ])
            // Urutan blok skema: TJP dulu, baru MPP. TIDAK memakai orderBy('skema') biasa --
            // kolom `skema` adalah ENUM di MySQL (urut sesuai deklarasi ['TJP', 'MPP']),
            // tapi di SQLite (test) ENUM cuma jadi TEXT + CHECK constraint yang diurutkan
            // alfabetis, sehingga 'MPP' < 'TJP' dan blok MPP malah nongol di depan. CASE
            // eksplisit ini menghasilkan urutan yang sama persis di kedua engine.
            ->orderByRaw("CASE skema WHEN 'TJP' THEN 0 WHEN 'MPP' THEN 1 ELSE 2 END")
            // Kunci urut satu PO = id_transaksi TERKECIL di antara anggotanya (lewat
            // po_detail), BUKAN no_po. `no_po` adalah teks bebas yang diketik user ("PO lala",
            // "jaja", "PO1234", dst) -- mengurutkannya secara alfabetis tidak punya hubungan
            // dengan urutan id_transaksi, sehingga blok PO bisa muncul tidak berurutan walau
            // id_transaksi-nya sendiri sudah urut (ini defect yang dilaporkan: "ID Transaksi
            // belum urut tapi skemanya sudah"). Transaksi tanpa PO memakai id_transaksi-nya
            // sendiri lewat COALESCE, jadi tidak perlu penanganan NULL terpisah. Baris-baris
            // satu PO tetap berdampingan karena semua anggotanya memakai kunci yang sama --
            // itu prasyarat sel gabungan di tabel frontend. JANGAN disederhanakan balik ke
            // `orderBy('no_po')`.
            ->orderByRaw('COALESCE((
                SELECT MIN(pd2.transaksi_id)
                FROM po_detail pd1
                JOIN po_detail pd2 ON pd2.data_pengadaan_id = pd1.data_pengadaan_id
                WHERE pd1.transaksi_id = transaksi.id_transaksi
            ), transaksi.id_transaksi)')
            ->orderBy('id_transaksi');

        // Role Jemput Pangan hanya relevan dengan skema TJP (MPP tidak punya tahap JP).
        if ($role === 'jemput_pangan') {
            $query->where('skema', 'TJP');
        }

        $this->terapkanFilterTerkunci($query, $role);

        $transaksi = $query->paginate($request->integer('per_page', 100));

        return TransaksiResource::collection($transaksi);
    }

    /**
     * Hanya data terkunci yang boleh masuk rekap. "Terkunci" = sudah disimpan dan sudah
     * diterima role berikutnya, sehingga tidak bisa diubah lagi kecuali oleh admin —
     * persis kondisi yang ditolak TransaksiStageService::submitStage().
     *
     * Tahap per transaksi memakai kolom `status`; tahap level PO (pengadaan/keuangan)
     * memakai `review_status` karena datanya milik PO gabungan, bukan satu transaksi.
     * Admin memakai aturan paling longgar (tahap awal saja) karena justru admin yang
     * bertugas memperbaiki transaksi bermasalah di tahap-tahap lanjut.
     */
    private function terapkanFilterTerkunci(Builder $query, string $role): void
    {
        match ($role) {
            'jemput_pangan' => $query->whereHas('dataJemputPangan',
                fn (Builder $q) => $q->where('status', 'diterima')),
            'ub_jastasma' => $query->whereHas('dataUbJastasma',
                fn (Builder $q) => $q->where('status', 'diterima')),
            'makloon' => $query->where(function (Builder $q) {
                $q->where(fn (Builder $t) => $t->where('skema', 'TJP')
                    ->whereHas('dataMakloonTjp', fn (Builder $m) => $m->where('status', 'diterima')))
                    ->orWhere(fn (Builder $t) => $t->where('skema', 'MPP')
                        ->whereHas('dataMakloonMpp', fn (Builder $m) => $m->where('status', 'diterima')));
            }),
            'pengadaan' => $query->whereHas('poDetail.dataPengadaan',
                fn (Builder $q) => $q->where('review_status', 'diterima')),
            // Keuangan selesai/terkunci ketika pembayaran sudah dicatat. Modul Operasi
            // sekarang berdiri sendiri, jadi tidak ada lagi review tahap berikutnya yang
            // mengubah data_keuangan.review_status menjadi "diterima".
            'keuangan' => $query->whereHas('poDetail.dataPengadaan.dataKeuangan',
                fn (Builder $q) => $q->where('status_bayar', 'dibayarkan')),
            // Tahap awal: Jemput Pangan untuk TJP, Makloon untuk MPP (lihat TransaksiStages::sequence()).
            'admin' => $query->where(function (Builder $q) {
                $q->where(fn (Builder $t) => $t->where('skema', 'TJP')
                    ->whereHas('dataJemputPangan', fn (Builder $m) => $m->where('status', 'diterima')))
                    ->orWhere(fn (Builder $t) => $t->where('skema', 'MPP')
                        ->whereHas('dataMakloonMpp', fn (Builder $m) => $m->where('status', 'diterima')));
            }),
            default => null,
        };
    }

    public function show(Request $request, Transaksi $transaksi)
    {
        $transaksi->load([
            'dataJemputPangan.makloon',
            'dataMakloonMpp',
            'dataMakloonTjp',
            'dataUbJastasma',
            'creator',
            'riwayatPenolakan.penolak',
            // PO tempat transaksi ini bernaung (bila sudah tergabung). Dimuat lengkap dengan
            // seluruh transaksi anggota + data keuangan supaya panel Pengadaan/Keuangan bisa
            // dirender inline di timeline tanpa memanggil endpoint /po terpisah.
            'poDetail.dataPengadaan.poDetail.transaksi',
            'poDetail.dataPengadaan.dataKeuangan',
            'poDetail.dataPengadaan.makloon',
        ]);

        $transaksi->setRelation('riwayatPenolakan', $transaksi->riwayatPenolakan->sortBy('ditolak_pada')->values());

        return response()->json(['data' => new TransaksiResource($transaksi)]);
    }

    public function adminUpdateRekap(Request $request, Transaksi $transaksi)
    {
        abort_unless($request->user()->role->nama_role === 'admin', 403);

        $validated = $request->validate([
            'data_jemput_pangan' => ['sometimes', 'array'],
            'data_jemput_pangan.id_pemasok' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.supir' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.plat_mobil' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.nama_poktan_gapoktan' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.desa' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.kecamatan' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.kabupaten' => ['nullable', 'string', 'max:255'],
            'data_jemput_pangan.makloon_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'data_jemput_pangan.tanggal_kirim' => ['nullable', 'date'],
            'data_jemput_pangan.kuantum' => ['nullable', 'numeric', 'min:0'],
            'data_jemput_pangan.jarak_ke_makloon_km' => ['nullable', 'numeric', 'min:0'],

            'data_makloon_tjp' => ['sometimes', 'array'],
            'data_makloon_tjp.tanggal_bongkar' => ['nullable', 'date'],
            'data_makloon_tjp.kuantum_bongkar' => ['nullable', 'numeric', 'min:0'],

            'data_makloon_mpp' => ['sometimes', 'array'],
            'data_makloon_mpp.id_pemasok' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.supir' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.plat_mobil' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.desa' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.kecamatan' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.kabupaten' => ['nullable', 'string', 'max:255'],
            'data_makloon_mpp.tanggal_bongkar' => ['nullable', 'date'],
            'data_makloon_mpp.kuantum' => ['nullable', 'numeric', 'min:0'],
            'data_makloon_mpp.jarak_ke_makloon_km' => ['nullable', 'numeric', 'min:0'],

            'data_ub_jastasma' => ['sometimes', 'array'],
            'data_ub_jastasma.ka1' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.ka2' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.ka3' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.hampa' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'data_ub_jastasma.butir_hijau' => ['nullable', 'numeric', 'min:0', 'max:100'],

            'data_pengadaan' => ['sometimes', 'array'],
            'data_pengadaan.no_po' => ['nullable', 'string', 'max:255'],
            'data_pengadaan.no_in' => ['nullable', 'string', 'max:255'],
            'data_pengadaan.harga' => ['nullable', 'numeric', 'min:0'],
            'data_pengadaan.no_spp' => ['nullable', 'string', 'max:255'],
            'data_pengadaan.tanggal_bayar' => ['nullable', 'date'],
        ]);

        return DB::transaction(function () use ($request, $transaksi, $validated) {
            $before = $this->adminSnapshot($transaksi);

            if (array_key_exists('data_jemput_pangan', $validated) && $transaksi->dataJemputPangan) {
                $transaksi->dataJemputPangan->update($validated['data_jemput_pangan']);
            }

            if (array_key_exists('data_makloon_tjp', $validated) && $transaksi->dataMakloonTjp) {
                $transaksi->dataMakloonTjp->update($validated['data_makloon_tjp']);
            }

            if (array_key_exists('data_makloon_mpp', $validated) && $transaksi->dataMakloonMpp) {
                $transaksi->dataMakloonMpp->update($validated['data_makloon_mpp']);
            }

            if (array_key_exists('data_ub_jastasma', $validated) && $transaksi->dataUbJastasma) {
                $transaksi->dataUbJastasma->update($validated['data_ub_jastasma']);
            }

            if (array_key_exists('data_pengadaan', $validated)) {
                $poDetail = $transaksi->poDetail()->with('dataPengadaan.dataKeuangan')->first();
                $pengadaan = $poDetail?->dataPengadaan;
                $payload = $validated['data_pengadaan'];

                if ($pengadaan) {
                    $pengadaanData = array_intersect_key($payload, array_flip(['no_po', 'harga', 'no_spp']));
                    if (array_key_exists('harga', $pengadaanData)) {
                        $pengadaanData['total_harga'] = number_format((float) $pengadaan->total_kuantum * (float) $pengadaanData['harga'], 2, '.', '');
                    }
                    if ($pengadaanData !== []) {
                        $pengadaan->update($pengadaanData);
                    }

                    if (array_key_exists('no_in', $payload) && $poDetail) {
                        $poDetail->update(['no_in' => $payload['no_in']]);
                    }

                    if (array_key_exists('tanggal_bayar', $payload)) {
                        DataKeuangan::updateOrCreate(
                            ['data_pengadaan_id' => $pengadaan->id],
                            ['tanggal_bayar' => $payload['tanggal_bayar'], 'status_bayar' => $payload['tanggal_bayar'] ? 'dibayarkan' : 'belum']
                        );
                    }
                }
            }

            $this->auditLog->log($request->user(), 'admin_rekap_update', $transaksi->id_transaksi, [
                'before' => $before,
                'after' => $this->adminSnapshot($transaksi->fresh()),
            ]);

            $transaksi->load(['dataJemputPangan.makloon', 'dataMakloonMpp', 'dataMakloonTjp', 'dataUbJastasma', 'poDetail.dataPengadaan.poDetail', 'poDetail.dataPengadaan.dataKeuangan', 'creator']);

            return response()->json(['data' => new TransaksiResource($transaksi)]);
        });
    }

    public function destroy(Request $request, Transaksi $transaksi)
    {
        abort_unless($request->user()->role->nama_role === 'admin', 403);

        return DB::transaction(function () use ($request, $transaksi) {
            $transaksiId = $transaksi->id_transaksi;
            $poIds = $transaksi->poDetail()->pluck('data_pengadaan_id')->unique()->values();

            $this->auditLog->log($request->user(), 'admin_rekap_delete', $transaksiId, [
                'transaksi' => $this->adminSnapshot($transaksi),
            ]);

            $transaksi->delete();

            foreach ($poIds as $poId) {
                $pengadaan = \App\Models\DataPengadaan::with('poDetail')->find($poId);
                if (! $pengadaan) {
                    continue;
                }

                $totalKuantum = (float) $pengadaan->poDetail->sum('kuantum_kontribusi');
                if ($totalKuantum <= 0) {
                    $pengadaan->delete();
                    continue;
                }

                $pengadaan->update([
                    'total_kuantum' => number_format($totalKuantum, 2, '.', ''),
                    'total_harga' => number_format($totalKuantum * (float) $pengadaan->harga, 2, '.', ''),
                ]);
            }

            return response()->json(['message' => 'Transaksi dihapus dari rekap.']);
        });
    }

    private function adminSnapshot(Transaksi $transaksi): array
    {
        $transaksi->loadMissing(['dataJemputPangan', 'dataMakloonMpp', 'dataMakloonTjp', 'dataUbJastasma', 'poDetail.dataPengadaan.dataKeuangan']);
        $pengadaan = $transaksi->poDetail->first()?->dataPengadaan;

        return [
            'id_transaksi' => $transaksi->id_transaksi,
            'skema' => $transaksi->skema,
            'current_stage' => $transaksi->current_stage,
            'status_keseluruhan' => $transaksi->status_keseluruhan,
            'data_jemput_pangan' => $transaksi->dataJemputPangan?->only(['id_pemasok', 'supir', 'plat_mobil', 'nama_poktan_gapoktan', 'desa', 'kecamatan', 'kabupaten', 'makloon_user_id', 'tanggal_kirim', 'kuantum', 'jarak_ke_makloon_km']),
            'data_makloon_tjp' => $transaksi->dataMakloonTjp?->only(['tanggal_bongkar', 'kuantum_bongkar']),
            'data_makloon_mpp' => $transaksi->dataMakloonMpp?->only(['id_pemasok', 'supir', 'plat_mobil', 'desa', 'kecamatan', 'kabupaten', 'tanggal_bongkar', 'kuantum', 'jarak_ke_makloon_km']),
            'data_ub_jastasma' => $transaksi->dataUbJastasma?->only(['ka1', 'ka2', 'ka3', 'hampa', 'butir_hijau']),
            'data_pengadaan' => $pengadaan ? [
                'no_po' => $pengadaan->no_po,
                'no_in' => $transaksi->poDetail->first()?->no_in,
                'harga' => $pengadaan->harga,
                'no_spp' => $pengadaan->no_spp,
                'tanggal_bayar' => $pengadaan->dataKeuangan?->tanggal_bayar,
            ] : null,
        ];
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
