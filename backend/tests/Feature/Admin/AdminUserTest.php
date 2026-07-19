<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUserTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->admin = $this->buatUser('admin');
    }

    public function test_admin_dapat_membuat_user_makloon(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/users', [
            'username' => 'makloon_baru',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'Makloon Lampung',
            'kecamatan' => 'Metro Pusat',
            'kabupaten' => 'Metro',
            'is_active' => true,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.username', 'makloon_baru');
        $response->assertJsonPath('data.nama_maklon', 'Makloon Lampung');
        $response->assertJsonMissingPath('data.password');

        $this->assertDatabaseHas('users', [
            'username' => 'makloon_baru',
            'nama_maklon' => 'Makloon Lampung',
            'is_active' => true,
        ]);
    }

    public function test_nama_maklon_wajib_untuk_role_makloon(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/users', [
            'username' => 'makloon_tanpa_nama',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors('nama_maklon');
    }

    public function test_admin_dapat_mengubah_user_dan_membersihkan_nama_maklon_jika_bukan_makloon(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('makloon', ['nama_maklon' => 'Makloon Lama']);

        $response = $this->patchJson("/api/admin/users/{$user->id}", [
            'username' => 'operator_pengadaan',
            'role_id' => Role::where('nama_role', 'pengadaan')->value('id'),
            'is_active' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.username', 'operator_pengadaan');
        $response->assertJsonPath('data.nama_maklon', null);
        $response->assertJsonPath('data.is_active', false);
    }

    public function test_edit_user_makloon_tidak_wajib_mengirim_ulang_nama_maklon(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('makloon', ['nama_maklon' => 'Makloon Tetap']);

        $response = $this->patchJson("/api/admin/users/{$user->id}", [
            'is_active' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.nama_maklon', 'Makloon Tetap');
        $response->assertJsonPath('data.is_active', false);
    }

    public function test_admin_dapat_reset_password_user(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('gudang');

        $response = $this->patchJson("/api/admin/users/{$user->id}/reset-password", [
            'password' => 'password-baru',
            'password_confirmation' => 'password-baru',
        ]);

        $response->assertNoContent();
        $this->assertTrue(Hash::check('password-baru', $user->fresh()->password));
    }

    public function test_admin_dapat_import_makloon_dari_csv(): void
    {
        Sanctum::actingAs($this->admin);

        $file = UploadedFile::fake()->createWithContent('makloon.csv', implode("\n", [
            'nama_maklon,kecamatan,kabupaten',
            'Mekar Jaya,Ambarawa,Pringsewu',
            'Sumber Tani,Gadingrejo,Pringsewu',
        ]));

        $response = $this->post('/api/admin/users/import-makloon', [
            'file' => $file,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.created', 2);
        $response->assertJsonPath('data.updated', 0);
        $response->assertJsonPath('data.default_password', 'password123');

        $this->assertDatabaseHas('users', [
            'username' => 'makloon_mekar_jaya',
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'Mekar Jaya',
            'kecamatan' => 'Ambarawa',
            'kabupaten' => 'Pringsewu',
            'is_active' => true,
        ]);
    }

    public function test_admin_dapat_import_makloon_dari_excel(): void
    {
        Sanctum::actingAs($this->admin);

        $file = UploadedFile::fake()->createWithContent('makloon.xlsx', $this->xlsxContent([
            ['nama_maklon', 'kecamatan', 'kabupaten'],
            ['Mekar Jaya', 'Ambarawa', 'Pringsewu'],
            ['Sumber Tani', 'Gadingrejo', 'Pringsewu'],
        ]));

        $response = $this->post('/api/admin/users/import-makloon', [
            'file' => $file,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.created', 2);
        $response->assertJsonPath('data.updated', 0);

        $this->assertDatabaseHas('users', [
            'username' => 'makloon_mekar_jaya',
            'nama_maklon' => 'Mekar Jaya',
            'kecamatan' => 'Ambarawa',
            'kabupaten' => 'Pringsewu',
            'is_active' => true,
        ]);
    }

    public function test_import_makloon_memperbarui_nama_yang_sudah_ada(): void
    {
        Sanctum::actingAs($this->admin);
        $existing = $this->buatUser('makloon', [
            'username' => 'makloon_mekar_jaya',
            'nama_maklon' => 'Mekar Jaya',
            'kecamatan' => 'Lama',
            'kabupaten' => 'Lama',
        ]);

        $file = UploadedFile::fake()->createWithContent('makloon.csv', implode("\n", [
            'nama_maklon;kecamatan;kabupaten',
            'Mekar Jaya;Ambarawa;Pringsewu',
        ]));

        $response = $this->post('/api/admin/users/import-makloon', [
            'file' => $file,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.created', 0);
        $response->assertJsonPath('data.updated', 1);

        $this->assertSame('Ambarawa', $existing->fresh()->kecamatan);
        $this->assertSame(1, User::where('nama_maklon', 'Mekar Jaya')->count());
    }

    public function test_admin_dapat_nonaktifkan_dan_hapus_user(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('operasi');

        $this->patchJson("/api/admin/users/{$user->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->deleteJson("/api/admin/users/{$user->id}")->assertNoContent();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }

    public function test_non_admin_tidak_dapat_mengakses_admin_users(): void
    {
        Sanctum::actingAs($this->buatUser('pengadaan'));

        $this->getJson('/api/admin/users')->assertForbidden();
    }

    private function buatUser(string $role, array $attributes = []): User
    {
        return User::create(array_merge([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret123'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ], $attributes));
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
  <sheets><sheet name="Makloon" sheetId="1" r:id="rId1"/></sheets>
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
