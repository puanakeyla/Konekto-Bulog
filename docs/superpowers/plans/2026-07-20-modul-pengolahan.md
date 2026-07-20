# Modul Pengolahan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti pemahaman lama Operasi/Gudang (modul mandiri) dengan satu alur kerja **Pengolahan** bertahap terima/tolak: UB Jastasma → Operasi → Pengadaan → Operasi → Gudang.

**Architecture:** Modul terpisah dari timeline transaksi TJP/MPP (yang kini berhenti di Keuangan). Dua entitas: `pengolahan` (per-LHPK, dibuat UB Jastasma) yang digabung Operasi menjadi `mo` (Manufacturing/Move Order, analog `data_pengadaan`) lewat tabel penghubung `mo_detail` (analog `po_detail`). MO berjalan lintas tahap dengan kolom `current_stage`, meniru pola `data_pengadaan.review_status` + penggabungan PO yang sudah ada.

**Tech Stack:** Laravel 12 (REST API), MySQL 8 (dev) / SQLite in-memory (test), Eloquent, spatie/laravel-permission, React 18 + TypeScript + TanStack Query, Tailwind + shadcn/ui.

**Referensi spec:** `docs/superpowers/specs/2026-07-20-pengolahan-workflow-design.md`.

## Global Constraints

- **Commit dilakukan USER, bukan agen.** Setiap task berakhir pada kondisi test hijau, siap direview & di-commit user. **Jangan jalankan `git commit`/`git add`.** Langkah terakhir tiap task = laporkan status hijau.
- **Test isolation:** semua feature test pakai `use RefreshDatabase;` + `$this->seed(RoleSeeder::class)` di `setUp()`. DB test = SQLite in-memory (`backend/.env.testing`).
- **Jalankan test dari folder `backend/`:** `php artisan test --filter=<Nama>`.
- **MySQL dev bukan Windows service.** Kalau `php artisan migrate` gagal "connection refused", start manual: `/c/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqld.exe --defaults-file=<same dir>/my.ini --standalone` (background). Test SQLite tidak butuh ini.
- **Presisi desimal kuantum:** kolom kuantum/berat pakai `decimal(14,2)` (maks `999999999999.99`); validasi `max:999999999999.99` supaya nilai kelewat besar jadi 422, bukan 500 (SQLSTATE 22003). KA pakai `decimal(6,2)`, rendemen `decimal(5,2)` (0–100).
- **Otorisasi 2 lapis:** middleware `role:` di route + cek `current_stage`/kepemilikan di service. Admin selalu bypass (role `admin`).
- **Rendemen** = `round(hgl / jumlah_kuantum * 100, 2)` jika `jumlah_kuantum > 0`, else `null`.
- **Nama tabel & kolom** persis seperti di §4 spec. Nama gudang di `users.nama_gudang` (paralel `nama_maklon`).

---

### Task 1: Teardown modul Operasi & Gudang lama

Hapus semua artefak pemahaman lama dan pangkas timeline transaksi agar berhenti di Keuangan. Setelah task ini, aplikasi tetap jalan & test hijau tanpa modul operasi/gudang.

**Files:**
- Delete: `backend/app/Http/Controllers/Api/OperasiController.php`
- Delete: `backend/app/Http/Controllers/Api/GudangController.php`
- Delete: `backend/app/Services/Operasi/OperasiService.php`
- Delete: `backend/app/Models/PermintaanOperasi.php`
- Delete: `backend/app/Models/DataGudang.php`
- Delete: `backend/tests/Feature/Operasi/OperasiStandaloneTest.php`
- Delete: `backend/tests/Feature/Gudang/GudangStandaloneTest.php`
- Modify: `backend/routes/api.php` (hapus blok route `/operasi/*` & `/gudang/*`, hapus `use` OperasiController/GudangController)
- Modify: `backend/app/Services/Transaksi/TransaksiStages.php` (buang tahap operasi & gudang)
- Create: `backend/database/migrations/2026_07_20_100000_drop_operasi_gudang_tables.php`

**Interfaces:**
- Produces: `TransaksiStages::sequence()` yang berakhir di `keuangan` untuk kedua skema. `indexOfRole($skema, 'operasi')` dan `'gudang'` sekarang mengembalikan `null`.

- [ ] **Step 1: Ubah `TransaksiStages::sequence()` — buang operasi & gudang**

`$afterMakloon` menjadi:

```php
$afterMakloon = [
    ['role' => 'ub_jastasma', 'model' => DataUbJastasma::class],
    ['role' => 'pengadaan', 'model' => null],
    ['role' => 'keuangan', 'model' => null],
];
```

- [ ] **Step 2: Hapus file controller/service/model/test operasi & gudang**

```bash
cd backend
rm app/Http/Controllers/Api/OperasiController.php \
   app/Http/Controllers/Api/GudangController.php \
   app/Services/Operasi/OperasiService.php \
   app/Models/PermintaanOperasi.php \
   app/Models/DataGudang.php \
   tests/Feature/Operasi/OperasiStandaloneTest.php \
   tests/Feature/Gudang/GudangStandaloneTest.php
```

- [ ] **Step 3: Bersihkan `routes/api.php`**

Hapus dua `use` (`OperasiController`, `GudangController`) dan seluruh blok route dengan komentar "Modul Operasi mandiri..." dan "Modul Gudang mandiri..." (baris ~88–110 pada versi saat ini). Tidak ada route `/operasi` atau `/gudang` yang tersisa.

- [ ] **Step 4: Buat migrasi drop tabel lama**

`backend/database/migrations/2026_07_20_100000_drop_operasi_gudang_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('data_gudang');
        Schema::dropIfExists('permintaan_operasi');
        Schema::dropIfExists('data_operasi');
    }

    public function down(): void
    {
        // Tabel lama sengaja tidak dibangun ulang; skema pengolahan menggantikannya.
    }
};
```

- [ ] **Step 5: Cari sisa referensi operasi/gudang di backend**

Run: `cd backend && grep -rniE "PermintaanOperasi|DataGudang|OperasiService|OperasiController|GudangController" app routes tests`
Expected: tidak ada hasil. Kalau ada, hapus/perbaiki referensinya.

- [ ] **Step 6: Jalankan seluruh test backend**

Run: `cd backend && php artisan test`
Expected: PASS semua (test operasi/gudang lama sudah dihapus; sisanya tetap hijau). Kalau ada test lain yang menyentuh stage `operasi`/`gudang`, sesuaikan agar berhenti di `keuangan`.

- [ ] **Step 7: Task selesai — lapor status hijau ke user untuk di-commit.** (Jangan commit sendiri.)

---

### Task 2: Kolom `users.nama_gudang` + dukungan Admin CRUD + endpoint opsi gudang

**Files:**
- Create: `backend/database/migrations/2026_07_20_110000_add_nama_gudang_to_users_table.php`
- Modify: `backend/app/Models/User.php:16-24` (tambah `nama_gudang` ke `$fillable`)
- Modify: `backend/app/Http/Controllers/Api/AdminUserController.php` (validasi & normalisasi nama_gudang)
- Modify: `backend/app/Http/Resources/AdminUserResource.php` (sertakan `nama_gudang`)
- Create: `backend/app/Http/Controllers/Api/GudangOptionController.php`
- Modify: `backend/routes/api.php` (route `GET /gudang-options`)
- Create: `backend/tests/Feature/Admin/AdminGudangUserTest.php`
- Create: `backend/tests/Feature/GudangOptionTest.php`

**Interfaces:**
- Produces: `GET /api/gudang-options` → `{ "data": [ {"id": int, "nama_gudang": string} ] }` (user role `gudang`, `is_active = true`). Route `GudangOptionController::index`.
- Produces: Admin `POST/PATCH /api/admin/users` menerima & mewajibkan `nama_gudang` saat `role = gudang`.

- [ ] **Step 1: Tulis test gagal — Admin buat user gudang wajib nama_gudang**

