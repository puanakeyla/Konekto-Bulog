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

class AdminUserController extends Controller
{
    public function __construct(private AuditLogService $auditLog)
    {
    }

    public function index(Request $request)
    {
        $users = User::with('role')
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
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:2048'],
        ]);

        $rows = $this->readCsvRows($validated['file']->getRealPath());
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $created = 0;
        $updated = 0;
        $errors = [];
        $defaultPassword = 'password123';

        foreach ($rows as $row) {
            $namaMaklon = $this->csvValue($row['data'], ['nama_maklon', 'nama_makloon', 'nama maklon', 'nama makloon', 'nama']);
            $kecamatan = $this->csvValue($row['data'], ['kecamatan']);
            $kabupaten = $this->csvValue($row['data'], ['kabupaten']);
            $username = $this->csvValue($row['data'], ['username', 'user']);
            $password = $this->csvValue($row['data'], ['password', 'kata_sandi', 'kata sandi']) ?: $defaultPassword;

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

        $before = $user->only(['username', 'role_id', 'nama_maklon', 'kecamatan', 'kabupaten', 'is_active']);

        $user->update($validated);

        $this->auditLog->log($request->user(), 'admin_user_update', null, [
            'target_user_id' => $user->id,
            'before' => $before,
            'after' => $user->fresh()->only(['username', 'role_id', 'nama_maklon', 'kecamatan', 'kabupaten', 'is_active']),
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
        $detail = [
            'target_user_id' => $user->id,
            'username' => $user->username,
            'role_id' => $user->role_id,
        ];

        $this->auditLog->log($request->user(), 'admin_user_delete', null, $detail);

        $user->delete();

        return response()->noContent();
    }

    private function validateUser(Request $request, ?User $user = null): array
    {
        $roleId = $request->integer('role_id', $user?->role_id ?? 0);
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $namaMaklonRules = ['nullable', 'string', 'max:150'];

        if ($roleId === $makloonRoleId && ($user === null || $request->has('role_id') || $request->has('nama_maklon'))) {
            array_unshift($namaMaklonRules, 'required');
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
            'kecamatan' => ['nullable', 'string', 'max:100'],
            'kabupaten' => ['nullable', 'string', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function normalizeMakloonName(array $validated, ?User $user = null): array
    {
        $roleId = $validated['role_id'] ?? $user?->role_id;
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');

        if ($roleId !== $makloonRoleId) {
            $validated['nama_maklon'] = null;
        }

        return $validated;
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

        $headers = array_map(fn ($header) => $this->normalizeCsvHeader((string) $header), $headers);
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

    private function csvValue(array $row, array $keys): string
    {
        foreach ($keys as $key) {
            $normalized = $this->normalizeCsvHeader($key);
            if (array_key_exists($normalized, $row)) {
                return trim((string) $row[$normalized]);
            }
        }

        return '';
    }

    private function normalizeCsvHeader(string $header): string
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
