<?php

namespace Tests\Feature\Pengolahan;

use App\Models\DataPengadaan;
use App\Models\Pengolahan;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
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
    private int $seq = 0;

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
        // po_detail.transaksi_id ber-FK ke transaksi, jadi butuh baris transaksi asli.
        $transaksi = Transaksi::create([
            'id_transaksi' => sprintf('%05d/07/2026/MPP', ++$this->seq),
            'skema' => 'MPP', 'current_stage' => 'keuangan', 'status_keseluruhan' => 'berjalan',
            'created_by' => $makloonId,
        ]);

        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-07-10', 'id_pemasok' => 'P1', 'makloon_user_id' => $makloonId,
            'total_kuantum' => $kuantum, 'harga' => 6500, 'total_harga' => $kuantum * 6500,
            'no_po' => 'PO-'.uniqid(), 'status' => 'lengkap',
        ]);
        PoDetail::create(['data_pengadaan_id' => $po->id, 'transaksi_id' => $transaksi->id_transaksi, 'kuantum_kontribusi' => $kuantum, 'no_in' => $noIn]);
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