`backend/tests/Feature/Admin/AdminGudangUserTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminGudangUserTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function admin(): User
    {
        return User::create([
            'username' => 'admin_'.uniqid(),
            'password' => bcrypt('secret12'),
            'role_id' => Role::where('nama_role', 'admin')->value('id'),
        ]);
    }

    public function test_buat_user_gudang_wajib_nama_gudang(): void
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        $this->actingAs($this->admin())
            ->postJson('/api/admin/users', [
                'username' => 'gudang_jaya_1',
                'password' => 'rahasia12',
                'password_confirmation' => 'rahasia12',
                'role_id' => $gudangRoleId,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('nama_gudang');
    }

    public function test_buat_user_gudang_dengan_nama_gudang_berhasil(): void
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        $this->actingAs($this->admin())
            ->postJson('/api/admin/users', [
                'username' => 'gudang_jaya_1',
                'password' => 'rahasia12',
                'password_confirmation' => 'rahasia12',
                'role_id' => $gudangRoleId,
                'nama_gudang' => 'Gudang Jaya 1',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.nama_gudang', 'Gudang Jaya 1');
    }
}
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run: `cd backend && php artisan test --filter=AdminGudangUserTest`
Expected: FAIL (kolom `nama_gudang` belum ada / tidak divalidasi).

- [ ] **Step 3: Migrasi tambah kolom**

`backend/database/migrations/2026_07_20_110000_add_nama_gudang_to_users_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('nama_gudang', 150)->nullable()->after('nama_maklon');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('nama_gudang');
        });
    }
};
```

- [ ] **Step 4: Tambah `nama_gudang` ke `User::$fillable`**

Sisipkan `'nama_gudang',` tepat setelah `'nama_maklon',` di array `$fillable`.

- [ ] **Step 5: Validasi & normalisasi di `AdminUserController`**

Di `validateUser()`, setelah blok `nama_maklon`, tambahkan aturan `nama_gudang` yang wajib bila role = gudang:

```php
$gudangRoleId = Role::where('nama_role', 'gudang')->value('id');
$namaGudangRules = ['nullable', 'string', 'max:150'];
if ($roleId === $gudangRoleId && ($user === null || $request->has('role_id') || $request->has('nama_gudang'))) {
    array_unshift($namaGudangRules, 'required');
}
```

Tambahkan `'nama_gudang' => $namaGudangRules,` ke array `$request->validate([...])`.

Di `normalizeMakloonName()` (biarkan nama metodenya), tambahkan sebelum `return`:

```php
if ($roleId !== $gudangRoleId) {
    $validated['nama_gudang'] = null;
}
```

Dan definisikan `$gudangRoleId = Role::where('nama_role', 'gudang')->value('id');` di awal metode itu.

- [ ] **Step 6: Sertakan `nama_gudang` di `AdminUserResource`**

Tambahkan `'nama_gudang' => $this->nama_gudang,` ke array `toArray()` (di sebelah `nama_maklon`).

- [ ] **Step 7: Jalankan test Task-2 pertama — hijau**

Run: `cd backend && php artisan test --filter=AdminGudangUserTest`
Expected: PASS.

- [ ] **Step 8: Test gagal untuk endpoint opsi gudang**

`backend/tests/Feature/GudangOptionTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GudangOptionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_daftar_opsi_gudang_hanya_user_gudang_aktif(): void
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');
        User::create(['username' => 'g1', 'password' => bcrypt('x'), 'role_id' => $gudangRoleId, 'nama_gudang' => 'Gudang Jaya 1']);
        User::create(['username' => 'g2', 'password' => bcrypt('x'), 'role_id' => $gudangRoleId, 'nama_gudang' => 'Gudang Jaya 2', 'is_active' => false]);
        $operasi = User::create(['username' => 'op', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'operasi')->value('id')]);

        $this->actingAs($operasi)
            ->getJson('/api/gudang-options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.nama_gudang', 'Gudang Jaya 1');
    }
}
```

- [ ] **Step 9: Jalankan — pastikan gagal**

Run: `cd backend && php artisan test --filter=GudangOptionTest`
Expected: FAIL (route belum ada, 404).

- [ ] **Step 10: Buat `GudangOptionController`**

`backend/app/Http/Controllers/Api/GudangOptionController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;

class GudangOptionController extends Controller
{
    public function index()
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        $data = User::where('role_id', $gudangRoleId)
            ->where('is_active', true)
            ->orderBy('nama_gudang')
            ->get(['id', 'nama_gudang'])
            ->map(fn (User $u) => ['id' => $u->id, 'nama_gudang' => $u->nama_gudang]);

        return response()->json(['data' => $data]);
    }
}
```

- [ ] **Step 11: Daftarkan route (dalam grup `auth:sanctum`)**

Di `routes/api.php`, di sebelah route `/makloon-options`:

```php
Route::get('/gudang-options', [\App\Http\Controllers\Api\GudangOptionController::class, 'index']);
```

- [ ] **Step 12: Jalankan test Task 2 — semua hijau**

Run: `cd backend && php artisan test --filter="AdminGudangUserTest|GudangOptionTest|AdminUserTest"`
Expected: PASS.

- [ ] **Step 13: Task selesai — lapor status hijau.**

---

### Task 3: Tabel & model `pengolahan`

**Files:**
- Create: `backend/database/migrations/2026_07_20_120000_create_pengolahan_table.php`
- Create: `backend/app/Models/Pengolahan.php`
- Create: `backend/tests/Feature/Pengolahan/PengolahanModelTest.php`

**Interfaces:**
- Produces: model `App\Models\Pengolahan` (tabel `pengolahan`), relasi `makloon()` (BelongsTo User), `mo()` (BelongsTo Mo, dibuat Task 4 — untuk sekarang belum), `creator()` (BelongsTo User, `created_by`). Kolom di §4 spec.

- [ ] **Step 1: Migrasi `pengolahan`**

`backend/database/migrations/2026_07_20_120000_create_pengolahan_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengolahan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('makloon_user_id')->constrained('users');
            $table->decimal('jumlah_kuantum', 14, 2);
            $table->decimal('kuantum_olah', 14, 2);
            $table->string('no_lhpk')->unique();
            $table->date('tanggal');
            $table->decimal('ka1', 6, 2)->nullable();
            $table->decimal('ka2', 6, 2)->nullable();
            $table->decimal('ka3', 6, 2)->nullable();
            $table->decimal('hgl', 14, 2)->nullable();
            $table->decimal('broken', 14, 2)->nullable();
            $table->decimal('menir', 14, 2)->nullable();
            $table->decimal('katul', 14, 2)->nullable();
            $table->decimal('rendemen', 5, 2)->nullable();
            $table->enum('status', ['menunggu_operasi', 'ditolak', 'digabung'])->default('menunggu_operasi');
            $table->text('catatan_penolakan')->nullable();
            $table->unsignedBigInteger('mo_id')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('locked_by')->nullable()->constrained('users');
            $table->foreignId('submitted_by')->nullable()->constrained('users');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->index(['makloon_user_id', 'status']);
            $table->index('mo_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pengolahan');
    }
};
```

- [ ] **Step 2: Model `Pengolahan`**

`backend/app/Models/Pengolahan.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Pengolahan extends Model
{
    protected $table = 'pengolahan';

    protected $fillable = [
        'makloon_user_id', 'jumlah_kuantum', 'kuantum_olah', 'no_lhpk', 'tanggal',
        'ka1', 'ka2', 'ka3', 'hgl', 'broken', 'menir', 'katul', 'rendemen',
        'status', 'catatan_penolakan', 'mo_id', 'created_by',
        'locked_at', 'locked_by', 'submitted_by', 'submitted_at',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function mo(): BelongsTo
    {
        return $this->belongsTo(Mo::class, 'mo_id');
    }

    protected function casts(): array
    {
        return [
            'tanggal' => 'date',
            'jumlah_kuantum' => 'decimal:2',
            'kuantum_olah' => 'decimal:2',
            'hgl' => 'decimal:2',
            'broken' => 'decimal:2',
            'menir' => 'decimal:2',
            'katul' => 'decimal:2',
            'rendemen' => 'decimal:2',
            'locked_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }
}
```

- [ ] **Step 3: Test model minimal**

`backend/tests/Feature/Pengolahan/PengolahanModelTest.php`:

```php
<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Pengolahan;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PengolahanModelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_pengolahan_menyimpan_dan_membaca_relasi_makloon(): void
    {
        $makloon = User::create(['username' => 'm1', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'makloon')->value('id'), 'nama_maklon' => 'PT Makloon']);
        $ub = User::create(['username' => 'ub1', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'ub_jastasma')->value('id')]);

        $p = Pengolahan::create([
            'makloon_user_id' => $makloon->id,
            'jumlah_kuantum' => 1000,
            'kuantum_olah' => 800,
            'no_lhpk' => 'LHPK-001',
            'tanggal' => '2026-07-20',
            'created_by' => $ub->id,
        ]);

        $this->assertSame('menunggu_operasi', $p->status);
        $this->assertSame('PT Makloon', $p->makloon->nama_maklon);
    }
}
```

- [ ] **Step 4: Jalankan**

Run: `cd backend && php artisan test --filter=PengolahanModelTest`
Expected: PASS.

- [ ] **Step 5: Task selesai — lapor status hijau.**

---

### Task 4: Tabel & model `mo` + `mo_detail`

**Files:**
- Create: `backend/database/migrations/2026_07_20_130000_create_mo_tables.php`
- Create: `backend/app/Models/Mo.php`
- Create: `backend/app/Models/MoDetail.php`
- Create: `backend/tests/Feature/Pengolahan/MoModelTest.php`

**Interfaces:**
- Produces: model `App\Models\Mo` (tabel `mo`) relasi `makloon()`, `moDetail()` (HasMany), `pengolahan()` (HasManyThrough via mo_detail — pakai relasi sederhana), `tujuanGudang()` (BelongsTo User `tujuan_gudang_user_id`), `creator()`. Model `App\Models\MoDetail` (tabel `mo_detail`) relasi `mo()`, `pengolahan()`.

- [ ] **Step 1: Migrasi `mo` & `mo_detail`**

`backend/database/migrations/2026_07_20_130000_create_mo_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mo', function (Blueprint $table) {
            $table->id();
            $table->string('no_mo')->unique();
            $table->string('no_tm');
            $table->foreignId('makloon_user_id')->constrained('users');
            $table->decimal('total_kuantum_olah', 14, 2);
            $table->string('no_out')->nullable()->unique();
            $table->foreignId('tujuan_gudang_user_id')->nullable()->constrained('users');
            $table->string('no_tm_gudang')->nullable();
            $table->decimal('kuantum_total', 14, 2)->nullable();
            $table->date('tanggal_terima_gudang')->nullable();
            $table->string('current_stage', 20)->default('pengadaan');
            $table->enum('status', ['berjalan', 'selesai', 'dibatalkan'])->default('berjalan');
            $table->text('catatan_penolakan')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index(['current_stage', 'makloon_user_id']);
        });

        Schema::create('mo_detail', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mo_id')->constrained('mo')->cascadeOnDelete();
            $table->foreignId('pengolahan_id')->unique()->constrained('pengolahan');
            $table->timestamps();

            $table->index('mo_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mo_detail');
        Schema::dropIfExists('mo');
    }
};
```

- [ ] **Step 2: Model `Mo`**

`backend/app/Models/Mo.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Mo extends Model
{
    protected $table = 'mo';

    protected $fillable = [
        'no_mo', 'no_tm', 'makloon_user_id', 'total_kuantum_olah', 'no_out',
        'tujuan_gudang_user_id', 'no_tm_gudang', 'kuantum_total', 'tanggal_terima_gudang',
        'current_stage', 'status', 'catatan_penolakan', 'created_by',
    ];

    public function makloon(): BelongsTo
    {
        return $this->belongsTo(User::class, 'makloon_user_id');
    }

    public function tujuanGudang(): BelongsTo
    {
        return $this->belongsTo(User::class, 'tujuan_gudang_user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function moDetail(): HasMany
    {
        return $this->hasMany(MoDetail::class);
    }

    protected function casts(): array
    {
        return [
            'total_kuantum_olah' => 'decimal:2',
            'kuantum_total' => 'decimal:2',
            'tanggal_terima_gudang' => 'date',
        ];
    }
}
```

- [ ] **Step 3: Model `MoDetail`**

`backend/app/Models/MoDetail.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MoDetail extends Model
{
    protected $table = 'mo_detail';

    protected $fillable = ['mo_id', 'pengolahan_id'];

    public function mo(): BelongsTo
    {
        return $this->belongsTo(Mo::class);
    }

    public function pengolahan(): BelongsTo
    {
        return $this->belongsTo(Pengolahan::class);
    }
}
```

- [ ] **Step 4: Test model minimal**

`backend/tests/Feature/Pengolahan/MoModelTest.php`:

```php
<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Mo;
use App\Models\MoDetail;
use App\Models\Pengolahan;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MoModelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_mo_punya_detail_pengolahan(): void
    {
        $makloon = User::create(['username' => 'm1', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'makloon')->value('id')]);
        $op = User::create(['username' => 'op', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'operasi')->value('id')]);
        $ub = User::create(['username' => 'ub', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'ub_jastasma')->value('id')]);

        $p = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-1', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);
        $mo = Mo::create(['no_mo' => 'MO-1', 'no_tm' => 'TM-1', 'makloon_user_id' => $makloon->id, 'total_kuantum_olah' => 800, 'created_by' => $op->id]);
        MoDetail::create(['mo_id' => $mo->id, 'pengolahan_id' => $p->id]);

        $this->assertCount(1, $mo->moDetail);
        $this->assertSame('LHPK-1', $mo->moDetail->first()->pengolahan->no_lhpk);
        $this->assertSame('pengadaan', $mo->current_stage);
    }
}
```

- [ ] **Step 5: Jalankan**

Run: `cd backend && php artisan test --filter=MoModelTest`
Expected: PASS.

- [ ] **Step 6: Task selesai — lapor status hijau.**

---

### Task 5: `PengolahanService` — buat, kuantum-IN, ajukan ulang, tolak

**Files:**
- Create: `backend/app/Services/Pengolahan/PengolahanService.php`
- Create: `backend/tests/Feature/Pengolahan/PengolahanServiceTest.php`

**Interfaces:**
- Consumes: `App\Models\Pengolahan`, `App\Models\PoDetail`, `App\Models\DataPengadaan`.
- Produces:
  - `totalKuantumIn(int $makloonUserId): float` — jumlah `po_detail.kuantum_kontribusi` yang `no_in` terisi & `data_pengadaan.makloon_user_id = $makloonUserId`.
  - `buat(User $ub, array $data): Pengolahan` — `$data` = `makloon_user_id, kuantum_olah, no_lhpk, tanggal, ka1..3, hgl, broken, menir, katul`. Isi `jumlah_kuantum = totalKuantumIn(makloon)`, `rendemen` otomatis, `status = menunggu_operasi`, `created_by = ub->id`.
  - `ajukanUlang(Pengolahan $p, array $data): Pengolahan` — hanya bila `status = ditolak`; reset `status = menunggu_operasi`, `catatan_penolakan = null`, hitung ulang rendemen.
  - `tolak(Pengolahan $p, User $operasi, string $catatan): Pengolahan` — hanya bila `status = menunggu_operasi`; set `status = ditolak`, `catatan_penolakan`.

- [ ] **Step 1: Tulis test gagal**

`backend/tests/Feature/Pengolahan/PengolahanServiceTest.php`:

```php
<?php

