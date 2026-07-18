# SerGab Lampung — Sistem Serap Gabah

Aplikasi Sistem Informasi Serap Gabah untuk Perum BULOG. Project ini terdiri dari backend Laravel API dan frontend React/Vite.

## Akun Login Default

Username: admin
Password: password
Role: admin

## Stack

- Backend: Laravel 11
- Frontend: React + Vite + TypeScript
- Database: MySQL 8.0
- Local server: Laragon
- PHP minimal: 8.2

## Database

Project ini memakai MySQL. Database lokal yang digunakan: sergab_lampung.

Konfigurasi backend/.env:
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=sergab_lampung
DB_USERNAME=root
DB_PASSWORD=

## Setup Backend

cd C:\laragon\www\Konekto-Bulog\backend
composer install
copy .env.example .env
C:\laragon\bin\php\php-8.2.32-Win32-vs16-x64\php.exe artisan key:generate
C:\laragon\bin\php\php-8.2.32-Win32-vs16-x64\php.exe artisan migrate --seed

## Setup Frontend

cd C:\laragon\www\Konekto-Bulog\frontend
npm install
copy .env.example .env

Isi frontend/.env:
VITE_API_URL=http://localhost:8000

## Menjalankan Aplikasi

Buka dua terminal.

Terminal 1 - backend Laravel:
cd C:\laragon\www\Konekto-Bulog\backend
C:\laragon\bin\php\php-8.2.32-Win32-vs16-x64\php.exe artisan serve

Backend berjalan di http://127.0.0.1:8000

Terminal 2 - frontend React/Vite:
cd C:\laragon\www\Konekto-Bulog\frontend
npm run dev

Frontend berjalan di http://localhost:5173
Buka http://localhost:5173 lalu login dengan akun default.

## Perintah Penting

Cek migration:
C:\laragon\bin\php\php-8.2.32-Win32-vs16-x64\php.exe artisan migrate:status

Reset database lokal:
C:\laragon\bin\php\php-8.2.32-Win32-vs16-x64\php.exe artisan migrate:fresh --seed

Perhatian: perintah reset menghapus semua data lokal di database sergab_lampung.

## Troubleshooting Singkat

Jika muncul error PHP harus >= 8.2, pilih PHP 8.2 dari Laragon melalui Menu > PHP > Version lalu restart Apache.

Jika phpMyAdmin menampilkan mysqli extension is missing, restart Apache setelah memastikan PHP yang aktif sudah benar.

Jika frontend gagal memanggil backend, pastikan backend berjalan di port 8000 dan frontend/.env berisi VITE_API_URL=http://localhost:8000.
