<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminUserResource;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
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

        $user->update($validated);

        return response()->json(['data' => new AdminUserResource($user->fresh('role'))]);
    }

    public function resetPassword(Request $request, User $user)
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user->update(['password' => $validated['password']]);

        return response()->noContent();
    }

    public function deactivate(User $user)
    {
        $user->update(['is_active' => false]);

        return response()->json(['data' => new AdminUserResource($user->fresh('role'))]);
    }

    public function destroy(User $user)
    {
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
