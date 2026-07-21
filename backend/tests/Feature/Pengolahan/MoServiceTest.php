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

    public function test_mo_ditolak_pengadaan_bisa_dikirim_ulang_ke_pengadaan(): void
    {
        $p = $this->pengolahan($this->makloon1, 'LHPK-6', 400);
        $mo = $this->service->gabungkan([$p->id], 'MO-6', 'TM-6', $this->operasi);
        $mo = $this->service->putuskanOut($mo, 'ditolak', null, 'No TM salah', $this->pengadaan);
        $this->assertSame('operasi', $mo->current_stage);

        $mo = $this->service->kirimUlangPengadaan($mo, $this->operasi);
        $this->assertSame('pengadaan', $mo->current_stage);
        $this->assertNull($mo->catatan_penolakan);

        // Pengadaan bisa memutuskan lagi.
        $mo = $this->service->putuskanOut($mo, 'diterima', 'OUT-6', null, $this->pengadaan);
        $this->assertSame('OUT-6', $mo->no_out);
    }

    public function test_kirim_ulang_pengadaan_ditolak_bila_sudah_ada_no_out(): void
    {
        $p = $this->pengolahan($this->makloon1, 'LHPK-5', 400);
        $mo = $this->service->gabungkan([$p->id], 'MO-5', 'TM-5', $this->operasi);
        $mo = $this->service->putuskanOut($mo, 'diterima', 'OUT-5', null, $this->pengadaan); // no_out terisi, stage operasi

        $this->expectException(HttpException::class);
        $this->service->kirimUlangPengadaan($mo, $this->operasi);
    }
}
