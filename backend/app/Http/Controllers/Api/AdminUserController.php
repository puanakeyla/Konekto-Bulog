<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminUserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use SimpleXMLElement;

class AdminUserController extends Controller
{
    public function __construct(private AuditLogService $auditLog)
    {
    }

    public function index(Request $request)
    {
        $users = User::with('role')
            ->where('is_active', true)
            ->orderBy('username')
            ->paginate($request->integer('per_page', 20));

        return AdminUserResource::collection($users);
    }

    public function roles()
    {
        return response()->json([
            'data' => Role::orderBy('nama_role')->get(),
        ]);
    }

    public function importMakloon(Request $request)
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx', 'max:2048'],
        ]);

        $rows = $this->readImportRows($validated['file']->getRealPath(), $validated['file']->getClientOriginalExtension());
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $created = 0;
        $updated = 0;
        $errors = [];
        $defaultPassword = 'password123';

        foreach ($rows as $row) {
            $namaMaklon = $this->importValue($row['data'], ['nama_maklon', 'nama_makloon', 'nama maklon', 'nama makloon', 'nama']);
            $kecamatan = $this->importValue($row['data'], ['kecamatan']);
            $kabupaten = $this->importValue($row['data'], ['kabupaten']);
            $username = $this->importValue($row['data'], ['username', 'user']);
            $password = $this->importValue($row['data'], ['password', 'kata_sandi', 'kata sandi']) ?: $defaultPassword;

            if ($namaMaklon === '') {
                $errors[] = ['baris' => $row['line'], 'pesan' => 'Nama makloon wajib diisi.'];
                continue;
            }

            if (strlen($password) < 8) {
                $errors[] = ['baris' => $row['line'], 'pesan' => 'Password minimal 8 karakter.'];
                continue;
            }

            $user = null;
            if ($username !== '') {
                $user = User::where('username', $username)->first();
                if ($user && (int) $user->role_id !== (int) $makloonRoleId) {
                    $errors[] = ['baris' => $row['line'], 'pesan' => "Username {$username} sudah dipakai role lain."];
                    continue;
                }
            } else {
                $user = User::where('role_id', $makloonRoleId)
                    ->where('nama_maklon', $namaMaklon)
                    ->first();
                $username = $user?->username ?? $this->uniqueMakloonUsername($namaMaklon);
            }

            $payload = [
                'username' => $username,
                'role_id' => $makloonRoleId,
                'nama_maklon' => $namaMaklon,
                'kecamatan' => $kecamatan ?: null,
                'kabupaten' => $kabupaten ?: null,
                'is_active' => true,
            ];

            if ($user) {
                $user->update($payload);
                $updated++;
            } else {
                User::create([...$payload, 'password' => $password]);
                $created++;
            }
        }

        $this->auditLog->log($request->user(), 'admin_makloon_import', null, [
            'created' => $created,
            'updated' => $updated,
            'errors' => count($errors),
        ]);

        return response()->json([
            'data' => [
                'created' => $created,
                'updated' => $updated,
                'errors' => $errors,
                'default_password' => $defaultPassword,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateUser($request);
        $validated = $this->normalizeMakloonName($validated);

        $user = User::create($validated)->load('role');

        $this->auditLog->log($request->user(), 'admin_user_create', null, [
            'target_user_id' => $user->id,
            'username' => $user->username,
            'role' => $user->role->nama_role,
        ]);

        return response()->json(['data' => new AdminUserResource($user)], 201);
    }

    public function show(User $user)
    {
        return response()->json(['data' => new AdminUserResource($user->load('role'))]);
    }

    public function update(Request $request, User $user)
    {
        $validated = $this->validateUser($request, $user);
        $validated = $this->normalizeMakloonName($validated, $user);

        if (! array_key_exists('password', $validated)) {
            unset($validated['password']);
        }

        $before = $user->only(['username', 'role_id', 'nama_maklon', 'nama_gudang', 'kecamatan', 'kabupaten', 'is_active']);

        $user->update($validated);

        $this->auditLog->log($request->user(), 'admin_user_update', null, [
            'target_user_id' => $user->id,
            'before' => $before,
            'after' => $user->fresh()->only(['username', 'role_id', 'nama_maklon', 'nama_gudang', 'kecamatan', 'kabupaten', 'is_active']),
            'password_changed' => array_key_exists('password', $validated),
        ]);

        return response()->json(['data' => new AdminUserResource($user->fresh('role'))]);
    }

    public function resetPassword(Request $request, User $user)
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user->update(['password' => $validated['password']]);

        $this->auditLog->log($request->user(), 'admin_user_reset_password', null, [
            'target_user_id' => $user->id,
            'username' => $user->username,
        ]);

        return response()->noContent();
    }

    public function deactivate(Request $request, User $user)
    {
        $user->update(['is_active' => false]);

        $this->auditLog->log($request->user(), 'admin_user_deactivate', null, [
            'target_user_id' => $user->id,
            'username' => $user->username,
        ]);

        return response()->json(['data' => new AdminUserResource($user->fresh('role'))]);
    }

    public function destroy(Request $request, User $user)
    {
        $before = $user->only(['username', 'role_id', 'nama_maklon', 'is_active']);

        $user->update(['is_active' => false]);

        $detail = [
            'target_user_id' => $user->id,
            'username' => $user->username,
            'role_id' => $user->role_id,
            'before' => $before,
            'after' => $user->fresh()->only(['username', 'role_id', 'nama_maklon', 'is_active']),
        ];

        $this->auditLog->log($request->user(), 'admin_user_deactivate', null, $detail);

        return response()->json([
            'data' => new AdminUserResource($user->fresh('role')),
            'message' => 'User dihapus dari daftar aktif. Riwayat transaksi tetap tersimpan.',
        ]);
    }

    private function validateUser(Request $request, ?User $user = null): array
    {
        $roleId = $request->integer('role_id', $user?->role_id ?? 0);
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');
        $namaMaklonRules = ['nullable', 'string', 'max:150'];
        $namaGudangRules = ['nullable', 'string', 'max:150'];

        if ($roleId === $makloonRoleId && ($user === null || $request->has('role_id') || $request->has('nama_maklon'))) {
            array_unshift($namaMaklonRules, 'required');
        }

        if ($roleId === $gudangRoleId && ($user === null || $request->has('role_id') || $request->has('nama_gudang'))) {
            array_unshift($namaGudangRules, 'required');
        }

        return $request->validate([
            'username' => [
                $user ? 'sometimes' : 'required',
                'string',
                'max:100',
                Rule::unique('users', 'username')->ignore($user?->id),
            ],
            'password' => [$user ? 'sometimes' : 'required', 'string', 'min:8', 'confirmed'],
            'role_id' => [$user ? 'sometimes' : 'required', 'integer', Rule::exists('roles', 'id')],
            'nama_maklon' => $namaMaklonRules,
            'nama_gudang' => $namaGudangRules,
            'kecamatan' => ['nullable', 'string', 'max:100'],
            'kabupaten' => ['nullable', 'string', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function normalizeMakloonName(array $validated, ?User $user = null): array
    {
        $roleId = $validated['role_id'] ?? $user?->role_id;
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        if ($roleId !== $makloonRoleId) {
            $validated['nama_maklon'] = null;
        }

        // Nama gudang hanya bermakna untuk akun ber-role gudang (paralel nama_maklon).
        if ($roleId !== $gudangRoleId) {
            $validated['nama_gudang'] = null;
        }

        return $validated;
    }

    private function readImportRows(string $path, string $extension): array
    {
        return Str::lower($extension) === 'xlsx'
            ? $this->readXlsxRows($path)
            : $this->readCsvRows($path);
    }

    private function readCsvRows(string $path): array
    {
        $handle = fopen($path, 'r');
        if (! $handle) {
            abort(422, 'File CSV tidak dapat dibaca.');
        }

        $firstLine = fgets($handle);
        if ($firstLine === false) {
            fclose($handle);
            abort(422, 'File CSV kosong.');
        }

        $delimiter = substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',';
        rewind($handle);

        $headers = fgetcsv($handle, 0, $delimiter);
        if (! $headers) {
            fclose($handle);
            abort(422, 'Header CSV tidak valid.');
        }

        $headers = array_map(fn ($header) => $this->normalizeImportHeader((string) $header), $headers);
        $rows = [];
        $line = 1;

        while (($values = fgetcsv($handle, 0, $delimiter)) !== false) {
            $line++;
            if (count(array_filter($values, fn ($value) => trim((string) $value) !== '')) === 0) {
                continue;
            }

            $data = [];
            foreach ($headers as $index => $header) {
                if ($header === '') {
                    continue;
                }
                $data[$header] = trim((string) ($values[$index] ?? ''));
            }

            $rows[] = ['line' => $line, 'data' => $data];
        }

        fclose($handle);

        if ($rows === []) {
            abort(422, 'CSV tidak berisi data makloon.');
        }

        return $rows;
    }

    private function readXlsxRows(string $path): array
    {
        $entries = $this->readZipEntries($path);
        $sheetPath = $this->firstWorksheetPath($entries);
        $sheetXml = $entries[$sheetPath] ?? null;
        if ($sheetXml === null) {
            abort(422, 'Sheet Excel tidak ditemukan.');
        }

        $sharedStrings = $this->readSharedStrings($entries);

        $sheet = simplexml_load_string($sheetXml);
        if (! $sheet instanceof SimpleXMLElement) {
            abort(422, 'Sheet Excel tidak valid.');
        }

        $matrix = [];
        foreach ($sheet->sheetData->row as $row) {
            $rowNumber = (int) ($row['r'] ?? 0);
            $cells = [];

            foreach ($row->c as $cell) {
                $reference = (string) ($cell['r'] ?? '');
                $column = $reference !== '' ? $this->excelColumnIndex($reference) : count($cells);
                $cells[$column] = $this->excelCellValue($cell, $sharedStrings);
            }

            if (count(array_filter($cells, fn ($value) => trim((string) $value) !== '')) === 0) {
                continue;
            }

            ksort($cells);
            $matrix[$rowNumber ?: count($matrix) + 1] = $cells;
        }

        if ($matrix === []) {
            abort(422, 'File Excel kosong.');
        }

        $headerLine = array_key_first($matrix);
        $headers = array_map(fn ($header) => $this->normalizeImportHeader((string) $header), $matrix[$headerLine]);
        if (count(array_filter($headers, fn ($header) => $header !== '')) === 0) {
            abort(422, 'Header Excel tidak valid.');
        }

        $rows = [];
        foreach ($matrix as $line => $values) {
            if ($line === $headerLine) {
                continue;
            }

            $data = [];
            foreach ($headers as $index => $header) {
                if ($header === '') {
                    continue;
                }
                $data[$header] = trim((string) ($values[$index] ?? ''));
            }

            $rows[] = ['line' => $line, 'data' => $data];
        }

        if ($rows === []) {
            abort(422, 'Excel tidak berisi data makloon.');
        }

        return $rows;
    }

    /**
     * @param  array<string, string>  $entries
     */
    private function firstWorksheetPath(array $entries): string
    {
        $workbookXml = $entries['xl/workbook.xml'] ?? null;
        $relsXml = $entries['xl/_rels/workbook.xml.rels'] ?? null;
        if ($workbookXml === null || $relsXml === null) {
            abort(422, 'Workbook Excel tidak valid.');
        }

        $workbook = simplexml_load_string($workbookXml);
        $rels = simplexml_load_string($relsXml);
        if (! $workbook instanceof SimpleXMLElement || ! $rels instanceof SimpleXMLElement) {
            abort(422, 'Workbook Excel tidak valid.');
        }

        $namespaces = $workbook->getNamespaces(true);
        $relationshipNamespace = $namespaces['r'] ?? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
        $firstSheet = $workbook->sheets->sheet[0] ?? null;
        $relationshipId = $firstSheet?->attributes($relationshipNamespace)['id'] ?? null;
        if ($relationshipId === null) {
            abort(422, 'Sheet Excel tidak ditemukan.');
        }

        foreach ($rels->Relationship as $relationship) {
            if ((string) $relationship['Id'] === (string) $relationshipId) {
                $target = ltrim((string) $relationship['Target'], '/');

                return Str::startsWith($target, 'xl/') ? $target : 'xl/'.$target;
            }
        }

        abort(422, 'Sheet Excel tidak ditemukan.');
    }

    /**
     * @param  array<string, string>  $entries
     * @return array<int, string>
     */
    private function readSharedStrings(array $entries): array
    {
        $xml = $entries['xl/sharedStrings.xml'] ?? null;
        if ($xml === null) {
            return [];
        }

        $sharedStrings = simplexml_load_string($xml);
        if (! $sharedStrings instanceof SimpleXMLElement) {
            return [];
        }

        $values = [];
        foreach ($sharedStrings->si as $stringItem) {
            $parts = [];
            if (isset($stringItem->t)) {
                $parts[] = (string) $stringItem->t;
            }
            foreach ($stringItem->r as $richText) {
                $parts[] = (string) $richText->t;
            }
            $values[] = implode('', $parts);
        }

        return $values;
    }

    /**
     * Minimal ZIP reader for XLSX files. Supports stored and deflated entries.
     *
     * @return array<string, string>
     */
    private function readZipEntries(string $path): array
    {
        $contents = file_get_contents($path);
        if ($contents === false) {
            abort(422, 'File Excel tidak dapat dibaca.');
        }

        $eocdOffset = strrpos($contents, "PK\x05\x06");
        if ($eocdOffset === false) {
            abort(422, 'File Excel tidak valid.');
        }

        $eocd = unpack('vdisk/vcentralDisk/ventriesDisk/ventries/VcentralSize/VcentralOffset/vcommentLength', substr($contents, $eocdOffset + 4, 18));
        if (! $eocd) {
            abort(422, 'File Excel tidak valid.');
        }

        $entries = [];
        $offset = (int) $eocd['centralOffset'];
        $end = $offset + (int) $eocd['centralSize'];

        while ($offset < $end && substr($contents, $offset, 4) === "PK\x01\x02") {
            $header = unpack(
                'vversionMade/vversionNeeded/vflags/vmethod/vmodTime/vmodDate/Vcrc/VcompressedSize/VuncompressedSize/vnameLength/vextraLength/vcommentLength/vdiskStart/vinternalAttrs/VexternalAttrs/VlocalOffset',
                substr($contents, $offset + 4, 42)
            );
            if (! $header) {
                abort(422, 'File Excel tidak valid.');
            }

            $nameLength = (int) $header['nameLength'];
            $extraLength = (int) $header['extraLength'];
            $commentLength = (int) $header['commentLength'];
            $name = substr($contents, $offset + 46, $nameLength);
            $localOffset = (int) $header['localOffset'];

            if (substr($contents, $localOffset, 4) !== "PK\x03\x04") {
                abort(422, 'File Excel tidak valid.');
            }

            $local = unpack('vversion/vflags/vmethod/vmodTime/vmodDate/Vcrc/VcompressedSize/VuncompressedSize/vnameLength/vextraLength', substr($contents, $localOffset + 4, 26));
            if (! $local) {
                abort(422, 'File Excel tidak valid.');
            }

            $dataOffset = $localOffset + 30 + (int) $local['nameLength'] + (int) $local['extraLength'];
            $data = substr($contents, $dataOffset, (int) $header['compressedSize']);
            $method = (int) $header['method'];

            if ($method === 8) {
                $data = gzinflate($data);
                if ($data === false) {
                    abort(422, 'File Excel tidak dapat diekstrak.');
                }
            } elseif ($method !== 0) {
                abort(422, 'Kompresi Excel tidak didukung.');
            }

            $entries[str_replace('\\', '/', $name)] = $data;
            $offset += 46 + $nameLength + $extraLength + $commentLength;
        }

        return $entries;
    }

    /**
     * @param  array<int, string>  $sharedStrings
     */
    private function excelCellValue(SimpleXMLElement $cell, array $sharedStrings): string
    {
        $type = (string) ($cell['t'] ?? '');

        if ($type === 's') {
            return $sharedStrings[(int) $cell->v] ?? '';
        }

        if ($type === 'inlineStr') {
            return (string) ($cell->is->t ?? '');
        }

        return (string) ($cell->v ?? '');
    }

    private function excelColumnIndex(string $reference): int
    {
        preg_match('/^[A-Z]+/i', $reference, $matches);
        $letters = Str::upper($matches[0] ?? 'A');
        $index = 0;

        foreach (str_split($letters) as $letter) {
            $index = ($index * 26) + (ord($letter) - 64);
        }

        return $index - 1;
    }

    private function importValue(array $row, array $keys): string
    {
        foreach ($keys as $key) {
            $normalized = $this->normalizeImportHeader($key);
            if (array_key_exists($normalized, $row)) {
                return trim((string) $row[$normalized]);
            }
        }

        return '';
    }

    private function normalizeImportHeader(string $header): string
    {
        $header = preg_replace('/^\xEF\xBB\xBF/', '', $header) ?? $header;
        $header = Str::lower(trim($header));

        return str_replace(['-', '_'], ' ', $header);
    }

    private function uniqueMakloonUsername(string $namaMaklon): string
    {
        $slug = Str::slug($namaMaklon, '_') ?: 'makloon';
        $base = Str::limit('makloon_'.$slug, 90, '');
        $username = $base;
        $suffix = 2;

        while (User::where('username', $username)->exists()) {
            $username = Str::limit($base, 95 - strlen((string) $suffix), '').'_'.$suffix;
            $suffix++;
        }

        return $username;
    }
}