namespace Tests\Feature\Pengolahan;

use App\Models\DataPengadaan;
use App\Models\Pengolahan;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\User;
use App\Services\Pengolahan\PengolahanService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PengolahanServiceTest extends TestCase
{
    use RefreshDatabase;

    private PengolahanService $service;
    private User $makloon;
    private User $ub;
    private User $operasi;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        $this->service = app(PengolahanService::class);
        $this->makloon = User::create(['username' => 'm1', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'makloon')->value('id')]);
        $this->ub = User::create(['username' => 'ub', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'ub_jastasma')->value('id')]);
        $this->operasi = User::create(['username' => 'op', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'operasi')->value('id')]);
    }

    private function poDenganIn(int $makloonId, float $kuantum, ?string $noIn): void
    {
        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-07-10', 'id_pemasok' => 'P1', 'makloon_user_id' => $makloonId,
            'total_kuantum' => $kuantum, 'harga' => 6500, 'total_harga' => $kuantum * 6500,
            'no_po' => 'PO-'.uniqid(), 'status' => 'lengkap',
        ]);
        PoDetail::create(['data_pengadaan_id' => $po->id, 'transaksi_id' => '00001/07/2026/MPP', 'kuantum_kontribusi' => $kuantum, 'no_in' => $noIn]);
    }

    public function test_total_kuantum_in_menjumlahkan_hanya_yang_sudah_in(): void
    {
        $this->poDenganIn($this->makloon->id, 100, 'IN-1');
        $this->poDenganIn($this->makloon->id, 50, 'IN-2');
        $this->poDenganIn($this->makloon->id, 30, null); // belum IN, tidak dihitung

        $this->assertSame(150.0, $this->service->totalKuantumIn($this->makloon->id));
    }

    public function test_buat_mengisi_jumlah_kuantum_dan_rendemen(): void
    {
        $this->poDenganIn($this->makloon->id, 1000, 'IN-1');

        $p = $this->service->buat($this->ub, [
            'makloon_user_id' => $this->makloon->id,
            'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-1', 'tanggal' => '2026-07-20',
            'ka1' => 12.5, 'ka2' => 12.6, 'ka3' => 12.7,
            'hgl' => 600, 'broken' => 50, 'menir' => 20, 'katul' => 30,
        ]);

        $this->assertSame('1000.00', $p->jumlah_kuantum);
        $this->assertSame('60.00', $p->rendemen); // 600/1000*100
        $this->assertSame('menunggu_operasi', $p->status);
    }

    public function test_tolak_lalu_ajukan_ulang(): void
    {
        $this->poDenganIn($this->makloon->id, 1000, 'IN-1');
        $p = $this->service->buat($this->ub, ['makloon_user_id' => $this->makloon->id, 'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-2', 'tanggal' => '2026-07-20', 'hgl' => 500]);

        $this->service->tolak($p, $this->operasi, 'HGL kurang');
        $this->assertSame('ditolak', $p->fresh()->status);
        $this->assertSame('HGL kurang', $p->fresh()->catatan_penolakan);

        $this->service->ajukanUlang($p->fresh(), ['makloon_user_id' => $this->makloon->id, 'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-2', 'tanggal' => '2026-07-20', 'hgl' => 700]);
        $this->assertSame('menunggu_operasi', $p->fresh()->status);
        $this->assertNull($p->fresh()->catatan_penolakan);
        $this->assertSame('70.00', $p->fresh()->rendemen);
    }

    public function test_tolak_hanya_untuk_status_menunggu(): void
    {
        $this->poDenganIn($this->makloon->id, 1000, 'IN-1');
        $p = $this->service->buat($this->ub, ['makloon_user_id' => $this->makloon->id, 'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-3', 'tanggal' => '2026-07-20', 'hgl' => 500]);
        $p->update(['status' => 'digabung']);

        $this->expectException(HttpException::class);
        $this->service->tolak($p->fresh(), $this->operasi, 'telat');
    }
}
```

- [ ] **Step 2: Jalankan — pastikan gagal**

Run: `cd backend && php artisan test --filter=PengolahanServiceTest`
Expected: FAIL (class `PengolahanService` belum ada).

- [ ] **Step 3: Implementasi `PengolahanService`**

`backend/app/Services/Pengolahan/PengolahanService.php`:

```php
<?php

