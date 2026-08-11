<?php

namespace Tests\Feature\Pemeliharaan;

use App\Models\AuditLog;
use App\Models\Notifikasi;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PerawatanTerjadwalTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        $this->seed(RoleSeeder::class);

        return User::factory()->create(['role_id' => Role::where('nama_role', 'admin')->value('id')]);
    }

    private function auditLog(int $umurHari): AuditLog
    {
        $log = AuditLog::create(['aksi' => 'uji_retensi']);
        AuditLog::where('id', $log->id)->update(['created_at' => now()->subDays($umurHari)]);

        return $log;
    }

    private function notifikasi(User $user, int $umurHari): Notifikasi
    {
        $notif = Notifikasi::create([
            'user_id' => $user->id,
            'tipe' => 'dikirim',
            'judul' => 'Uji',
            'pesan' => 'Uji retensi',
        ]);
        Notifikasi::where('id', $notif->id)->update(['created_at' => now()->subDays($umurHari)]);

        return $notif;
    }

    private function pangkas(): void
    {
        $this->artisan('model:prune', ['--model' => [AuditLog::class, Notifikasi::class]])->assertSuccessful();
    }

    public function test_baris_lampau_dipangkas_dan_yang_masih_muda_dibiarkan(): void
    {
        $user = $this->user();
        config(['pemeliharaan.retensi.audit_log_hari' => 730, 'pemeliharaan.retensi.notifikasi_hari' => 90]);

        $auditLama = $this->auditLog(800);
        $auditMuda = $this->auditLog(700);
        $notifLama = $this->notifikasi($user, 120);
        $notifMuda = $this->notifikasi($user, 30);

        $this->pangkas();

        $this->assertDatabaseMissing('audit_logs', ['id' => $auditLama->id]);
        $this->assertDatabaseHas('audit_logs', ['id' => $auditMuda->id]);
        $this->assertDatabaseMissing('notifikasi', ['id' => $notifLama->id]);
        $this->assertDatabaseHas('notifikasi', ['id' => $notifMuda->id]);
    }

    /**
     * Katup pengaman. Retensi 0 harus berarti "jangan pangkas", BUKAN `subDays(0)` yang justru
     * berarti "buang semuanya sampai detik ini" -- salah tafsir yang menghapus seluruh jejak
     * audit dalam sekali jalan tanpa bisa dibatalkan.
     */
    public function test_retensi_nol_mematikan_pemangkasan(): void
    {
        $user = $this->user();
        config(['pemeliharaan.retensi.audit_log_hari' => 0, 'pemeliharaan.retensi.notifikasi_hari' => 0]);

        $audit = $this->auditLog(5000);
        $notif = $this->notifikasi($user, 5000);

        $this->pangkas();

        $this->assertDatabaseHas('audit_logs', ['id' => $audit->id]);
        $this->assertDatabaseHas('notifikasi', ['id' => $notif->id]);
    }

    /**
     * Backup menolak driver selain MySQL. Tanpa penjagaan ini, penjadwal di lingkungan
     * non-MySQL akan "berhasil" tiap malam sambil tidak pernah menghasilkan arsip apa pun.
     */
    public function test_backup_menolak_driver_selain_mysql(): void
    {
        // Suite ini berjalan di sqlite (.env.testing), jadi kondisinya sudah terpenuhi apa adanya.
        $this->artisan('backup:db')->assertFailed();
    }

    public function test_health_check_menjawab_ok_saat_database_hidup(): void
    {
        $this->get('/up')->assertOk();
    }
}
