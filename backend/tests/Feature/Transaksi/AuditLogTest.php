<?php

namespace Tests\Feature\Transaksi;

use App\Models\AuditLog;
use App\Models\DataJemputPangan;
use App\Models\Role;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $jemputPangan;

    private User $makloon;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
        $this->admin = $this->buatUser('admin');
    }

    public function test_submit_dan_tolak_masuk_audit_log(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-AUD',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-07-09',
            'kuantum' => 100,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->stageService->tolak($transaksi->fresh(), $this->makloon, 'Foto kurang jelas');

        $this->assertDatabaseHas('audit_logs', [
            'transaksi_id' => $transaksi->id_transaksi,
            'user_id' => $this->jemputPangan->id,
            'aksi' => 'submit_stage',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'transaksi_id' => $transaksi->id_transaksi,
            'user_id' => $this->makloon->id,
            'aksi' => 'tolak',
        ]);

        $tolak = AuditLog::where('aksi', 'tolak')->firstOrFail();
        $this->assertSame('jemput_pangan', $tolak->detail['stage']);
        $this->assertSame('Foto kurang jelas', $tolak->detail['catatan']);
    }

    public function test_endpoint_audit_log_hanya_admin(): void
    {
        AuditLog::create([
            'user_id' => $this->admin->id,
            'aksi' => 'admin_user_create',
            'detail' => ['target_user_id' => $this->makloon->id],
        ]);

        Sanctum::actingAs($this->jemputPangan);
        $this->getJson('/api/admin/audit-logs')->assertForbidden();

        Sanctum::actingAs($this->admin);
        $response = $this->getJson('/api/admin/audit-logs');

        $response->assertOk();
        $response->assertJsonPath('data.0.aksi', 'admin_user_create');
        $response->assertJsonPath('data.0.username', $this->admin->username);
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }
}