namespace App\Services\Pengolahan;

use App\Models\Pengolahan;
use App\Models\PoDetail;
use App\Models\User;

class PengolahanService
{
    /** Total kuantum yang SUDAH masuk proses IN untuk makloon tertentu (referensi read-only). */
    public function totalKuantumIn(int $makloonUserId): float
    {
        return (float) PoDetail::whereNotNull('no_in')
            ->whereHas('dataPengadaan', fn ($q) => $q->where('makloon_user_id', $makloonUserId))
            ->sum('kuantum_kontribusi');
    }

    public function buat(User $ub, array $data): Pengolahan
    {
        $jumlahKuantum = $this->totalKuantumIn((int) $data['makloon_user_id']);

        return Pengolahan::create([
            'makloon_user_id' => $data['makloon_user_id'],
            'jumlah_kuantum' => $jumlahKuantum,
            'kuantum_olah' => $data['kuantum_olah'],
            'no_lhpk' => $data['no_lhpk'],
            'tanggal' => $data['tanggal'],
            'ka1' => $data['ka1'] ?? null,
            'ka2' => $data['ka2'] ?? null,
            'ka3' => $data['ka3'] ?? null,
            'hgl' => $data['hgl'] ?? null,
            'broken' => $data['broken'] ?? null,
            'menir' => $data['menir'] ?? null,
            'katul' => $data['katul'] ?? null,
            'rendemen' => $this->hitungRendemen($data['hgl'] ?? null, $jumlahKuantum),
            'status' => 'menunggu_operasi',
            'created_by' => $ub->id,
        ]);
    }

    public function ajukanUlang(Pengolahan $p, array $data): Pengolahan
    {
        if ($p->status !== 'ditolak') {
            abort(422, 'Hanya pengolahan yang ditolak yang dapat diajukan ulang.');
        }

        $p->update([
            'kuantum_olah' => $data['kuantum_olah'],
            'no_lhpk' => $data['no_lhpk'],
            'tanggal' => $data['tanggal'],
            'ka1' => $data['ka1'] ?? null,
            'ka2' => $data['ka2'] ?? null,
            'ka3' => $data['ka3'] ?? null,
            'hgl' => $data['hgl'] ?? null,
            'broken' => $data['broken'] ?? null,
            'menir' => $data['menir'] ?? null,
            'katul' => $data['katul'] ?? null,
            'rendemen' => $this->hitungRendemen($data['hgl'] ?? null, (float) $p->jumlah_kuantum),
            'status' => 'menunggu_operasi',
            'catatan_penolakan' => null,
        ]);

        return $p->fresh();
    }

    public function tolak(Pengolahan $p, User $operasi, string $catatan): Pengolahan
    {
        if ($p->status !== 'menunggu_operasi') {
            abort(422, 'Hanya pengolahan yang menunggu Operasi yang dapat ditolak.');
        }

        $p->update([
            'status' => 'ditolak',
            'catatan_penolakan' => $catatan,
            'locked_by' => $operasi->id,
            'locked_at' => now(),
        ]);

        return $p->fresh();
    }

