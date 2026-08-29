<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Makloon Terima jadi tahap berdata sendiri.
 *
 * Sebelumnya tahap ini tidak punya tabel: kuantum bongkar dan dua dokumennya menumpang di
 * data_makloon_mpp milik Makloon Kirim, dan satu tombol mengerjakan terima + isi + kirim
 * sekaligus. Akibatnya penerimaan habis di situ dan UB Jastasma tidak kebagian apa pun untuk
 * diperiksa. Dengan tabel sendiri, tahap ini mengikuti mesin generik yang sama dengan tahap
 * lain: Makloon Terima menerima data Kirim, mengisi formnya, mengirim, lalu UB yang memeriksa.
 *
 * kuantum_bongkar di data_makloon_mpp SENGAJA belum dibuang -- ia jaring pengaman kalau
 * backfill ini ternyata keliru. Penghapusannya migrasi tersendiri, setelah terbukti jalan.
 */
return new class extends Migration
{
    /** Ditulis literal, bukan lewat konstanta model: migrasi harus tetap jalan walau modelnya berubah. */
    private const FOTO_TERIMA = ['foto_surat_jalan', 'foto_nota_timbang'];

    private const MODEL_MPP = 'App\Models\DataMakloonMpp';

    private const MODEL_TERIMA = 'App\Models\DataMakloonTerima';

    public function up(): void
    {
        Schema::create('data_makloon_terima', function (Blueprint $table) {
            $table->id();
            // Satu baris per transaksi -- unique, tidak seperti tabel tahap lain yang tidak
            // menjaganya. Tahap ini dibuat belakangan, jadi tidak ada data lama yang melanggar.
            $table->string('transaksi_id', 30)->unique();
            $table->foreign('transaksi_id')->references('id_transaksi')->on('transaksi')->cascadeOnDelete();
            $table->decimal('kuantum_bongkar', 10, 2)->nullable();
            $table->enum('status', ['draft', 'menunggu_review', 'diterima', 'ditolak'])->default('draft');
            $table->text('catatan_penolakan')->nullable();
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('locked_by')->nullable()->constrained('users');
            $table->foreignId('submitted_by')->nullable()->constrained('users');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });

        $this->pindahkanDataLama();
    }

    /**
     * Baris terima dibuat untuk SETIAP transaksi MPP yang sudah ada, lalu kepemilikan dua
     * fotonya dialihkan. Foto tidak berpindah di disk: ShardedPathGenerator menyusun path dari
     * id media, bukan dari model pemiliknya -- jadi ini murni pembaruan baris.
     *
     * Dikerjakan di PHP, bukan satu UPDATE...JOIN, karena sintaks itu tidak ada di SQLite yang
     * dipakai test suite.
     */
    private function pindahkanDataLama(): void
    {
        DB::table('data_makloon_mpp')->orderBy('id')->chunk(500, function ($baris) {
            foreach ($baris as $mpp) {
                // MPP 'diterima' berarti Makloon Terima memang sudah menyelesaikan pekerjaannya
                // (dulu terima+isi+kirim satu tombol), jadi barisnya ikut terkunci 'diterima'.
                // Selain itu tahap ini belum dikerjakan sama sekali -> 'draft'.
                $sudahSelesai = $mpp->status === 'diterima';

                $idTerima = DB::table('data_makloon_terima')->insertGetId([
                    'transaksi_id' => $mpp->transaksi_id,
                    'kuantum_bongkar' => $mpp->kuantum_bongkar,
                    'status' => $sudahSelesai ? 'diterima' : 'draft',
                    'locked_at' => $sudahSelesai ? $mpp->locked_at : null,
                    'locked_by' => $sudahSelesai ? $mpp->locked_by : null,
                    'submitted_by' => $sudahSelesai ? $mpp->submitted_by : null,
                    'submitted_at' => $sudahSelesai ? $mpp->submitted_at : null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                DB::table('media')
                    ->where('model_type', self::MODEL_MPP)
                    ->where('model_id', $mpp->id)
                    ->whereIn('collection_name', self::FOTO_TERIMA)
                    ->update(['model_type' => self::MODEL_TERIMA, 'model_id' => $idTerima]);
            }
        });
    }

    public function down(): void
    {
        // Kembalikan kepemilikan foto ke baris MPP-nya sebelum tabelnya hilang, kalau tidak
        // media-nya jadi yatim dan fotonya tidak bisa dibuka lagi dari mana pun.
        DB::table('data_makloon_terima')->orderBy('id')->chunk(500, function ($baris) {
            foreach ($baris as $terima) {
                $idMpp = DB::table('data_makloon_mpp')->where('transaksi_id', $terima->transaksi_id)->value('id');
                if (! $idMpp) {
                    continue;
                }

                DB::table('data_makloon_mpp')->where('id', $idMpp)->update(['kuantum_bongkar' => $terima->kuantum_bongkar]);
                DB::table('media')
                    ->where('model_type', self::MODEL_TERIMA)
                    ->where('model_id', $terima->id)
                    ->whereIn('collection_name', self::FOTO_TERIMA)
                    ->update(['model_type' => self::MODEL_MPP, 'model_id' => $idMpp]);
            }
        });

        Schema::dropIfExists('data_makloon_terima');
    }
};
