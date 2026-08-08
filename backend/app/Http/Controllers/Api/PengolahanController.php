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

    /** Batas baris kandidat MO. Layar Operasi memilih dari daftar, bukan membaca laporan. */
    private const BATAS_KANDIDAT = 200;

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
            ->sudahDiisi()
            ->when(isset($validated['skema']), fn ($q) => $q->where('skema', $validated['skema']))
            // Antrean hanya bermakna untuk role yang memegang tahap; admin melihat semuanya.
            ->when(($validated['antrean'] ?? false) && $role !== 'admin', fn ($q) => $q->antreanRole($role))
            // Pencarian sengaja TIDAK memakai whereHas: keduanya menghasilkan EXISTS berkorelasi
            // yang dijalankan ulang untuk tiap baris tabel. Dua-duanya diganti himpunan id yang
            // dihitung SEKALI -- makloon lewat pluck (jumlahnya puluhan), no_lhpk lewat subquery
            // tak berkorelasi di atas indeks unik no_lhpk.
            ->when(isset($validated['search']), function ($q) use ($validated) {
                $cari = $validated['search'];
                $makloonIds = User::where('nama_maklon', 'like', "%{$cari}%")->pluck('id');

                $q->where(function ($sub) use ($cari, $makloonIds) {
                    $sub->where('transaksi_pengolahan.id_pengolahan', 'like', "%{$cari}%")
                        ->orWhereIn('transaksi_pengolahan.id_pengolahan', fn ($s) => $s
                            ->select('transaksi_pengolahan_id')
                            ->from('pengolahan_lhpk')
                            ->where('no_lhpk', 'like', "%{$cari}%"));

                    if ($makloonIds->isNotEmpty()) {
                        $sub->orWhereIn('transaksi_pengolahan.makloon_user_id', $makloonIds);
                    }
                });
            });

        // Hitung SEBELUM filter kerjaan dipasang: chip harus menunjukkan isi tiap kategori,
        // termasuk kategori yang sedang tidak dipilih.
        $hitung = KerjaanPengolahan::hitung(clone $daftar);

        // Tidak ada join tahap lagi: klasifikasinya sudah tersimpan di kolom `kerjaan` dan ikut
        // terbaca sebagai atribut model biasa.
        $query = $daftar->orderByDesc('transaksi_pengolahan.created_at');

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
            'search' => ['sometimes', 'string', 'max:100'],
        ]);

        $rows = TransaksiPengolahan::query()
            ->with(['makloon:id,nama_maklon', 'gudang', 'dataLhpk'])
            ->where('current_stage', 'operasi')
            ->where('status_keseluruhan', 'berjalan')
            ->whereDoesntHave('moDetail')
            // Hanya yang datanya benar-benar sudah diterima Operasi yang layak digabung; sisanya
            // masih menunggu review dan kuantumnya belum final.
            //
            // Dulu penyaringan ini dilakukan di PHP SETELAH ->get(): seluruh baris yang berdiri
            // di tahap Operasi ditarik ke memori lebih dulu. Pada 30k baris itu 6,5 MB JSON dan
            // ~19 detik per permintaan -- dan layar Operasi memanggilnya tiap kali dibuka.
            ->whereHas('dataLhpk', fn ($q) => $q->where('status', 'diterima'))
            ->when(isset($validated['makloon_user_id']), fn ($q) => $q->where('makloon_user_id', $validated['makloon_user_id']))
            ->when(isset($validated['search']), fn ($q) => $q->whereHas(
                'dataLhpk',
                fn ($l) => $l->where('no_lhpk', 'like', '%'.$validated['search'].'%'),
            ))
            ->orderByDesc('created_at')
            // Ini kotak PILIHAN, bukan laporan: batas keras supaya satu makloon dengan ribuan
            // LHPK menganggur tidak pernah bisa merobohkan layarnya.
            ->limit(self::BATAS_KANDIDAT)
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * Rekap dipaginasi -- dulu ia `->get()` seluruh baris beserta 5 relasinya sekaligus, dan pada
     * 30k pengolahan permintaan itu menghabiskan memori PHP (fatal 512 MB) sebelum sempat
     * menjawab. Angka ringkasannya TIDAK dihitung dari halaman yang kebetulan terbuka melainkan
     * dari seluruh himpunan, jadi kartu totalnya tetap benar di halaman berapa pun.
     */
    public function rekap(Request $request)
    {
        $this->assertPembaca($request);

        $validated = $request->validate([
            'skema' => ['sometimes', Rule::in(PengolahanStages::SKEMA)],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:500'],
        ]);

        $query = TransaksiPengolahan::query()
            ->when(isset($validated['skema']), fn ($q) => $q->where('skema', $validated['skema']))
            ->orderByDesc('created_at');

        $this->terapkanFilterTerkunci($query, $request->user()->role->nama_role);

        $ringkasan = (clone $query)
            ->leftJoin('pengolahan_lhpk as rk_l', 'rk_l.transaksi_pengolahan_id', '=', 'transaksi_pengolahan.id_pengolahan')
            ->reorder()
            ->selectRaw('COUNT(*) as baris, COALESCE(SUM(rk_l.kuantum_beras_hgl), 0) as beras_hgl')
            ->first();

        $halaman = $query
            ->with(['gudang', 'makloon:id,nama_maklon', 'dataGudang.gudang', 'dataLhpk.gudangTujuan', 'moDetail.mo'])
            ->paginate($validated['per_page'] ?? 200);

        return response()->json([
            ...$halaman->toArray(),
            'ringkasan' => [
                'baris' => (int) $ringkasan->baris,
                'beras_hgl' => (float) $ringkasan->beras_hgl,
            ],
        ]);
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

    /**
     * Membatalkan pengolahan yang belum berisi apa pun. Yang sudah punya data tahap TIDAK boleh
     * lewat sini -- membatalkan pekerjaan orang lain bukan urusan tombol batal, itu jalurnya
     * penolakan tahap.
     */
    public function destroy(Request $request, TransaksiPengolahan $pengolahan)
    {
        $user = $request->user();

        abort_unless(
            $pengolahan->created_by === $user->id || $user->role->nama_role === 'admin',
            403,
            'Hanya pembuatnya yang bisa membatalkan pengolahan ini.',
        );

        abort_unless($pengolahan->masihKosong(), 422, 'Pengolahan ini sudah berisi data dan tidak bisa dibatalkan.');

        $pengolahan->delete();

        return response()->noContent();
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
