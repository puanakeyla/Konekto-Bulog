<?php

return [
    /*
     | Kalau diisi, streaming foto diserahkan ke nginx lewat X-Accel-Redirect: PHP hanya
     | mengirim header lalu langsung bebas, nginx yang mengalirkan berkasnya. Tanpa ini
     | tiap foto yang dibuka menyandera satu worker php-fpm selama seluruh transfer --
     | VPS umumnya cuma punya 10-20 worker, jadi beberapa galeri paralel sudah cukup
     | membuat seluruh situs macet.
     |
     | Isi dengan nama location internal nginx, mis. '/foto-internal', lalu pasang:
     |
     |   location /foto-internal/ {
     |       internal;
     |       alias /path/ke/backend/storage/app/foto-transaksi/;
     |   }
     |
     | Dibiarkan kosong di lokal/Apache -- di situ response()->file() biasa yang dipakai.
     */
    'xaccel_prefix' => env('FOTO_XACCEL_PREFIX'),
];
