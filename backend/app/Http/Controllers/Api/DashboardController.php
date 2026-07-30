<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaksi;
use App\Services\Transaksi\KerjaanTransaksi;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Angka ringkasan dashboard, dihitung di database.
 *
 * Sebelumnya frontend menarik 200 baris rekap lalu menjumlahkannya sendiri. Selama data masih
 * puluhan baris hasilnya kebetulan benar; begitu melewati 200 transaksi, kartu statistik dan
 * tabel Pantauan diam-diam melaporkan angka dari 200 baris itu saja -- tanpa error, tanpa
 * tanda. Menaikkan batasnya bukan jawaban (hanya memindah beban ke memori browser), jadi
 * penjumlahannya dipindah ke SQL dan frontend cukup menerima angka jadi.
 */
class DashboardController extends Controller
{
    /** Tahap yang dianggap "sedang diproses" pada kartu Admin. */
    private const TAHAP_AKTIF = ['jemput_pangan', 'ub_jastasma', 'pengadaan', 'keuangan'];

    public function ringkasan(Request $request)
    {
        $validated = $request->validate([
            'skema' => ['sometimes', Rule::in(['TJP', 'MPP'])],
        ]);

        $role = $request->user()->role->nama_role;

        $antrean = Transaksi::query()->antreanRole($role)
            ->when(isset($validated['skema']), fn ($q) => $q->where('transaksi.skema', $validated['skema']));

        $data = ['antrean' => KerjaanTransaksi::hitung($antrean)];

        // Kartu Admin memandang SELURUH transaksi lintas tahap, bukan hanya antreannya sendiri
        // (antrean admin memang selalu kosong -- tidak ada tahap yang aktornya admin).
        if ($role === 'admin' || $role === 'keuangan') {
            $data['rekap'] = $this->ringkasanRekap($validated['skema'] ?? null);
        }

        return response()->json(['data' => $data]);
    }