    private function hitungRendemen(?float $hgl, float $jumlahKuantum): ?float
    {
        if ($hgl === null || $jumlahKuantum <= 0) {
            return null;
        }

        return round($hgl / $jumlahKuantum * 100, 2);
    }
}
```

- [ ] **Step 4: Jalankan — hijau**

Run: `cd backend && php artisan test --filter=PengolahanServiceTest`
Expected: PASS.

- [ ] **Step 5: Task selesai — lapor status hijau.**

---

### Task 6: `MoService` — gabungkan, keputusan OUT, kirim gudang, terima/tolak gudang

**Files:**
- Create: `backend/app/Services/Pengolahan/MoService.php`
- Create: `backend/tests/Feature/Pengolahan/MoServiceTest.php`

**Interfaces:**
- Consumes: `Pengolahan`, `Mo`, `MoDetail`.
- Produces:
  - `gabungkan(array $pengolahanIds, string $noMo, string $noTm, User $operasi): Mo` — semua pengolahan `status = menunggu_operasi`, **makloon sama**, belum `digabung`. Buat `Mo` (`current_stage = pengadaan`, `total_kuantum_olah` = sum), tandai tiap pengolahan `status = digabung` + `mo_id`. Tolak (422) bila lintas makloon / status salah / `no_mo` sudah dipakai.
  - `putuskanOut(Mo $mo, string $keputusan, ?string $noOut, ?string $catatan, User $pengadaan): Mo` — hanya bila `current_stage = pengadaan`. `diterima`: isi `no_out` (unik), `current_stage = operasi`, `catatan_penolakan = null`. `ditolak`: isi `catatan_penolakan`, `current_stage = operasi`, `no_out` tetap null.
  - `kirimGudang(Mo $mo, array $data, User $operasi): Mo` — hanya bila `current_stage = operasi` **dan** `no_out` sudah ada. `$data` = `tujuan_gudang_user_id, no_tm_gudang, kuantum_total`. Set `current_stage = gudang`.
  - `terimaGudang(Mo $mo, User $gudang, string $tanggal): Mo` — hanya bila `current_stage = gudang` dan `gudang->id = tujuan_gudang_user_id`. Set `tanggal_terima_gudang`, `status = selesai`, `current_stage = selesai`.
  - `tolakGudang(Mo $mo, User $gudang, string $catatan): Mo` — hanya bila `current_stage = gudang` dan `gudang->id = tujuan_gudang_user_id`. Set `catatan_penolakan`, `current_stage = operasi`.

- [ ] **Step 1: Tulis test gagal**

`backend/tests/Feature/Pengolahan/MoServiceTest.php`:

```php
<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Mo;
use App\Models\Pengolahan;
use App\Models\Role;
use App\Models\User;
use App\Services\Pengolahan\MoService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class MoServiceTest extends TestCase
{
    use RefreshDatabase;

    private MoService $service;
    private User $operasi;
    private User $pengadaan;
    private User $gudangA;
    private User $gudangB;
    private User $makloon1;
    private User $makloon2;
    private User $ub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        $this->service = app(MoService::class);
        $this->operasi = $this->user('operasi');
        $this->pengadaan = $this->user('pengadaan');
        $this->gudangA = $this->user('gudang', ['nama_gudang' => 'Gudang Jaya 1']);
        $this->gudangB = $this->user('gudang', ['nama_gudang' => 'Gudang Jaya 2']);
        $this->makloon1 = $this->user('makloon');
        $this->makloon2 = $this->user('makloon');
        $this->ub = $this->user('ub_jastasma');
    }

    private function user(string $role, array $extra = []): User
    {
        return User::create(['username' => $role.'_'.uniqid(), 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', $role)->value('id'), ...$extra]);
    }

    private function pengolahan(User $makloon, string $lhpk, float $kuantumOlah): Pengolahan
    {
        return Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => $kuantumOlah, 'no_lhpk' => $lhpk, 'tanggal' => '2026-07-20', 'created_by' => $this->ub->id]);
    }

    public function test_gabungkan_menjumlahkan_kuantum_olah_dan_menandai_digabung(): void
    {
        $p1 = $this->pengolahan($this->makloon1, 'LHPK-1', 300);
        $p2 = $this->pengolahan($this->makloon1, 'LHPK-2', 200);

        $mo = $this->service->gabungkan([$p1->id, $p2->id], 'MO-1', 'TM-1', $this->operasi);

        $this->assertSame('500.00', $mo->total_kuantum_olah);
        $this->assertSame('pengadaan', $mo->current_stage);
        $this->assertSame($this->makloon1->id, $mo->makloon_user_id);
        $this->assertCount(2, $mo->moDetail);
        $this->assertSame('digabung', $p1->fresh()->status);
        $this->assertSame($mo->id, $p1->fresh()->mo_id);
    }

    public function test_gabungkan_menolak_lintas_makloon(): void
    {
        $p1 = $this->pengolahan($this->makloon1, 'LHPK-1', 300);
        $p2 = $this->pengolahan($this->makloon2, 'LHPK-2', 200);

        $this->expectException(HttpException::class);
        $this->service->gabungkan([$p1->id, $p2->id], 'MO-2', 'TM-2', $this->operasi);
    }

    public function test_alur_lengkap_sampai_gudang_selesai(): void
    {
        $p = $this->pengolahan($this->makloon1, 'LHPK-9', 400);
        $mo = $this->service->gabungkan([$p->id], 'MO-9', 'TM-9', $this->operasi);

        $mo = $this->service->putuskanOut($mo, 'diterima', 'OUT-9', null, $this->pengadaan);
        $this->assertSame('OUT-9', $mo->no_out);
        $this->assertSame('operasi', $mo->current_stage);

        $mo = $this->service->kirimGudang($mo, ['tujuan_gudang_user_id' => $this->gudangA->id, 'no_tm_gudang' => 'TMG-9', 'kuantum_total' => 400], $this->operasi);
        $this->assertSame('gudang', $mo->current_stage);

        // gudang lain tidak boleh menerima
        try {
            $this->service->terimaGudang($mo, $this->gudangB, '2026-07-21');
            $this->fail('Gudang non-tujuan seharusnya ditolak.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }

        $mo = $this->service->terimaGudang($mo->fresh(), $this->gudangA, '2026-07-21');
        $this->assertSame('selesai', $mo->status);
        $this->assertSame('selesai', $mo->current_stage);
        $this->assertSame('2026-07-21', $mo->tanggal_terima_gudang->format('Y-m-d'));
    }

    public function test_pengadaan_tolak_mengembalikan_ke_operasi_tanpa_no_out(): void
    {
        $p = $this->pengolahan($this->makloon1, 'LHPK-8', 400);
        $mo = $this->service->gabungkan([$p->id], 'MO-8', 'TM-8', $this->operasi);

        $mo = $this->service->putuskanOut($mo, 'ditolak', null, 'No TM salah', $this->pengadaan);
        $this->assertSame('operasi', $mo->current_stage);
        $this->assertNull($mo->no_out);
        $this->assertSame('No TM salah', $mo->catatan_penolakan);
    }

    public function test_kirim_gudang_butuh_no_out(): void
    {
        $p = $this->pengolahan($this->makloon1, 'LHPK-7', 400);
        $mo = $this->service->gabungkan([$p->id], 'MO-7', 'TM-7', $this->operasi);
        $mo->update(['current_stage' => 'operasi']); // tanpa no_out

        $this->expectException(HttpException::class);
        $this->service->kirimGudang($mo, ['tujuan_gudang_user_id' => $this->gudangA->id, 'no_tm_gudang' => 'X', 'kuantum_total' => 400], $this->operasi);
    }
}
```

- [ ] **Step 2: Jalankan — pastikan gagal**

Run: `cd backend && php artisan test --filter=MoServiceTest`
Expected: FAIL (class `MoService` belum ada).

- [ ] **Step 3: Implementasi `MoService`**

`backend/app/Services/Pengolahan/MoService.php`:

```php
<?php

namespace App\Services\Pengolahan;

use App\Models\Mo;
use App\Models\MoDetail;
use App\Models\Pengolahan;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class MoService
{
    public function gabungkan(array $pengolahanIds, string $noMo, string $noTm, User $operasi): Mo
    {
        if (count($pengolahanIds) < 1) {
            abort(422, 'Pilih minimal satu baris pengolahan.');
        }

        if (Mo::where('no_mo', $noMo)->exists()) {
            abort(422, 'Nomor MO sudah dipakai.');
        }

        return DB::transaction(function () use ($pengolahanIds, $noMo, $noTm, $operasi) {
            $rows = Pengolahan::whereIn('id', $pengolahanIds)->lockForUpdate()->get();

            if ($rows->count() !== count(array_unique($pengolahanIds))) {
                abort(422, 'Salah satu baris pengolahan tidak ditemukan.');
            }

            $makloonId = null;
            foreach ($rows as $row) {
                if ($row->status !== 'menunggu_operasi') {
                    abort(422, "Baris {$row->no_lhpk} tidak menunggu Operasi (status: {$row->status}).");
                }
                if ($makloonId === null) {
                    $makloonId = $row->makloon_user_id;
                } elseif ($row->makloon_user_id !== $makloonId) {
                    abort(422, 'Baris yang dipilih harus dari makloon yang sama.');
                }
            }

            $total = (float) $rows->sum('kuantum_olah');

            $mo = Mo::create([
                'no_mo' => $noMo,
                'no_tm' => $noTm,
                'makloon_user_id' => $makloonId,
                'total_kuantum_olah' => number_format($total, 2, '.', ''),
                'current_stage' => 'pengadaan',
                'status' => 'berjalan',
                'created_by' => $operasi->id,
            ]);

            foreach ($rows as $row) {
                MoDetail::create(['mo_id' => $mo->id, 'pengolahan_id' => $row->id]);
                $row->update(['status' => 'digabung', 'mo_id' => $mo->id]);
            }

            return $mo->load('moDetail');
        });
    }

    public function putuskanOut(Mo $mo, string $keputusan, ?string $noOut, ?string $catatan, User $pengadaan): Mo
    {
        return DB::transaction(function () use ($mo, $keputusan, $noOut, $catatan) {
            $mo = Mo::whereKey($mo->id)->lockForUpdate()->firstOrFail();

            if ($mo->current_stage !== 'pengadaan') {
                abort(422, 'MO tidak sedang di tahap Pengadaan.');
            }

            if ($keputusan === 'diterima') {
                $noOut = trim((string) $noOut);
                if ($noOut === '') {
                    abort(422, 'Nomor OUT wajib diisi.');
                }
                if (Mo::where('no_out', $noOut)->whereKeyNot($mo->id)->exists()) {
                    abort(422, 'Nomor OUT sudah dipakai.');
                }
                $mo->update(['no_out' => $noOut, 'catatan_penolakan' => null, 'current_stage' => 'operasi']);
            } elseif ($keputusan === 'ditolak') {
                $catatan = trim((string) $catatan);
                if ($catatan === '') {
                    abort(422, 'Catatan wajib diisi untuk penolakan.');
                }
                $mo->update(['catatan_penolakan' => $catatan, 'current_stage' => 'operasi']);
            } else {
                abort(422, 'Keputusan harus diterima atau ditolak.');
            }

            return $mo->fresh();
        });
    }

    public function kirimGudang(Mo $mo, array $data, User $operasi): Mo
    {
        if ($mo->current_stage !== 'operasi') {
            abort(422, 'MO tidak sedang di tahap Operasi.');
        }
        if (empty($mo->no_out)) {
            abort(422, 'Nomor OUT belum dikeluarkan Pengadaan.');
        }

        $mo->update([
            'tujuan_gudang_user_id' => $data['tujuan_gudang_user_id'],
            'no_tm_gudang' => $data['no_tm_gudang'],
            'kuantum_total' => $data['kuantum_total'],
            'catatan_penolakan' => null,
            'current_stage' => 'gudang',
        ]);

        return $mo->fresh();
    }

    public function terimaGudang(Mo $mo, User $gudang, string $tanggal): Mo
    {
        $this->assertGudangTujuan($mo, $gudang);

        $mo->update([
            'tanggal_terima_gudang' => $tanggal,
            'status' => 'selesai',
            'current_stage' => 'selesai',
        ]);

        return $mo->fresh();
    }

    public function tolakGudang(Mo $mo, User $gudang, string $catatan): Mo
    {
        $this->assertGudangTujuan($mo, $gudang);

        $mo->update(['catatan_penolakan' => $catatan, 'current_stage' => 'operasi']);

        return $mo->fresh();
    }

    private function assertGudangTujuan(Mo $mo, User $gudang): void
    {
        if ($mo->current_stage !== 'gudang') {
            abort(422, 'MO tidak sedang di tahap Gudang.');
        }
        if ($gudang->role->nama_role !== 'admin' && (int) $mo->tujuan_gudang_user_id !== (int) $gudang->id) {
            abort(403, 'Anda bukan gudang tujuan MO ini.');
        }
    }
}
```

- [ ] **Step 4: Jalankan — hijau**

Run: `cd backend && php artisan test --filter=MoServiceTest`
Expected: PASS.

- [ ] **Step 5: Task selesai — lapor status hijau.**

---

### Task 7: Controller + route + test endpoint/otorisasi

**Files:**
- Create: `backend/app/Http/Controllers/Api/PengolahanController.php`
- Create: `backend/app/Http/Controllers/Api/MoController.php`
- Modify: `backend/routes/api.php`
- Create: `backend/tests/Feature/Pengolahan/PengolahanEndpointTest.php`

**Interfaces:**
- Consumes: `PengolahanService`, `MoService`.
- Produces route (semua dalam grup `auth:sanctum`):
  - `GET /api/pengolahan` (role ub_jastasma|operasi|pengadaan|gudang|admin) — list paginated, eager `makloon,creator,mo`.
  - `GET /api/pengolahan/kuantum-in?makloon_user_id=` (ub_jastasma|admin) → `{ "data": { "total": float } }`.
  - `POST /api/pengolahan` (ub_jastasma|admin).
  - `PATCH /api/pengolahan/{pengolahan}` (ub_jastasma|admin) — ajukan ulang.
  - `POST /api/pengolahan/{pengolahan}/tolak` (operasi|admin).
  - `POST /api/mo/gabungkan` (operasi|admin).
  - `GET /api/mo` (operasi|pengadaan|gudang|admin) — list, eager `makloon,tujuanGudang,moDetail.pengolahan`.
  - `GET /api/mo/{mo}` (operasi|pengadaan|gudang|admin).
  - `PATCH /api/mo/{mo}/out` (pengadaan|admin).
  - `PATCH /api/mo/{mo}/kirim-gudang` (operasi|admin).
  - `POST /api/mo/{mo}/terima` (gudang|admin).
  - `POST /api/mo/{mo}/tolak` (gudang|admin).

- [ ] **Step 1: `PengolahanController`**

`backend/app/Http/Controllers/Api/PengolahanController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengolahan;
use App\Services\Pengolahan\PengolahanService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PengolahanController extends Controller
{
    public function __construct(private PengolahanService $service) {}

    public function index(Request $request)
    {
        $page = Pengolahan::with(['makloon', 'creator', 'mo'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
            ],
        ]);
    }

    public function kuantumIn(Request $request)
    {
        $validated = $request->validate([
            'makloon_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
        ]);

        return response()->json(['data' => ['total' => $this->service->totalKuantumIn((int) $validated['makloon_user_id'])]]);
    }

    public function store(Request $request)
    {
        $validated = $this->validatePengolahan($request);
        $pengolahan = $this->service->buat($request->user(), $validated);

        return response()->json(['data' => $pengolahan->load('makloon')], 201);
    }

    public function update(Request $request, Pengolahan $pengolahan)
    {
        $validated = $this->validatePengolahan($request, $pengolahan);
        $pengolahan = $this->service->ajukanUlang($pengolahan, $validated);

        return response()->json(['data' => $pengolahan->load('makloon')]);
    }

    public function tolak(Request $request, Pengolahan $pengolahan)
    {
        $validated = $request->validate(['catatan' => ['required', 'string', 'max:2000']]);
        $pengolahan = $this->service->tolak($pengolahan, $request->user(), $validated['catatan']);

        return response()->json(['data' => $pengolahan]);
    }

    private function validatePengolahan(Request $request, ?Pengolahan $pengolahan = null): array
    {
        $max = 999999999999.99;

        return $request->validate([
            'makloon_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'kuantum_olah' => ['required', 'numeric', 'min:0.01', "max:{$max}"],
            'no_lhpk' => ['required', 'string', 'max:255', Rule::unique('pengolahan', 'no_lhpk')->ignore($pengolahan?->id)],
            'tanggal' => ['required', 'date'],
            'ka1' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'ka2' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'ka3' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'hgl' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
            'broken' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
            'menir' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
            'katul' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
        ]);
    }
}
```

- [ ] **Step 2: `MoController`**

`backend/app/Http/Controllers/Api/MoController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Mo;
use App\Services\Pengolahan\MoService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MoController extends Controller
{
    public function __construct(private MoService $service) {}

    public function index(Request $request)
    {
        $page = Mo::with(['makloon', 'tujuanGudang', 'moDetail.pengolahan'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
            ],
        ]);
    }

    public function show(Mo $mo)
    {
        return response()->json(['data' => $mo->load(['makloon', 'tujuanGudang', 'moDetail.pengolahan'])]);
    }

    public function gabungkan(Request $request)
    {
        $validated = $request->validate([
            'pengolahan_ids' => ['required', 'array', 'min:1'],
            'pengolahan_ids.*' => ['required', 'integer', Rule::exists('pengolahan', 'id')],
            'no_mo' => ['required', 'string', 'max:255', 'unique:mo,no_mo'],
            'no_tm' => ['required', 'string', 'max:255'],
        ]);

        $mo = $this->service->gabungkan($validated['pengolahan_ids'], $validated['no_mo'], $validated['no_tm'], $request->user());

        return response()->json(['data' => $mo], 201);
    }

    public function out(Request $request, Mo $mo)
    {
        $validated = $request->validate([
            'keputusan' => ['required', 'in:diterima,ditolak'],
            'no_out' => ['nullable', 'required_if:keputusan,diterima', 'string', 'max:255'],
            'catatan' => ['nullable', 'required_if:keputusan,ditolak', 'string', 'max:2000'],
        ]);

        $mo = $this->service->putuskanOut($mo, $validated['keputusan'], $validated['no_out'] ?? null, $validated['catatan'] ?? null, $request->user());

        return response()->json(['data' => $mo]);
    }

    public function kirimGudang(Request $request, Mo $mo)
    {
        $validated = $request->validate([
            'tujuan_gudang_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'no_tm_gudang' => ['required', 'string', 'max:255'],
            'kuantum_total' => ['required', 'numeric', 'min:0.01', 'max:999999999999.99'],
        ]);

        $mo = $this->service->kirimGudang($mo, $validated, $request->user());

        return response()->json(['data' => $mo]);
    }

    public function terima(Request $request, Mo $mo)
    {
        $validated = $request->validate(['tanggal' => ['required', 'date']]);
        $mo = $this->service->terimaGudang($mo, $request->user(), $validated['tanggal']);

        return response()->json(['data' => $mo]);
    }

    public function tolak(Request $request, Mo $mo)
    {
        $validated = $request->validate(['catatan' => ['required', 'string', 'max:2000']]);
        $mo = $this->service->tolakGudang($mo, $request->user(), $validated['catatan']);

        return response()->json(['data' => $mo]);
    }
}
```

- [ ] **Step 3: Route di `routes/api.php`**

Tambahkan `use` untuk kedua controller di atas, lalu di dalam grup `auth:sanctum` (setelah blok `/po/...`):

```php
Route::get('/pengolahan', [PengolahanController::class, 'index'])
    ->middleware('role:ub_jastasma|operasi|pengadaan|gudang|admin');
