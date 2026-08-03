<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaksi;
use App\Services\Transaksi\KerjaanTransaksi;
use App\Services\Transaksi\TahapPengadaan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Angka ringkasan dashboard, dihitung di database.
 *
 * Sebelumnya frontend menarik 200 baris rekap lalu menjumlahkannya sendiri. Selama data masih
 * puluhan baris hasilnya kebetulan benar; begitu melewati 200 transaksi, kartu statistik
 * diam-diam melaporkan angka dari 200 baris itu saja -- tanpa error, tanpa tanda. Menaikkan
 * batasnya bukan jawaban (hanya memindah beban ke memori browser), jadi penjumlahannya
 * dipindah ke SQL dan frontend cukup menerima angka jadi.
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

        // terlihatOleh() wajib ikut di sini, bukan hanya di daftar transaksi: hitungan chip &
        // kartu yang tidak disaring akan membocorkan JUMLAH transaksi makloon lain walau
        // barisnya sendiri tidak pernah tampil.
        $antrean = Transaksi::query()->antreanRole($role)
            ->terlihatOleh($request->user())
            ->when(isset($validated['skema']), fn ($q) => $q->where('transaksi.skema', $validated['skema']));

        $data = ['antrean' => KerjaanTransaksi::hitung($antrean)];

        // Pengadaan memakai chip per-langkah (PO/IN, SPP, Sergab, ...) menggantikan chip kerjaan,
        // jadi angkanya harus ikut dikirim -- tanpa ini frontend tidak bisa menyembunyikan chip
        // yang kosong seperti yang dilakukan role lain.
        if ($role === 'pengadaan') {
            $data['pengadaan_tahap'] = TahapPengadaan::hitung($antrean);
        }

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

}
