<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Gudang;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use App\Services\Pengolahan\KerjaanPengolahan;
use App\Services\Pengolahan\PengolahanStages;
use App\Services\Pengolahan\PengolahanStageService;
use App\Services\Transaksi\FotoAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PengolahanController extends Controller
{
    /** Role yang boleh melihat rantai pengolahan sama sekali. Makloon sengaja tidak termasuk. */
    private const ROLE_PEMBACA = ['gudang', 'ub_jastasma', 'operasi', 'pengadaan', 'admin'];

    public function __construct(
        private PengolahanStageService $service,
        private FotoAccessService $fotoAccess,
    ) {
    }

    public function index(Request $request)
    {
        $this->assertPembaca($request);

        $validated = $request->validate([
            'skema' => ['sometimes', Rule::in(PengolahanStages::SKEMA)],
            'antrean' => ['sometimes', 'boolean'],
            'kerjaan' => ['sometimes', Rule::in(KerjaanPengolahan::SEMUA)],
            'search' => ['sometimes', 'string', 'max:100'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $role = $request->user()->role->nama_role;

        $daftar = TransaksiPengolahan::query()
            ->with(['gudang', 'makloon:id,nama_maklon', 'dataGudang.gudang', 'dataLhpk.gudangTujuan', 'moDetail.mo'])
            ->when(isset($validated['skema']), fn ($q) => $q->where('skema', $validated['skema']))
            // Antrean hanya bermakna untuk role yang memegang tahap; admin melihat semuanya.
            ->when(($validated['antrean'] ?? false) && $role !== 'admin', fn ($q) => $q->antreanRole($role))
            ->when(isset($validated['search']), function ($q) use ($validated) {
                $cari = $validated['search'];
                $q->where(function ($sub) use ($cari) {
                    $sub->where('id_pengolahan', 'like', "%{$cari}%")
                        ->orWhereHas('makloon', fn ($m) => $m->where('nama_maklon', 'like', "%{$cari}%"))
                        ->orWhereHas('dataLhpk', fn ($l) => $l->where('no_lhpk', 'like', "%{$cari}%"));
                });
            });

        // Hitung SEBELUM filter kerjaan dipasang: chip harus menunjukkan isi tiap kategori,
        // termasuk kategori yang sedang tidak dipilih.
        $hitung = KerjaanPengolahan::hitung(clone $daftar);

        // select() eksplisit wajib setelah join -- tanpa itu kolom kp_* (id, status, ...) ikut
        // terbaca dan menimpa atribut model.
        $query = KerjaanPengolahan::joinTahap($daftar)
            ->select('transaksi_pengolahan.*')
            ->addSelect(DB::raw(KerjaanPengolahan::ekspresi().' as kerjaan'))
            ->orderByDesc('transaksi_pengolahan.created_at');

        if (isset($validated['kerjaan'])) {
            KerjaanPengolahan::filter($query, $validated['kerjaan']);
        }

        return response()->json([
            ...$query->paginate($validated['per_page'] ?? 25)->toArray(),
            'kerjaan_hitung' => $hitung,
        ]);
    }

    /**
     * Kandidat penggabungan MO: pengolahan yang sudah lolos review Operasi dan belum masuk MO
     * mana pun. Dipakai tabel pemilihan di layar Operasi.
     */
    public function kandidatMo(Request $request)
    {
        abort_unless(in_array($request->user()->role->nama_role, ['operasi', 'admin'], true), 403);

        $validated = $request->validate([
            'makloon_user_id' => ['sometimes', 'integer'],
        ]);

        $rows = TransaksiPengolahan::query()
            ->with(['makloon:id,nama_maklon', 'dataLhpk'])
            ->where('current_stage', 'operasi')
            ->where('status_keseluruhan', 'berjalan')
            ->whereDoesntHave('moDetail')
            ->when(isset($validated['makloon_user_id']), fn ($q) => $q->where('makloon_user_id', $validated['makloon_user_id']))
            ->get()
            // Hanya yang datanya benar-benar sudah diterima Operasi yang layak digabung; sisanya
            // masih menunggu review dan kuantumnya belum final.
            ->filter(fn (TransaksiPengolahan $t) => $t->dataLhpk?->status === 'diterima')
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function rekap(Request $request)
    {
        $this->assertPembaca($request);

        $query = TransaksiPengolahan::query()
            ->with(['gudang', 'makloon:id,nama_maklon', 'dataGudang.gudang', 'dataLhpk.gudangTujuan', 'moDetail.mo'])
            ->orderByDesc('created_at');

        $this->terapkanFilterTerkunci($query, $request->user()->role->nama_role);

        return response()->json(['data' => $query->get()]);
    }

    /**
     * Hanya data terkunci yang masuk rekap -- aturan yang sama dengan rekap SerGab
     * (TransaksiController::terapkanFilterTerkunci): baris baru muncul setelah data tahap milik
     * role itu DITERIMA tahap berikutnya, bukan begitu disimpan atau dikirim. Selama masih draft
     * atau menunggu review, angkanya belum final dan tidak layak direkap.
     *
     * Operasi terkunci saat MO-nya disetujui Pengadaan; Pengadaan saat Nomor OUT sudah terbit
     * (status_keseluruhan 'selesai'). Admin memakai aturan paling longgar -- tahap pertama skema
     * masing-masing -- karena justru admin yang membereskan baris bermasalah di tahap lanjut.
     */
    private function terapkanFilterTerkunci(Builder $query, string $role): void
    {
        match ($role) {
            'gudang' => $query->whereHas('dataGudang', fn (Builder $q) => $q->where('status', 'diterima')),
            'ub_jastasma' => $query->whereHas('dataLhpk', fn (Builder $q) => $q->where('status', 'diterima')),
            'operasi' => $query->whereHas('moDetail.mo', fn (Builder $q) => $q->where('review_status', 'diterima')),
            'pengadaan' => $query->where('status_keseluruhan', 'selesai'),
            // Tahap pertama tiap skema: Gudang untuk GDG, UB Jastasma untuk UBJ.
            'admin' => $query->where(function (Builder $q) {
                $q->where(fn (Builder $t) => $t->where('skema', 'GDG')
                    ->whereHas('dataGudang', fn (Builder $g) => $g->where('status', 'diterima')))
                    ->orWhere(fn (Builder $t) => $t->where('skema', 'UBJ')
                        ->whereHas('dataLhpk', fn (Builder $l) => $l->where('status', 'diterima')));
            }),
            default => null,
        };
    }

    public function show(Request $request, TransaksiPengolahan $pengolahan)
    {
        $this->assertPembaca($request);

        $pengolahan->load([
            'gudang',
            'makloon:id,nama_maklon',
            'creator:id,username,nama_maklon',
            'dataGudang.gudang',
            'dataLhpk.gudangTujuan',
            'moDetail.mo',
            'riwayatPenolakan.penolak:id,username,nama_maklon',
        ]);

        return response()->json([
            'data' => [
                ...$pengolahan->toArray(),
                // Angka yang akan disnapshot ke LHPK saat disimpan -- ditampilkan read-only di form
                // supaya pengisi melihat nilai yang sama dengan yang nanti tersimpan.
                'stok_gudang_berjalan' => Gudang::stokBerjalan($pengolahan->gudang_id),
            ],
        ]);
    }

    public function store(Request $request)
    {
        // Yang dipilih di awal adalah GUDANG-nya. Makloon menyusul dari pengisi tahap pertama
        // (PengolahanStageService::setMakloon) karena di skema UBJ makloon baru diketahui
        // saat LHPK ditulis.
        $validated = $request->validate([
            'skema' => ['required', Rule::in(PengolahanStages::SKEMA)],
            'gudang_id' => ['required', 'integer', Rule::exists('gudang', 'id')],
        ]);

        $transaksi = $this->service->createTransaksi(
            $request->user(),
            $validated['skema'],
            $validated['gudang_id'],
        );

        return response()->json(['data' => $transaksi->load('gudang')], 201);
    }

    public function gudang(Request $request, TransaksiPengolahan $pengolahan)
    {
        $validated = $request->validate([
            'makloon_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'tanggal_masuk_gudang' => ['nullable', 'date'],
            'kuantum_hgl' => ['nullable', 'numeric', 'min:0'],
            'plat_mobil' => ['nullable', 'string', 'max:20'],
            'supir' => ['nullable', 'string', 'max:100'],
            'kirim' => ['sometimes', 'boolean'],
        ]);

        return $this->simpanTahap($request, $pengolahan, 'gudang', $validated);
    }

    public function lhpk(Request $request, TransaksiPengolahan $pengolahan)
    {
        $lhpkId = $pengolahan->dataLhpk?->id;

        // `kuantum_stok_gudang` sengaja TIDAK diterima dari klien: ia dihitung server dari stok
        // berjalan gudangnya (lihat simpanTahap).
        $validated = $request->validate([
            'makloon_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'no_lhpk' => ['nullable', 'string', 'max:100', Rule::unique('pengolahan_lhpk', 'no_lhpk')->ignore($lhpkId)],
            'tanggal_lhpk' => ['nullable', 'date'],
            'kuantum_gabah_diolah' => ['nullable', 'numeric', 'min:0'],
            'kuantum_beras_hgl' => ['nullable', 'numeric', 'min:0'],
            'kualitas' => ['nullable', 'string', 'max:50'],
            'broken' => ['nullable', 'numeric', 'min:0'],
            'menir' => ['nullable', 'numeric', 'min:0'],
            'katul' => ['nullable', 'numeric', 'min:0'],
            'ka1' => ['nullable', 'numeric', 'min:0'],
            'ka2' => ['nullable', 'numeric', 'min:0'],
            'ka3' => ['nullable', 'numeric', 'min:0'],
            'reject' => ['nullable', 'numeric', 'min:0'],
            'kirim' => ['sometimes', 'boolean'],
        ]);

        return $this->simpanTahap($request, $pengolahan, 'ub_jastasma', $validated);
    }

    public function terima(Request $request, TransaksiPengolahan $pengolahan)
    {
        return response()->json(['data' => $this->service->terima($pengolahan, $request->user())]);
    }

    public function tolak(Request $request, TransaksiPengolahan $pengolahan)
    {
        $validated = $request->validate([
            'catatan' => ['required', 'string', 'max:1000'],
        ]);

        return response()->json([
            'data' => $this->service->tolak($pengolahan, $request->user(), $validated['catatan']),
        ]);
    }

    public function fotoUpload(Request $request, TransaksiPengolahan $pengolahan)
    {
        $validated = $request->validate([
            'jenis_foto' => ['required', Rule::in(['foto_notim', 'foto_lhpk'])],
            'foto' => ['required', 'file', 'mimes:jpeg,png', 'max:5120'],
        ]);

        $model = $this->modelFoto($pengolahan, $validated['jenis_foto']);

        if (! $model) {
            abort(422, 'Data tahap untuk foto ini belum ada. Simpan datanya lebih dulu.');
        }

        // Tahap yang sudah dikunci reviewer tidak boleh diganti fotonya -- sama seperti
        // FotoUploadService pada alur SerGab.
        if ($model->locked_at !== null && $request->user()->role->nama_role !== 'admin') {
            abort(422, 'Data tahap ini sudah dikunci, foto tidak bisa diubah.');
        }

        $media = $model->addMedia($request->file('foto'))->toMediaCollection($validated['jenis_foto']);

        return response()->json(['data' => [
            'id' => $media->id,
            'collection_name' => $media->collection_name,
            'file_name' => $media->file_name,
        ]], 201);
    }

    public function fotoLink(Request $request, TransaksiPengolahan $pengolahan, string $jenisFoto)
    {
        $validated = $request->validate([
            'conversion' => ['sometimes', Rule::in(['thumb'])],
            'download' => ['sometimes', 'boolean'],
        ]);

        $this->assertPembaca($request);

        $model = $this->modelFoto($pengolahan, $jenisFoto);
        $media = $model?->getFirstMedia($jenisFoto);

        if (! $media) {
            abort(404, 'Foto tidak ditemukan.');
        }

        return response()->json(['url' => $this->fotoAccess->signedUrl(
            $media,
            $validated['conversion'] ?? null,
            $validated['download'] ?? false,
        )]);
    }

    private function modelFoto(TransaksiPengolahan $pengolahan, string $jenisFoto)
    {
        return match ($jenisFoto) {
            'foto_notim' => $pengolahan->dataGudang,
            'foto_lhpk' => $pengolahan->dataLhpk,
            default => null,
        };
    }

    /** Satu pintu untuk dua tahap berdata: simpan draft, atau kirim kalau `kirim` bernilai true. */
    private function simpanTahap(Request $request, TransaksiPengolahan $pengolahan, string $role, array $validated)
    {
        $kirim = (bool) ($validated['kirim'] ?? false);
        unset($validated['kirim']);

        $makloonUserId = $validated['makloon_user_id'] ?? null;
        unset($validated['makloon_user_id']);

        if ($makloonUserId !== null) {
            $this->assertMakloon($makloonUserId);
            $this->service->setMakloon($pengolahan, $request->user(), $role, $makloonUserId);
        }

        // Gudang tidak lagi diketik per tahap -- kolom tahap cuma menyalin gudang header supaya
        // rekap & Gudang::sudahDipakai() tetap membaca kolom yang sama seperti sebelumnya.
        if ($role === 'gudang') {
            $validated['gudang_id'] = $pengolahan->gudang_id;
        } else {
            $validated['gudang_tujuan_id'] = $pengolahan->gudang_id;
            // Stok gudang adalah angka sistem, bukan ketikan: snapshot stok berjalan gudang ini
            // pada saat LHPK disimpan.
            $validated['kuantum_stok_gudang'] = Gudang::stokBerjalan($pengolahan->gudang_id);
        }

        $record = $kirim
            ? $this->service->submitStage($pengolahan, $request->user(), $role, $validated)
            : $this->service->saveDraft($pengolahan, $request->user(), $role, $validated);

        return response()->json(['data' => $record->fresh()]);
    }

    private function assertPembaca(Request $request): void
    {
        abort_unless(in_array($request->user()->role->nama_role, self::ROLE_PEMBACA, true), 403);
    }

    private function assertMakloon(int $userId): void
    {
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');

        if (! User::where('id', $userId)->where('role_id', $makloonRoleId)->exists()) {
            abort(422, 'User yang dipilih bukan mitra makloon.');
        }
    }
}
