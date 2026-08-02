<?php

namespace App\Services\Transaksi;

use Illuminate\Database\Eloquent\Builder;

/**
 * Lima langkah kerja role Pengadaan, dipakai sebagai chip filter di dashboard.
 *
 * Urutan kerjanya: terima data UB Jastasma -> buat PO & isi IN -> simpan No. SPP (INI yang
 * mengirim PO ke Keuangan) -> tutup Status Sergab. Karena SPP yang mengirim, transaksi pada
 * langkah 'sergab' `current_stage`-nya sudah 'keuangan'; yang memasukkannya kembali ke antrean
 * Pengadaan adalah cabang khusus di Transaksi::scopeAntreanRole().
 *
 * Definisinya sengaja SATU tempat karena dipakai dua pemanggil yang harus sepakat: daftar
 * transaksi (TransaksiController::index) dan angka chip (DashboardController::ringkasan).
 * Kalau keduanya menyalin kondisinya masing-masing, chip bisa menampilkan angka yang tidak
 * cocok dengan isi tabelnya -- persis kesalahan yang dulu terjadi di KerjaanTransaksi.
 *
 * Kelimanya saling lepas, jadi satu transaksi hanya muncul di satu chip.
 */
class TahapPengadaan
{
    public const SEMUA = ['perlu_dicek', 'po_in', 'spp', 'sergab', 'perlu_diperbaiki'];

    /** Prasyarat: query sudah melewati KerjaanTransaksi::joinTahap() (alias kj_*). */
    public static function filter(Builder $query, string $tahap): Builder
    {
        // Subquery "PO ini masih punya baris IN yang kosong", dipakai dua arm dengan arah berbeda.
        $adaInKosong = fn ($sub) => $sub->selectRaw('1')
            ->from('po_detail as pod_in')
            ->whereColumn('pod_in.data_pengadaan_id', 'kj_pd.id')
            ->whereNull('pod_in.no_in');

        return match ($tahap) {
            // 'periksa' juga bernilai benar untuk PO yang menunggu review Keuangan; dibatasi ke
            // transaksi yang memang masih berdiri di tahap Pengadaan supaya tidak tumpang tindih
            // dengan chip 'sergab'.
            'perlu_dicek' => KerjaanTransaksi::filter($query, 'periksa')
                ->where('transaksi.current_stage', 'pengadaan'),
            'perlu_diperbaiki' => KerjaanTransaksi::filter($query, 'ditolak'),
            // Syarat "sudah lolos review UB Jastasma" wajib eksplisit: transaksi yang baru mendarat
            // di Pengadaan juga belum punya PO, jadi tanpa ini chip PO/IN ikut memuat seluruh isi
            // chip "Perlu dicek". Arm lain tidak kena karena mensyaratkan kj_pd.
            'po_in' => $query->where('kj_ub.status', 'diterima')
                ->where(fn (Builder $q) => $q->whereNull('kj_pd.id')->orWhereExists($adaInKosong)),
            // IN lengkap tapi No. SPP belum diisi = belum dikirim ke Keuangan.
            'spp' => $query->whereNotNull('kj_pd.id')
                ->whereNull('kj_pd.no_spp')
                ->whereNotExists($adaInKosong),
            // Sudah dikirim ke Keuangan lewat No. SPP, tinggal ditutup Status Sergab-nya. PO yang
            // ditolak Keuangan juga cocok pola ini, tapi ia milik chip 'perlu_diperbaiki' --
            // memperbaiki penolakan didahulukan atas menutup Sergab.
            'sergab' => $query->whereNotNull('kj_pd.no_spp')
                ->where('kj_pd.review_status', '!=', 'ditolak')
                ->whereNotIn('kj_pd.status', ['lengkap', 'dibatalkan']),
        };
    }

    /**
     * Jumlah transaksi per langkah untuk SELURUH antrean (bukan satu halaman), supaya chip yang
     * kosong bisa disembunyikan seperti chip kerjaan role lain.
     *
     * ponytail: lima COUNT terpisah, bukan satu pemindaian dengan agregasi bersyarat. Antrean
     * Pengadaan dibatasi satu tahap sehingga jumlah barisnya kecil; kalau suatu saat terasa
     * lambat, ubah jadi satu query yang meng-GROUP BY ekspresi CASE seperti
     * KerjaanTransaksi::hitung().
     *
     * @return array<string, int>
     */
    public static function hitung(Builder $antrean): array
    {
        $hitung = [];

        foreach (self::SEMUA as $tahap) {
            $query = KerjaanTransaksi::joinTahap(clone $antrean)->reorder();
            self::filter($query, $tahap);
            $hitung[$tahap] = (int) $query->count();
        }

        $hitung['total'] = array_sum($hitung);

        return $hitung;
    }
}
