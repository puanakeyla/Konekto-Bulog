<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminUserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
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
}