Route::get('/pengolahan/kuantum-in', [PengolahanController::class, 'kuantumIn'])
    ->middleware('role:ub_jastasma|admin');
Route::post('/pengolahan', [PengolahanController::class, 'store'])
    ->middleware('role:ub_jastasma|admin');
Route::patch('/pengolahan/{pengolahan}', [PengolahanController::class, 'update'])
    ->middleware('role:ub_jastasma|admin');
Route::post('/pengolahan/{pengolahan}/tolak', [PengolahanController::class, 'tolak'])
    ->middleware('role:operasi|admin');

Route::post('/mo/gabungkan', [MoController::class, 'gabungkan'])
    ->middleware('role:operasi|admin');
Route::get('/mo', [MoController::class, 'index'])
    ->middleware('role:operasi|pengadaan|gudang|admin');
Route::get('/mo/{mo}', [MoController::class, 'show'])
    ->middleware('role:operasi|pengadaan|gudang|admin');
Route::patch('/mo/{mo}/out', [MoController::class, 'out'])
    ->middleware('role:pengadaan|admin');
Route::patch('/mo/{mo}/kirim-gudang', [MoController::class, 'kirimGudang'])
    ->middleware('role:operasi|admin');
Route::post('/mo/{mo}/terima', [MoController::class, 'terima'])
    ->middleware('role:gudang|admin');
Route::post('/mo/{mo}/tolak', [MoController::class, 'tolak'])
    ->middleware('role:gudang|admin');
