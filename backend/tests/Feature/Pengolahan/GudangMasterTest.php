<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Gudang;
use App\Models\PengolahanGudang;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * Gudang A/B/C/D adalah data master, bukan akun user. Menggantikan GudangOptionTest &
 * AdminGudangUserTest lama yang menguji pola "satu username per gudang".
 */
class GudangMasterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function user(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret12'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    public function test_admin_bisa_menambah_gudang(): void
    {
        $this->actingAs($this->user('admin'))
            ->postJson('/api/admin/gudang', ['kode' => 'ADA08001', 'nama' => 'Gudang A'])
            ->assertStatus(201)
            ->assertJsonPath('data.kode', 'ADA08001');

        $this->assertDatabaseHas('gudang', ['kode' => 'ADA08001', 'aktif' => true]);
    }

    public function test_kode_gudang_tidak_boleh_duplikat(): void
    {
        Gudang::create(['kode' => 'ADA08001', 'nama' => 'Gudang A']);

        $this->actingAs($this->user('admin'))
            ->postJson('/api/admin/gudang', ['kode' => 'ADA08001', 'nama' => 'Gudang A Lagi'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('kode');
    }

    public function test_non_admin_tidak_bisa_mengelola_gudang(): void
    {
        $this->actingAs($this->user('gudang'))
            ->postJson('/api/admin/gudang', ['kode' => 'X1', 'nama' => 'Gudang X'])
            ->assertForbidden();
    }

    public function test_gudang_belum_dipakai_boleh_dihapus(): void
    {
        $gudang = Gudang::create(['kode' => 'B1', 'nama' => 'Gudang B']);

        $this->actingAs($this->user('admin'))
            ->deleteJson("/api/admin/gudang/{$gudang->id}")
            ->assertOk();

        $this->assertDatabaseMissing('gudang', ['id' => $gudang->id]);
    }

    /**
     * Inti aturannya: menghapus gudang yang sudah dipakai akan membuat baris pengolahan lama
     * kehilangan identitas gudangnya, jadi ditolak dan admin diarahkan menonaktifkan.
     */
    public function test_gudang_yang_sudah_dipakai_tidak_bisa_dihapus(): void
    {
        $gudang = Gudang::create(['kode' => 'C1', 'nama' => 'Gudang C']);
        $makloon = $this->user('makloon');

        $transaksi = TransaksiPengolahan::create([
            'id_pengolahan' => '00001/08/2026/GDG',
            'skema' => 'GDG',
            'makloon_user_id' => $makloon->id,
            'current_stage' => 'gudang',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $makloon->id,
        ]);

        PengolahanGudang::create([
            'transaksi_pengolahan_id' => $transaksi->id_pengolahan,
            'gudang_id' => $gudang->id,
            'status' => 'draft',
        ]);

        $this->actingAs($this->user('admin'))
            ->deleteJson("/api/admin/gudang/{$gudang->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('gudang', ['id' => $gudang->id]);
    }

    public function test_admin_dapat_import_gudang_dari_csv(): void
    {
        $file = UploadedFile::fake()->createWithContent('gudang.csv', implode("\n", [
            'kode,nama,aktif',
            'ADA08001,Gudang A,aktif',
            'ADA08002,Gudang B,nonaktif',
            ',Tanpa Kode,aktif',
        ]));

        $this->actingAs($this->user('admin'))
            ->post('/api/admin/gudang/import', ['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.created', 2)
            ->assertJsonPath('data.updated', 0)
            ->assertJsonCount(1, 'data.errors');

        $this->assertDatabaseHas('gudang', ['kode' => 'ADA08001', 'nama' => 'Gudang A', 'aktif' => true]);
        $this->assertDatabaseHas('gudang', ['kode' => 'ADA08002', 'nama' => 'Gudang B', 'aktif' => false]);
    }

    public function test_admin_dapat_import_gudang_dari_excel(): void
    {
        Gudang::create(['kode' => 'ADA08001', 'nama' => 'Gudang Lama']);

        $file = UploadedFile::fake()->createWithContent('gudang.xlsx', $this->xlsxContent([
            ['kode', 'nama', 'aktif'],
            ['ADA08001', 'Gudang A Baru', 'aktif'],
            ['ADA08003', 'Gudang C', 'ya'],
        ]));

        $this->actingAs($this->user('admin'))
            ->post('/api/admin/gudang/import', ['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.created', 1)
            ->assertJsonPath('data.updated', 1);

        $this->assertDatabaseHas('gudang', ['kode' => 'ADA08001', 'nama' => 'Gudang A Baru']);
        $this->assertDatabaseHas('gudang', ['kode' => 'ADA08003', 'nama' => 'Gudang C', 'aktif' => true]);
    }

    public function test_opsi_gudang_hanya_yang_aktif(): void
    {
        Gudang::create(['kode' => 'A1', 'nama' => 'Gudang Aktif']);
        Gudang::create(['kode' => 'A2', 'nama' => 'Gudang Nonaktif', 'aktif' => false]);

        $this->actingAs($this->user('operasi'))
            ->getJson('/api/gudang-options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.nama', 'Gudang Aktif');
    }

    private function xlsxContent(array $rows): string
    {
        return $this->zipContent([
            '[Content_Types].xml' => <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>
XML,
            '_rels/.rels' => <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
XML,
            'xl/workbook.xml' => <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Gudang" sheetId="1" r:id="rId1"/></sheets>
</workbook>
XML,
            'xl/_rels/workbook.xml.rels' => <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>
XML,
            'xl/worksheets/sheet1.xml' => $this->worksheetXml($rows),
        ]);
    }

    private function zipContent(array $entries): string
    {
        $fileData = '';
        $centralDirectory = '';

        foreach ($entries as $name => $content) {
            $localOffset = strlen($fileData);
            $crc = crc32($content);
            $size = strlen($content);
            $nameLength = strlen($name);

            $fileData .= pack('VvvvvvVVVvv', 0x04034b50, 20, 0, 0, 0, 0, $crc, $size, $size, $nameLength, 0);
            $fileData .= $name.$content;

            $centralDirectory .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0, 0, 0, 0, $crc, $size, $size, $nameLength, 0, 0, 0, 0, 0, $localOffset);
            $centralDirectory .= $name;
        }

        return $fileData
            .$centralDirectory
            .pack('VvvvvVVv', 0x06054b50, 0, 0, count($entries), count($entries), strlen($centralDirectory), strlen($fileData), 0);
    }

    private function worksheetXml(array $rows): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        $xml .= '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';

        foreach ($rows as $rowIndex => $row) {
            $line = $rowIndex + 1;
            $xml .= '<row r="'.$line.'">';
            foreach ($row as $columnIndex => $value) {
                $cell = chr(65 + $columnIndex).$line;
                $xml .= '<c r="'.$cell.'" t="inlineStr"><is><t>'.htmlspecialchars($value, ENT_XML1).'</t></is></c>';
            }
            $xml .= '</row>';
        }

        return $xml.'</sheetData></worksheet>';
    }
}
