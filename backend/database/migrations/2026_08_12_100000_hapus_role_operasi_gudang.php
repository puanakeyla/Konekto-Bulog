<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Role `operasi` & `gudang` dihapus tuntas.
 *
 * Tabel data_operasi & data_gudang sudah hilang sejak 2026_07_20_100000, dan modul Pengolahan
 * yang sempat memakai keduanya hidup di branch terpisah. Yang tersisa di sini cuma bangkai:
 * dua role row, kolom users.nama_gudang, dan endpoint /api/gudang-options yang komentarnya
 * sendiri mengakui sudah tidak punya konsumen. Branch ini hanya menjalankan alur SerGab
 * (TJP/MPP: Jemput Pangan -> Makloon -> UB Jastasma -> Pengadaan -> Keuangan).
 *
 * Role disimpan di DUA tabel yang harus sepakat: `roles` milik aplikasi (kolom nama_role,
 * ditunjuk users.role_id) dan `permission_roles` milik spatie/laravel-permission (kolom name).
 * RoleSeeder mengisi keduanya, jadi migrasi ini juga membersihkan keduanya beserta pivot
 * model_has_roles -- kalau tidak, pivot itu menunjuk role yang sudah tidak ada.
 *
 * Akun ber-role tersebut ikut dihapus (keputusan pemilik). Aman: seluruh 17 kolom foreign key
 * yang menunjuk `users` diperiksa dan tidak satu pun merujuk keempat akun itu.
 *
 * down() mengembalikan kolom dan kedua role row, TAPI TIDAK akun yang dihapus -- datanya tidak
 * disimpan di mana pun. Id role hasil rollback juga akan berbeda dari aslinya (auto increment),
 * jadi users.role_id lama tidak akan otomatis cocok kembali.
 */
return new class extends Migration
{
    private const ROLE = ['operasi', 'gudang'];

    public function up(): void
    {
        $idRole = DB::table('roles')->whereIn('nama_role', self::ROLE)->pluck('id');
        $idUser = DB::table('users')->whereIn('role_id', $idRole)->pluck('id');

        // Pivot dibersihkan lebih dulu dari dua arah: lewat user yang mau dihapus, dan lewat
        // role spatie yang mau dihapus. Keduanya perlu -- pivot bisa berisi salah satu saja.
        DB::table('model_has_roles')
            ->where('model_type', 'App\Models\User')
            ->whereIn('model_id', $idUser)
            ->delete();

        DB::table('users')->whereIn('id', $idUser)->delete();

        $idSpatie = DB::table('permission_roles')->whereIn('name', self::ROLE)->pluck('id');
        DB::table('model_has_roles')->whereIn('role_id', $idSpatie)->delete();
        DB::table('permission_roles')->whereIn('id', $idSpatie)->delete();

        DB::table('roles')->whereIn('id', $idRole)->delete();

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('nama_gudang');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('nama_gudang', 150)->nullable()->after('nama_maklon');
        });

        foreach (self::ROLE as $nama) {
            DB::table('roles')->insertOrIgnore([
                'nama_role' => $nama,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('permission_roles')->insertOrIgnore([
                'name' => $nama,
                'guard_name' => 'web',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
};