```

> **Catatan urutan route:** `pengolahan/kuantum-in` didaftarkan SEBELUM `pengolahan/{pengolahan}` bukan keharusan di sini (parameter `{pengolahan}` default hanya cocok integer via route-model-binding), tapi tetap letakkan `kuantum-in` lebih dulu untuk jelas.

- [ ] **Step 4: Test endpoint + otorisasi**

`backend/tests/Feature/Pengolahan/PengolahanEndpointTest.php`:

```php
<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Mo;
use App\Models\Pengolahan;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PengolahanEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function user(string $role, array $extra = []): User
    {
        return User::create(['username' => $role.'_'.uniqid(), 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', $role)->value('id'), ...$extra]);
    }

    public function test_ub_jastasma_buat_pengolahan_via_api(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');

        $this->actingAs($ub)->postJson('/api/pengolahan', [
            'makloon_user_id' => $makloon->id,
            'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-API-1', 'tanggal' => '2026-07-20',
            'ka1' => 12.5, 'hgl' => 600,
        ])->assertStatus(201)->assertJsonPath('data.no_lhpk', 'LHPK-API-1');
    }

    public function test_operasi_tidak_boleh_buat_pengolahan(): void
    {
        $makloon = $this->user('makloon');
        $operasi = $this->user('operasi');

        $this->actingAs($operasi)->postJson('/api/pengolahan', [
            'makloon_user_id' => $makloon->id, 'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-X', 'tanggal' => '2026-07-20',
        ])->assertStatus(403);
    }

    public function test_operasi_gabung_mo_lalu_pengadaan_keluarkan_out(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');
        $operasi = $this->user('operasi');
        $pengadaan = $this->user('pengadaan');

        $p = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 400, 'no_lhpk' => 'LHPK-M', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);

        $this->actingAs($operasi)->postJson('/api/mo/gabungkan', [
            'pengolahan_ids' => [$p->id], 'no_mo' => 'MO-API-1', 'no_tm' => 'TM-API-1',
        ])->assertStatus(201);

        $mo = Mo::where('no_mo', 'MO-API-1')->firstOrFail();

        $this->actingAs($pengadaan)->patchJson("/api/mo/{$mo->id}/out", [
            'keputusan' => 'diterima', 'no_out' => 'OUT-API-1',
        ])->assertOk()->assertJsonPath('data.current_stage', 'operasi');
    }

    public function test_gudang_bukan_tujuan_tidak_boleh_terima(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');
        $operasi = $this->user('operasi');
        $pengadaan = $this->user('pengadaan');
        $gudangA = $this->user('gudang', ['nama_gudang' => 'Gudang Jaya 1']);
        $gudangB = $this->user('gudang', ['nama_gudang' => 'Gudang Jaya 2']);

        $p = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 400, 'no_lhpk' => 'LHPK-G', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);
        $mo = app(\App\Services\Pengolahan\MoService::class)->gabungkan([$p->id], 'MO-G', 'TM-G', $operasi);
        app(\App\Services\Pengolahan\MoService::class)->putuskanOut($mo, 'diterima', 'OUT-G', null, $pengadaan);
        app(\App\Services\Pengolahan\MoService::class)->kirimGudang($mo->fresh(), ['tujuan_gudang_user_id' => $gudangA->id, 'no_tm_gudang' => 'TMG', 'kuantum_total' => 400], $operasi);

        $this->actingAs($gudangB)->postJson("/api/mo/{$mo->id}/terima", ['tanggal' => '2026-07-21'])->assertStatus(403);
        $this->actingAs($gudangA)->postJson("/api/mo/{$mo->id}/terima", ['tanggal' => '2026-07-21'])->assertOk()->assertJsonPath('data.status', 'selesai');
    }
}
```

- [ ] **Step 5: Jalankan test Task 7**

Run: `cd backend && php artisan test --filter=PengolahanEndpointTest`
Expected: PASS.

- [ ] **Step 6: Jalankan SELURUH test backend (regression)**

Run: `cd backend && php artisan test`
Expected: PASS semua.

- [ ] **Step 7: Task selesai — lapor status hijau.**

---

### Task 8: Teardown frontend Operasi/Gudang + bersihkan nav & route

**Files:**
- Delete: `frontend/src/pages/OperasiPage.tsx`, `frontend/src/pages/OperasiRekapPage.tsx`
- Delete: `frontend/src/pages/GudangPage.tsx`, `frontend/src/pages/GudangRekapPage.tsx`
- Delete: `frontend/src/hooks/useOperasiList.ts`, `frontend/src/hooks/useGudang.ts`
- Modify: `frontend/src/App.tsx` (hapus route ke halaman di atas)
- Modify: `frontend/src/components/AppNav.tsx` dan/atau `frontend/src/lib/navActions.ts` (hapus entri operasi/gudang lama)

- [ ] **Step 1: Hapus file halaman & hook lama**

```bash
cd frontend
rm src/pages/OperasiPage.tsx src/pages/OperasiRekapPage.tsx \
   src/pages/GudangPage.tsx src/pages/GudangRekapPage.tsx \
   src/hooks/useOperasiList.ts src/hooks/useGudang.ts
```

- [ ] **Step 2: Cari & buang semua referensi**

Run: `cd frontend && grep -rniE "OperasiPage|OperasiRekapPage|GudangPage|GudangRekapPage|useOperasiList|useGudang" src`
Expected: tidak ada hasil. Hapus tiap `import`, entri route di `App.tsx`, dan entri menu di `AppNav.tsx`/`navActions.ts` yang muncul. (Entri nav baru ditambahkan di Task 9–12.)

- [ ] **Step 3: Pastikan build/tsc bersih**

Run: `cd frontend && npm run build`
Expected: sukses tanpa error TypeScript soal modul yang hilang.

- [ ] **Step 4: Task selesai — lapor status hijau.**

---

### Task 9: Frontend — halaman Pengolahan UB Jastasma (buat + ajukan ulang)

**Files:**
- Create: `frontend/src/hooks/usePengolahan.ts`
- Create: `frontend/src/pages/PengolahanUbJastasmaPage.tsx`
- Modify: `frontend/src/App.tsx` (route `/pengolahan`)
- Modify: `frontend/src/components/AppNav.tsx` (menu untuk role `ub_jastasma`)

**Interfaces:**
- Consumes: wrapper `api` (`frontend/src/lib/api.ts`), pola TanStack Query seperti `useTransaksiList.ts`, `MakloonCombobox`.
- Produces: hook `usePengolahanList()`, `useKuantumIn(makloonUserId)`, `useBuatPengolahan()`, `useAjukanUlangPengolahan()`.

- [ ] **Step 1: Hook `usePengolahan.ts`**

Ikuti pola `frontend/src/hooks/useOperasiList.ts` yang lama (sudah dihapus — lihat `useTransaksiList.ts` sebagai acuan hidup). Isi:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Pengolahan {
  id: number;
  makloon_user_id: number;
  jumlah_kuantum: string;
  kuantum_olah: string;
  no_lhpk: string;
  tanggal: string;
  ka1: string | null; ka2: string | null; ka3: string | null;
  hgl: string | null; broken: string | null; menir: string | null; katul: string | null;
  rendemen: string | null;
  status: 'menunggu_operasi' | 'ditolak' | 'digabung';
  catatan_penolakan: string | null;
  mo_id: number | null;
  makloon?: { id: number; nama_maklon: string | null };
}

export interface PengolahanForm {
  makloon_user_id: number;
  kuantum_olah: number;
  no_lhpk: string;
  tanggal: string;
  ka1?: number; ka2?: number; ka3?: number;
  hgl?: number; broken?: number; menir?: number; katul?: number;
}

export function usePengolahanList() {
  return useQuery({
    queryKey: ['pengolahan'],
    queryFn: async () => (await api.get('/pengolahan')).data as { data: Pengolahan[]; meta: unknown },
  });
}

export function useKuantumIn(makloonUserId: number | null) {
  return useQuery({
    queryKey: ['pengolahan-kuantum-in', makloonUserId],
    enabled: makloonUserId != null,
    queryFn: async () =>
      (await api.get('/pengolahan/kuantum-in', { params: { makloon_user_id: makloonUserId } })).data.data as { total: number },
  });
}

export function useBuatPengolahan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: PengolahanForm) => (await api.post('/pengolahan', form)).data.data as Pengolahan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pengolahan'] }),
  });
}

export function useAjukanUlangPengolahan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id: number; form: PengolahanForm }) =>
      (await api.patch(`/pengolahan/${id}`, form)).data.data as Pengolahan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pengolahan'] }),
  });
}
```

- [ ] **Step 2: Halaman `PengolahanUbJastasmaPage.tsx`**

Bangun form + list, ikuti gaya `frontend/src/pages/TransaksiUbJastasmaPage.tsx` dan `FormHero`. Perilaku wajib:
- `MakloonCombobox` untuk pilih makloon → saat berubah, panggil `useKuantumIn` dan tampilkan `jumlah_kuantum` (read-only).
- Field input: `kuantum_olah`, `no_lhpk`, `tanggal`, `ka1/ka2/ka3`, `hgl`, `broken`, `menir`, `katul`.
- **Rendemen (read-only)** dihitung live di UI: `hgl && jumlah_kuantum ? (hgl / jumlah_kuantum * 100).toFixed(2) : '-'`.
- Submit via `useBuatPengolahan`; sukses → toast (pakai `lib/sonner.tsx`) + reset form.
- List pengolahan milik user: tampilkan status badge (warna: `menunggu_operasi` kuning, `ditolak` merah, `digabung` hijau — token Bagian 7.1). Baris `ditolak` menampilkan `catatan_penolakan` dan tombol "Edit & Ajukan Ulang" yang memuat form dengan `useAjukanUlangPengolahan`.

Contoh perhitungan rendemen live (di dalam komponen):

```tsx
const rendemen =
  hgl && jumlahKuantum && Number(jumlahKuantum) > 0
    ? ((Number(hgl) / Number(jumlahKuantum)) * 100).toFixed(2)
    : '-';
```

- [ ] **Step 3: Route & nav**

Di `App.tsx` tambah route terproteksi `/pengolahan` → `PengolahanUbJastasmaPage` (guard role `ub_jastasma`, ikuti pola route lain). Di `AppNav.tsx` tambah item menu "Pengolahan" untuk role `ub_jastasma`.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: sukses.

- [ ] **Step 5: Task selesai — lapor status hijau.**

---

### Task 10: Frontend — Operasi (review per-LHPK, gabung MO, kirim gudang)

**Files:**
- Create: `frontend/src/hooks/useMo.ts`
- Create: `frontend/src/pages/OperasiPengolahanPage.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/AppNav.tsx`

**Interfaces:**
- Consumes: `usePengolahanList` (Task 9), `api`.
- Produces: hook `useMoList()`, `useGabungkanMo()`, `useKirimGudang()`, `useTolakPengolahan()`, `useGudangOptions()`.