    private function ringkasanRekap(?string $skema): array
    {
        $dasar = fn () => Transaksi::query()->when($skema, fn ($q) => $q->where('transaksi.skema', $skema));

        // Tiga angka pertama dari SATU pemindaian dengan agregasi bersyarat, bukan tiga COUNT
        // terpisah yang masing-masing memindai ulang seluruh tabel.
        $tahapAktif = "'".implode("','", self::TAHAP_AKTIF)."'";
        $pokok = $dasar()->selectRaw("
            COUNT(*) as total,
            SUM(transaksi.status_keseluruhan = 'selesai') as selesai,
            SUM(transaksi.status_keseluruhan = 'berjalan' AND transaksi.current_stage IN ($tahapAktif)) as perlu_diproses
        ")->first();

        $ditolak = $this->hitungDitolak($skema);

        return [
            'total' => (int) $pokok->total,
            'selesai' => (int) $pokok->selesai,
            'perlu_diproses' => (int) $pokok->perlu_diproses,
            'ditolak' => (int) $ditolak,
        ];
    }

    /**
     * Jumlah transaksi yang punya penolakan di tahap mana pun.
     *
     * Sengaja UNION dari enam pencarian kecil, bukan satu query yang meng-LEFT JOIN keenam tabel
     * ke `transaksi` lalu menyaring. Tiap tabel tahap sudah punya indeks pada kolom `status`
     * (dan penolakan itu langka), jadi tiap cabang hanya menyentuh segelintir baris; versi join
     * memaksa pemindaian penuh seluruh transaksi. UNION (bukan UNION ALL) sekaligus membuang
     * duplikat bila satu transaksi ditolak di lebih dari satu tahap.
     */
    private function hitungDitolak(?string $skema): int
    {
        $tahap = ['data_jemput_pangan', 'data_makloon_tjp', 'data_makloon_mpp', 'data_ub_jastasma'];

        $union = null;
        foreach ($tahap as $tabel) {
            $q = DB::table($tabel)->select('transaksi_id')->where('status', 'ditolak');
            $union = $union ? $union->union($q) : $q;
        }

        // Pengadaan & Keuangan berstatus di level PO, jadi dipetakan balik lewat po_detail.
        $union = $union
            ->union(DB::table('po_detail')
                ->join('data_pengadaan', 'data_pengadaan.id', '=', 'po_detail.data_pengadaan_id')
                ->where('data_pengadaan.review_status', 'ditolak')
                ->select('po_detail.transaksi_id'))
            ->union(DB::table('po_detail')
                ->join('data_keuangan', 'data_keuangan.data_pengadaan_id', '=', 'po_detail.data_pengadaan_id')
                ->where('data_keuangan.review_status', 'ditolak')
                ->select('po_detail.transaksi_id'));

        return (int) DB::query()
            ->fromSub($union, 'ditolak')
            ->when($skema, fn ($q) => $q->join('transaksi', 'transaksi.id_transaksi', '=', 'ditolak.transaksi_id')
                ->where('transaksi.skema', $skema))
            ->distinct()
            ->count('ditolak.transaksi_id');
    }

    /**
     * Tabel Pantauan Admin: satu baris per makloon. Kolom hasil olah sengaja tidak dihitung di
     * sini -- modul Pengolahan yang dulu mengisinya sudah dihapus, jadi frontend menampilkannya
     * nol. Yang dijumlahkan hanya dua angka yang datanya memang ada:
     *   - gabah_diterima     : kuantum bongkar yang dicatat Makloon (TJP) / kuantum MPP
     *   - gabah_administrasi : kuantum yang sudah masuk PO (po_detail.kuantum_kontribusi)
     *
     * ponytail: agregasi penuh seluruh tabel -- terukur ~1,1 detik pada 30.000 transaksi dan
     * tumbuh linear. Masih wajar untuk satu tabel ringkasan milik Admin, tapi kalau datanya
     * menembus ratusan ribu, bungkus dengan Cache::remember beberapa menit (angkanya bersifat
     * ikhtisar, tidak perlu real-time) atau pindahkan ke tabel ringkasan yang di-update
     * saat PO berubah.
     */
    public function pantauan(Request $request)
    {
        abort_unless($request->user()->role->nama_role === 'admin', 403);

        // Dijumlahkan dulu per ID makloon, BARU di-join ke users. Kalau users ikut di-join
        // sebelum agregasi, MySQL harus mencocokkan 30.000 baris ke tabel user lewat ekspresi
        // CASE (tidak terindeks); dengan urutan ini join-nya hanya menyentuh puluhan baris hasil.
        $perMakloon = Transaksi::query()
            ->leftJoin('data_makloon_tjp', 'data_makloon_tjp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_makloon_mpp', 'data_makloon_mpp.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('data_jemput_pangan', 'data_jemput_pangan.transaksi_id', '=', 'transaksi.id_transaksi')
            ->leftJoin('po_detail', 'po_detail.transaksi_id', '=', 'transaksi.id_transaksi')
            // Mitra makloon berbeda sumbernya per skema: MPP dibuat makloon sendiri (created_by),
            // TJP menunjuk makloon lewat data_jemput_pangan.makloon_user_id -- sama seperti
            // TransaksiResource::makloonUser().
            ->selectRaw("
                CASE WHEN transaksi.skema = 'MPP' THEN transaksi.created_by ELSE data_jemput_pangan.makloon_user_id END as makloon_id,
                COALESCE(SUM(COALESCE(data_makloon_tjp.kuantum_bongkar, data_makloon_mpp.kuantum, 0)), 0) as gabah_diterima,
                COALESCE(SUM(COALESCE(po_detail.kuantum_kontribusi, 0)), 0) as gabah_administrasi
            ")
            ->groupBy('makloon_id');

        $baris = DB::query()
            ->fromSub($perMakloon, 'agg')
            ->leftJoin('users', 'users.id', '=', 'agg.makloon_id')
            ->orderByDesc('agg.gabah_diterima')
            ->orderBy('nama')
            ->get([
                DB::raw("COALESCE(users.nama_maklon, 'Tanpa makloon') as nama"),
                'agg.gabah_diterima',
                'agg.gabah_administrasi',
            ]);

        return response()->json([
            'data' => $baris->map(fn ($row) => [
                'nama' => $row->nama,
                'gabah_diterima' => (float) $row->gabah_diterima,
                'gabah_administrasi' => (float) $row->gabah_administrasi,
            ])->values(),
        ]);
    }
}
