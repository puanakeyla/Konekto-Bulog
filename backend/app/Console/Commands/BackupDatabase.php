<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

/**
 * Dump seluruh database ke storage/app/backups sebagai .sql.gz, lalu buang arsip kedaluwarsa.
 *
 * ponytail: arsipnya mendarat di DISK YANG SAMA dengan databasenya. Itu melindungi dari
 * kesalahan manusia (tabel kepangkas, data tertimpa, migrasi salah) -- BUKAN dari disk VPS
 * yang mati. Begitu object storage dipasang, salin berkas ini ke sana; sampai saat itu,
 * unduh berkalanya masih pekerjaan manual.
 */
class BackupDatabase extends Command
{
    protected $signature = 'backup:db {--simpan-hari= : Umur arsip sebelum dibuang, 0 = simpan selamanya}
                                      {--timeout=600 : Batas detik mysqldump boleh berjalan}';

    protected $description = 'Dump database ke storage/app/backups (.sql.gz) lalu buang arsip kedaluwarsa.';

    public function handle(): int
    {
        $koneksi = config('database.default');
        $db = config("database.connections.{$koneksi}");

        if (($db['driver'] ?? null) !== 'mysql') {
            return $this->gagal("Perintah ini hanya mendukung MySQL; koneksi '{$koneksi}' memakai driver '".($db['driver'] ?? '?')."'.");
        }

        $folder = storage_path('app/backups');
        File::ensureDirectoryExists($folder);

        $sql = $folder.DIRECTORY_SEPARATOR.$db['database'].'-'.now()->format('Y-m-d_His').'.sql';
        $konfig = $this->tulisKonfigSementara($db);

        try {
            $hasil = Process::timeout((int) $this->option('timeout'))->run([
                config('pemeliharaan.backup.mysqldump'),
                '--defaults-extra-file='.$konfig,
                '--single-transaction',  // konsisten tanpa mengunci tabel (InnoDB)
                '--quick',               // streaming per baris, tidak menumpuk tabel besar di RAM
                '--no-tablespaces',      // MySQL 8 menuntut privilege PROCESS tanpa flag ini
                '--result-file='.$sql,
                $db['database'],
            ]);
        } finally {
            File::delete($konfig);
        }

        // Berkas kosong dihitung GAGAL: mysqldump bisa keluar dengan kode 0 sambil menulis
        // nol byte (mis. kredensial benar tapi tidak punya hak baca), dan arsip kosong yang
        // diam-diam tersimpan justru lebih berbahaya daripada tidak ada arsip sama sekali.
        if (! $hasil->successful() || ! is_file($sql) || filesize($sql) === 0) {
            File::delete($sql);

            return $this->gagal('mysqldump gagal: '.trim($hasil->errorOutput() ?: $hasil->output()));
        }

        $gz = $sql.'.gz';
        $this->kompres($sql, $gz);
        File::delete($sql);

        $this->info('Backup tersimpan: '.$gz.' ('.$this->ukuran(filesize($gz)).')');
        $this->buangYangKedaluwarsa($folder);

        return self::SUCCESS;
    }

    /**
     * Kegagalan backup harus BERISIK. Perintah ini jalan tengah malam tanpa penonton, jadi
     * satu-satunya cara ia terdengar adalah lewat log -- yang di produksi diteruskan ke Slack
     * (lihat LOG_STACK di .env.example).
     */
    private function gagal(string $pesan): int
    {
        $this->error($pesan);
        Log::error('[backup:db] '.$pesan);

        return self::FAILURE;
    }

    /**
     * Kredensial ditulis ke berkas sementara, BUKAN dilewatkan sebagai argumen: argumen proses
     * terbaca siapa pun lewat `ps` di server yang sama.
     */
    private function tulisKonfigSementara(array $db): string
    {
        $path = tempnam(sys_get_temp_dir(), 'sergab-dump');

        File::put($path, implode("\n", [
            '[client]',
            'host='.($db['host'] ?? '127.0.0.1'),
            'port='.($db['port'] ?? 3306),
            'user='.($db['username'] ?? ''),
            'password="'.($db['password'] ?? '').'"',
        ])."\n");
        @chmod($path, 0600);

        return $path;
    }

    /** Kompresi di PHP, bukan pipa `| gzip`: gzip tidak ada di Windows dan pipa butuh shell. */
    private function kompres(string $sumber, string $tujuan): void
    {
        $masuk = fopen($sumber, 'rb');
        $keluar = gzopen($tujuan, 'wb9');

        while (! feof($masuk)) {
            gzwrite($keluar, fread($masuk, 1024 * 1024));
        }

        fclose($masuk);
        gzclose($keluar);
    }

    private function buangYangKedaluwarsa(string $folder): void
    {
        $hari = (int) ($this->option('simpan-hari') ?? config('pemeliharaan.backup.simpan_hari'));
        if ($hari <= 0) {
            return;
        }

        $batas = now()->subDays($hari)->getTimestamp();

        foreach (File::glob($folder.DIRECTORY_SEPARATOR.'*.sql.gz') as $arsip) {
            if (File::lastModified($arsip) < $batas) {
                File::delete($arsip);
                $this->line('Arsip kedaluwarsa dibuang: '.basename($arsip));
            }
        }
    }

    private function ukuran(int $bytes): string
    {
        return $bytes >= 1048576
            ? round($bytes / 1048576, 1).' MB'
            : round($bytes / 1024).' KB';
    }
}
