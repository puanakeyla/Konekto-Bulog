<?php

/*
 | Satu tempat untuk semua tombol perawatan yang dijalankan penjadwal (routes/console.php):
 | backup database dan pemangkasan tabel yang tumbuh selamanya. Ditaruh di config (bukan
 | env() langsung di kode) supaya `php artisan config:cache` di produksi tidak membuatnya null.
 */

return [
    'backup' => [
        // Path mysqldump. Di Laragon binernya TIDAK ada di PATH, jadi isi lengkap di .env, mis.
        // MYSQLDUMP_PATH="C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqldump.exe"
        'mysqldump' => env('MYSQLDUMP_PATH', 'mysqldump'),

        // Umur arsip .sql.gz sebelum dibuang. 0 = simpan selamanya.
        'simpan_hari' => (int) env('BACKUP_SIMPAN_HARI', 14),
    ],

    /*
     | Umur maksimal baris sebelum dibuang `php artisan model:prune`. Isi 0 untuk MEMATIKAN
     | pemangkasan tabel itu -- barisnya akan disimpan selamanya.
     |
     | Audit log sengaja panjang: ia jejak siapa-mengubah-apa atas data pengadaan gabah, dan
     | yang ditanyakan saat ada sengketa justru transaksi lama. Kalau BULOG punya aturan
     | retensi dokumen sendiri, angka inilah yang harus mengikuti aturan itu.
     */
    'retensi' => [
        'audit_log_hari' => (int) env('RETENSI_AUDIT_LOG_HARI', 730),

        // Notifikasi cuma alat pemberitahuan; isinya selalu bisa dibaca ulang dari transaksinya.
        'notifikasi_hari' => (int) env('RETENSI_NOTIFIKASI_HARI', 90),
    ],
];
