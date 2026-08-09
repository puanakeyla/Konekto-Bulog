<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Gudang;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\Pengolahan\KerjaanPengolahan;
use App\Services\Pengolahan\PengolahanStages;
use App\Services\Pengolahan\PengolahanStageService;
use App\Services\Transaksi\FotoAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
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
        private AuditLogService $auditLog,
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
            ->when(isset($validated['skema']), fn ($q) => $q->where('skema', $validated['skema']));

        $this->terapkanFilterTerkunci($query, $request->user()->role->nama_role);

        // Diklon SEBELUM join & select di bawah dipasang: `selectRaw` menambah, bukan mengganti,
        // jadi `select('transaksi_pengolahan.*')` akan tercampur dengan COUNT(*) di sini.
        $ringkasan = (clone $query)
            ->leftJoin('pengolahan_lhpk as rk_l', 'rk_l.transaksi_pengolahan_id', '=', 'transaksi_pengolahan.id_pengolahan')
            ->reorder()
            ->selectRaw('COUNT(*) as baris, COALESCE(SUM(rk_l.kuantum_beras_hgl), 0) as beras_hgl')
            ->first();

        $halaman = $query
            // Kolom No. MO/TM/OUT milik MO gabungan, bukan satu pengolahan, jadi tabel frontend
            // menggabungkan selnya (mergeKey). Sel gabungan hanya benar kalau seluruh anggota satu
            // MO BERDAMPINGAN, dan itu tugas urutan di sini -- persis prasyarat blok PO di
            // TransaksiController::rekap(). Kunci grupnya created_at MO (sama untuk semua
            // anggotanya), dengan pengolahan tanpa MO memakai created_at-nya sendiri lewat
            // COALESCE sehingga tetap terurut kronologis di antara grup-grup itu. id MO menjadi
            // pemisah kalau dua MO lahir pada detik yang sama. JANGAN dibalik ke orderByDesc
            // ('created_at') saja -- itu membuat anggota satu MO terselip-selip dan sel gabungannya
            // pecah jadi beberapa potong.
            ->select('transaksi_pengolahan.*')
            ->leftJoin('pengolahan_mo_detail as rk_md', 'rk_md.transaksi_pengolahan_id', '=', 'transaksi_pengolahan.id_pengolahan')
            ->leftJoin('pengolahan_mo as rk_mo', 'rk_mo.id', '=', 'rk_md.pengolahan_mo_id')
            ->orderByRaw('COALESCE(rk_mo.created_at, transaksi_pengolahan.created_at) DESC')
            ->orderBy('rk_md.pengolahan_mo_id')
            ->orderByDesc('transaksi_pengolahan.created_at')
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

    /**
     * Cermin TransaksiController::SCOPE_EDIT_REKAP untuk rantai pengolahan: blok yang boleh
     * disentuh tiap role saat aksesnya dibuka admin. Operasi & Pengadaan tidak punya tabel
     * tahap sendiri -- datanya hidup di MO gabungan, jadi bloknya `mo` dengan daftar kolom.
     *
     * Konsekuensi yang disengaja (sama seperti blok PO di rekap SerGab): mengubah nomor MO
     * lewat satu baris ikut mengubahnya untuk seluruh anggota MO itu, karena memang satu
     * nomor untuk satu gabungan.
     */
    private const SCOPE_EDIT_REKAP = [
        'gudang' => ['data_gudang' => null],
        'ub_jastasma' => ['data_lhpk' => null],
        'operasi' => ['mo' => ['no_mo', 'no_tm_ada', 'no_tm_gudang']],
        'pengadaan' => ['mo' => ['no_out', 'tanggal_out']],
    ];

    /**
     * Koreksi data pengolahan yang sudah terkunci, padanan TransaksiController::adminUpdateRekap.
     * Admin bebas seluruh blok; role lain hanya selama jatah editnya masih ada DAN hanya blok
     * milik role-nya (SCOPE_EDIT_REKAP), lalu jatahnya berkurang satu.
     *
     * Tanpa padanan Transaksi::dimilikiOleh(): rantai pengolahan tidak punya kolom pemilik per
     * baris sama sekali. Gudang, Operasi, dan Pengadaan masing-masing satu akun pusat, dan LHPK
     * pun tidak mencatat petugas pemiliknya -- pembatasnya tinggal scope field di atas.
     */
    public function adminUpdateRekap(Request $request, TransaksiPengolahan $pengolahan)
    {
        $user = $request->user();
        $role = $user->role->nama_role;

        $this->assertPembaca($request);
        abort_unless($user->bolehEditRekap(), 403, 'Akses edit rekap Anda belum dibuka Admin.');

        $mo = $pengolahan->moDetail?->mo;

        $validated = $request->validate([
            'data_gudang' => ['sometimes', 'array'],
            'data_gudang.tanggal_masuk_gudang' => ['nullable', 'date'],
            'data_gudang.kuantum_hgl' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'data_gudang.plat_mobil' => ['nullable', 'string', 'max:20'],
            'data_gudang.supir' => ['nullable', 'string', 'max:100'],

            'data_lhpk' => ['sometimes', 'array'],
            'data_lhpk.no_lhpk' => ['nullable', 'string', 'max:100', Rule::unique('pengolahan_lhpk', 'no_lhpk')->ignore($pengolahan->dataLhpk?->id)],
            'data_lhpk.tanggal_lhpk' => ['nullable', 'date'],
            'data_lhpk.kuantum_gabah_diolah' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'data_lhpk.kuantum_beras_hgl' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'data_lhpk.kualitas' => ['nullable', 'string', 'max:50'],
            'data_lhpk.broken' => ['nullable', 'numeric', 'min:0'],
            'data_lhpk.menir' => ['nullable', 'numeric', 'min:0'],
            'data_lhpk.katul' => ['nullable', 'numeric', 'min:0'],
            'data_lhpk.ka1' => ['nullable', 'numeric', 'min:0'],
            'data_lhpk.ka2' => ['nullable', 'numeric', 'min:0'],
            'data_lhpk.ka3' => ['nullable', 'numeric', 'min:0'],
            'data_lhpk.reject' => ['nullable', 'numeric', 'min:0'],

            'mo' => ['sometimes', 'array'],
            // `required` di dalam `sometimes`: kalau kunci no_mo dikirim ia tidak boleh kosong --
            // MO tanpa nomor tidak pernah sah, tidak seperti No. OUT yang wajar belum terbit.
            'mo.no_mo' => ['sometimes', 'required', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_mo')->ignore($mo?->id)],
            'mo.no_tm_ada' => ['sometimes', 'nullable', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_tm_ada')->ignore($mo?->id)],
            'mo.no_tm_gudang' => ['sometimes', 'nullable', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_tm_gudang')->ignore($mo?->id)],
            'mo.no_out' => ['sometimes', 'nullable', 'string', 'max:100', Rule::unique('pengolahan_mo', 'no_out')->ignore($mo?->id)],
            'mo.tanggal_out' => ['sometimes', 'nullable', 'date'],
        ]);

        // Penjaganya di sini, bukan di UI: payload yang dirakit manual pun disaring ke blok
        // milik role pengirim lebih dulu.
        if ($role !== 'admin') {
            $validated = $this->batasiScopeRekap($validated, $role);
            abort_if($validated === [], 403, 'Tidak ada data tahap Anda yang bisa diubah di pengolahan ini.');
        }

        return DB::transaction(function () use ($request, $user, $role, $pengolahan, $mo, $validated) {
            $sebelum = $this->snapshotRekap($pengolahan);

            if (array_key_exists('data_gudang', $validated) && $pengolahan->dataGudang) {
                $pengolahan->dataGudang->update($validated['data_gudang']);
            }

            if (array_key_exists('data_lhpk', $validated) && $pengolahan->dataLhpk) {
                $pengolahan->dataLhpk->update($validated['data_lhpk']);
            }

            // MO sengaja tidak dicek terkunci(): justru MO yang sudah final itulah yang tidak
            // punya jalur perbaikan lain -- itu alasan halaman rekap ini ada.
            if (array_key_exists('mo', $validated) && $mo) {
                $mo->update($validated['mo']);
            }

            $this->auditLog->logPengolahan($request->user(), $role === 'admin' ? 'admin_rekap_pengolahan_update' : 'rekap_pengolahan_update_akses', $pengolahan->id_pengolahan, [
                'before' => $sebelum,
                'after' => $this->snapshotRekap($pengolahan->fresh()),
                'role' => $role,
            ]);

            $user->pakaiJatahEdit();

            return response()->json([
                'data' => $pengolahan->fresh()->load(['gudang', 'makloon:id,nama_maklon', 'dataGudang.gudang', 'dataLhpk.gudangTujuan', 'moDetail.mo']),
            ]);
        });
    }

    /** @return array<string, mixed> */
    private function batasiScopeRekap(array $validated, string $role): array
    {
        $hasil = [];

        foreach (self::SCOPE_EDIT_REKAP[$role] ?? [] as $blok => $fields) {
            if (! array_key_exists($blok, $validated)) {
                continue;
            }

            $isi = $fields === null ? $validated[$blok] : Arr::only($validated[$blok], $fields);
            if ($isi !== []) {
                $hasil[$blok] = $isi;
            }
        }

        return $hasil;
    }

    /** @return array<string, mixed> */
    private function snapshotRekap(TransaksiPengolahan $pengolahan): array
    {
        $pengolahan->loadMissing(['dataGudang', 'dataLhpk', 'moDetail.mo']);

        return [
            'id_pengolahan' => $pengolahan->id_pengolahan,
            'skema' => $pengolahan->skema,
            'current_stage' => $pengolahan->current_stage,
            'data_gudang' => $pengolahan->dataGudang?->only(['tanggal_masuk_gudang', 'kuantum_hgl', 'plat_mobil', 'supir']),
            'data_lhpk' => $pengolahan->dataLhpk?->only(['no_lhpk', 'tanggal_lhpk', 'kuantum_gabah_diolah', 'kuantum_beras_hgl', 'kualitas', 'broken', 'menir', 'katul', 'ka1', 'ka2', 'ka3', 'reject']),
            'mo' => $pengolahan->moDetail?->mo?->only(['no_mo', 'no_tm_ada', 'no_tm_gudang', 'no_out', 'tanggal_out']),
        ];
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
     * Dua jalur berbeda lewat satu route:
     *
     * - Role tahap MEMBATALKAN pengolahan yang belum berisi apa pun. Yang sudah punya data tahap
     *   TIDAK boleh lewat sini -- membatalkan pekerjaan orang lain bukan urusan tombol batal, itu
     *   jalurnya penolakan tahap.
     * - Admin MENGHAPUS baris rekap yang salah beserta seluruh data tahapnya, padanan
     *   TransaksiController::destroy pada rantai SerGab.
     */
    public function destroy(Request $request, TransaksiPengolahan $pengolahan)
    {
        $user = $request->user();

        if ($user->role->nama_role !== 'admin') {
            abort_unless(
                $pengolahan->created_by === $user->id,
                403,
                'Hanya pembuatnya yang bisa membatalkan pengolahan ini.',
            );

            abort_unless($pengolahan->masihKosong(), 422, 'Pengolahan ini sudah berisi data dan tidak bisa dibatalkan.');

            $pengolahan->delete();

            return response()->noContent();
        }

        return DB::transaction(function () use ($user, $pengolahan) {
            $mo = $pengolahan->moDetail?->mo;

            // audit_logs.pengolahan_id ber-FK nullOnDelete, jadi baris log ini selamat tapi
            // kolom id-nya dikosongkan -- id-nya karena itu ikut disimpan di dalam snapshot.
            $this->auditLog->logPengolahan($user, 'admin_rekap_pengolahan_delete', $pengolahan->id_pengolahan, [
                // Kunci datar: halaman Audit Log membaca detail per kunci tingkat atas, bukan
                // jalur bertitik, dan tanpa ini kalimatnya kehilangan id-nya sama sekali.
                'id_pengolahan' => $pengolahan->id_pengolahan,
                'pengolahan' => $this->snapshotRekap($pengolahan),
            ]);

            // Data tahap, keanggotaan MO, dan riwayat penolakan ikut lewat cascade FK (lihat
            // TransaksiPengolahan::booted untuk foto-fotonya).
            $pengolahan->delete();

            // MO menyimpan TOTAL kuantum anggotanya. Tanpa disamakan ulang ia tetap menghitung
            // baris yang sudah tidak ada; MO yang kehilangan seluruh anggotanya ikut dibuang
            // supaya tidak menggantung tanpa isi -- sama seperti PO di rantai SerGab.
            if ($mo) {
                $mo->load('moDetail');

                if ($mo->moDetail->isEmpty()) {
                    $mo->delete();
                } else {
                    $mo->update([
                        'total_kuantum_hgl' => $mo->moDetail->sum('kuantum_hgl_kontribusi'),
                        'total_kuantum_gabah_diolah' => $mo->moDetail->sum('kuantum_gabah_diolah_kontribusi'),
                    ]);
                }
            }

            return response()->noContent();
        });
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

        // Tiap slot foto milik satu tahap: nota timbang punya Gudang, LHPK punya UB Jastasma.
        // Admin bebas keduanya. Tanpa ini, pemegang jatah edit tahap mana pun bisa menimpa foto
        // tahap orang lain lewat cabang "terkunci" di bawah.
        $pemilikSlot = ['foto_notim' => 'gudang', 'foto_lhpk' => 'ub_jastasma'][$validated['jenis_foto']];
        $role = $request->user()->role->nama_role;
        abort_unless($role === 'admin' || $role === $pemilikSlot, 403, 'Foto ini bukan milik tahap Anda.');

        $model = $this->modelFoto($pengolahan, $validated['jenis_foto']);

        if (! $model) {
            abort(422, 'Data tahap untuk foto ini belum ada. Simpan datanya lebih dulu.');
        }

        // Tahap yang sudah dikunci reviewer hanya bisa diganti fotonya oleh admin, atau oleh role
        // yang jatah editnya sedang dibuka admin -- aturan yang sama dengan FotoUploadService
        // pada alur SerGab, supaya perbaikan lewat Rekap tidak mentok di foto.
        if ($model->locked_at !== null && ! $request->user()->bolehEditRekap()) {
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

    /** Padanan FotoController::destroy pada rantai pengolahan: admin saja. */
    public function fotoHapus(Request $request, TransaksiPengolahan $pengolahan, string $jenisFoto)
    {
        abort_unless($request->user()->role->nama_role === 'admin', 403);

        $media = $this->modelFoto($pengolahan, $jenisFoto)?->getFirstMedia($jenisFoto);

        if (! $media) {
            abort(404, 'Foto tidak ditemukan.');
        }

        $media->delete();

        return response()->json(['message' => 'Foto dihapus.']);
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
            $this->service->setMakloon($pengolahan, $role, $makloonUserId);
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