- [ ] **Step 1: Hook `useMo.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Mo {
  id: number;
  no_mo: string; no_tm: string;
  makloon_user_id: number;
  total_kuantum_olah: string;
  no_out: string | null;
  tujuan_gudang_user_id: number | null;
  no_tm_gudang: string | null;
  kuantum_total: string | null;
  tanggal_terima_gudang: string | null;
  current_stage: 'pengadaan' | 'operasi' | 'gudang' | 'selesai';
  status: 'berjalan' | 'selesai' | 'dibatalkan';
  catatan_penolakan: string | null;
  makloon?: { id: number; nama_maklon: string | null };
  tujuan_gudang?: { id: number; nama_gudang: string | null };
  mo_detail?: { id: number; pengolahan: { id: number; no_lhpk: string; kuantum_olah: string } }[];
}

export function useMoList() {
  return useQuery({ queryKey: ['mo'], queryFn: async () => (await api.get('/mo')).data as { data: Mo[]; meta: unknown } });
}

export function useGudangOptions() {
  return useQuery({
    queryKey: ['gudang-options'],
    queryFn: async () => (await api.get('/gudang-options')).data.data as { id: number; nama_gudang: string }[],
  });
}

export function useTolakPengolahan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, catatan }: { id: number; catatan: string }) =>
      (await api.post(`/pengolahan/${id}/tolak`, { catatan })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pengolahan'] }),
  });
}

export function useGabungkanMo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { pengolahan_ids: number[]; no_mo: string; no_tm: string }) =>
      (await api.post('/mo/gabungkan', body)).data.data as Mo,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pengolahan'] }); qc.invalidateQueries({ queryKey: ['mo'] }); },
  });
}

export function useKirimGudang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: { tujuan_gudang_user_id: number; no_tm_gudang: string; kuantum_total: number } }) =>
      (await api.patch(`/mo/${id}/kirim-gudang`, body)).data.data as Mo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  });
}
```

- [ ] **Step 2: Halaman `OperasiPengolahanPage.tsx`**

Dua bagian (tab atau seksi), ikuti gaya `PengadaanPage.tsx`:
1. **Review LHPK**: daftar `pengolahan` status `menunggu_operasi`. Tombol **Tolak** (dialog `ConfirmDialog` + input catatan → `useTolakPengolahan`). Checkbox pilih beberapa baris **makloon sama** → form **Gabung MO** (input `no_mo`, `no_tm`) → `useGabungkanMo`. Validasi di UI: tombol gabung disabled kalau baris terpilih beda makloon (tampilkan pesan).
2. **MO tahap Operasi**: `useMoList` difilter `current_stage === 'operasi'`. Tampilkan `no_out` (kalau ada → berarti sudah lewat Pengadaan) dan `catatan_penolakan` (kalau ditolak Pengadaan/Gudang). Form **Kirim ke Gudang**: `useGudangOptions` untuk dropdown `tujuan_gudang_user_id`, input `no_tm_gudang`, `kuantum_total` → `useKirimGudang`. Disable bila `no_out` kosong.

- [ ] **Step 3: Route & nav** untuk role `operasi` → `/operasi/pengolahan`.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: sukses.

- [ ] **Step 5: Task selesai — lapor status hijau.**

---

### Task 11: Frontend — Pengadaan (keputusan OUT) & Gudang (terima/tolak)

**Files:**
- Modify: `frontend/src/hooks/useMo.ts` (tambah `usePutuskanOut`, `useTerimaMo`, `useTolakMo`)
- Create: `frontend/src/pages/PengadaanMoPage.tsx`
- Create: `frontend/src/pages/GudangMoPage.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/AppNav.tsx`

**Interfaces:**
- Produces hook: `usePutuskanOut()`, `useTerimaMo()`, `useTolakMo()`.

- [ ] **Step 1: Tambah mutation ke `useMo.ts`**

```ts
export function usePutuskanOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: { keputusan: 'diterima' | 'ditolak'; no_out?: string; catatan?: string } }) =>
      (await api.patch(`/mo/${id}/out`, body)).data.data as Mo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  });
}

export function useTerimaMo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tanggal }: { id: number; tanggal: string }) =>
      (await api.post(`/mo/${id}/terima`, { tanggal })).data.data as Mo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  });
}

export function useTolakMo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, catatan }: { id: number; catatan: string }) =>
      (await api.post(`/mo/${id}/tolak`, { catatan })).data.data as Mo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  });
}
```

- [ ] **Step 2: `PengadaanMoPage.tsx`**

`useMoList` difilter `current_stage === 'pengadaan'`. Kartu MO menampilkan **makloon + no_mo + no_tm** (persis kebutuhan user). Klik kartu → aksi: **Terima** (dialog input `no_out` → `usePutuskanOut` keputusan `diterima`) / **Tolak** (dialog input `catatan` → keputusan `ditolak`). Pakai `ConfirmDialog`. Halaman ini bisa jadi tab baru di `PengadaanPage` yang ada, atau halaman terpisah `/pengadaan/mo` — pilih terpisah agar tak mengubah alur PO.

- [ ] **Step 3: `GudangMoPage.tsx`**

`useMoList` difilter `current_stage === 'gudang'` (backend hanya mengizinkan terima/tolak bila user = gudang tujuan; UI juga bisa memfilter `tujuan_gudang_user_id === currentUser.id` untuk kebersihan tampilan, ambil user dari `useAuth`). Kartu menampilkan no_mo, no_out, no_tm_gudang, kuantum_total, makloon. Aksi: **Terima** (input `tanggal` → `useTerimaMo`) / **Tolak** (input `catatan` → `useTolakMo`).

- [ ] **Step 4: Route & nav** untuk role `pengadaan` (`/pengadaan/mo`) dan `gudang` (`/gudang`).

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: sukses.

- [ ] **Step 6: Task selesai — lapor status hijau.**

---

### Task 12: Frontend — field `nama_gudang` di Admin CRUD Users

**Files:**
- Modify: `frontend/src/pages/AdminUsersPage.tsx`
- Modify: `frontend/src/hooks/useAdminUsers.ts` (kalau ada tipe form user, tambah `nama_gudang`)

**Interfaces:**
- Consumes: role list dari `/api/admin/roles`.

- [ ] **Step 1: Tambah field kondisional**

Di form create/edit user `AdminUsersPage.tsx`: saat role terpilih = `gudang`, tampilkan input **Nama Gudang** (wajib), analog dengan field `nama_maklon` yang muncul saat role `makloon`. Sertakan `nama_gudang` di payload `POST/PATCH`. Cari blok yang menangani `nama_maklon` dan replikasikan untuk `nama_gudang`.

- [ ] **Step 2: Tampilkan di daftar user**

Kalau tabel user menampilkan kolom `nama_maklon`, tampilkan juga `nama_gudang` (atau satu kolom "Nama Mitra/Gudang" yang mengambil mana pun yang terisi).

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: sukses.

- [ ] **Step 4: Task selesai — lapor status hijau.**

---

### Task 13: Perbarui spec induk `SERGAB-panduan-pengembangan.md`

**Files:**
- Modify: `SERGAB-panduan-pengembangan.md`

- [ ] **Step 1: Sesuaikan bagian yang usang**

- Bagian 1: ganti paragraf "Operasi & Gudang bukan tahap timeline / modul mandiri" menjadi deskripsi **modul Pengolahan** (UB Jastasma → Operasi → Pengadaan → Operasi → Gudang), timeline transaksi berhenti di Keuangan.
- Bagian 4: hapus tabel `permintaan_operasi` & `data_gudang`; tambahkan `pengolahan`, `mo`, `mo_detail`, dan kolom `users.nama_gudang`.
- Bagian 5: ganti endpoint `/api/operasi*` & `/api/gudang*` dengan endpoint `/api/pengolahan*`, `/api/mo*`, `/api/gudang-options` (lihat §6 spec desain).
- Bagian 12: tandai asumsi #1 sebagai TERJAWAB 2026-07-20 dengan pemahaman baru (modul Pengolahan berbasis terima/tolak, bukan pengeluaran stok bebas).

- [ ] **Step 2: Task selesai — lapor status hijau.** (Dokumen; tak ada test.)

---

## Self-Review (diisi penulis plan)

**Spec coverage:** Teardown (§2 spec) → Task 1, 8. users.nama_gudang & opsi gudang (§3.5, §4) → Task 2. Model `pengolahan`/`mo`/`mo_detail` (§4) → Task 3, 4. Aturan bisnis rendemen/kuantum-IN/grouping/TM/gudang (§3) → Task 5, 6. Endpoint (§6) → Task 2, 7. State machine (§5) → Task 6, 7. Frontend (§7) → Task 9–12. Dampak spec induk (§8) → Task 13. Testing (§9) → Task 5, 6, 7. **Tidak ada gap.**

**Placeholder scan:** Backend penuh kode + test aktual. Frontend memberi kode hook lengkap + spesifikasi komponen konkret yang mereplikasi pola hidup yang ada (`TransaksiUbJastasmaPage`, `PengadaanPage`, `MakloonCombobox`, `ConfirmDialog`) — bukan "TBD".

**Type consistency:** Nama service/metode konsisten lintas task: `PengolahanService::{totalKuantumIn,buat,ajukanUlang,tolak}`, `MoService::{gabungkan,putuskanOut,kirimGudang,terimaGudang,tolakGudang}`. Kolom `current_stage` nilai `pengadaan|operasi|gudang|selesai` dipakai sama di service, controller, dan hook FE. Keputusan OUT memakai `diterima|ditolak` konsisten (controller `in:diterima,ditolak` ↔ service).
