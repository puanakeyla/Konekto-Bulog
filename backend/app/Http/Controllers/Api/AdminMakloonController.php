<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminUserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminMakloonController extends Controller
{
    public function __construct(private AuditLogService $auditLog)
    {
    }

    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));

        $makloon = User::with('role')
            ->where('role_id', $this->makloonRoleId())
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('username', 'like', "%{$search}%")
                        ->orWhere('nama_maklon', 'like', "%{$search}%")
                        ->orWhere('kecamatan', 'like', "%{$search}%")
                        ->orWhere('kabupaten', 'like', "%{$search}%");
                });
            })
            ->orderBy('kabupaten')
            ->orderBy('nama_maklon')
            ->paginate($request->integer('per_page', 20));

        return AdminUserResource::collection($makloon);
    }

    public function store(Request $request)
    {
        $validated = $this->validateMakloon($request);
        $user = User::create([
            ...$validated,
            'role_id' => $this->makloonRoleId(),
            'is_active' => $validated['is_active'] ?? true,
        ])->load('role');

        $this->auditLog->log($request->user(), 'admin_makloon_create', null, [
            'target_user_id' => $user->id,
            'username' => $user->username,
            'nama_maklon' => $user->nama_maklon,
        ]);

        return response()->json(['data' => new AdminUserResource($user)], 201);
    }

    public function show(User $makloon)
    {
        $this->ensureMakloon($makloon);

        return response()->json(['data' => new AdminUserResource($makloon->load('role'))]);
    }

    public function update(Request $request, User $makloon)
    {
        $this->ensureMakloon($makloon);

        $validated = $this->validateMakloon($request, $makloon);
        if (! array_key_exists('password', $validated)) {
            unset($validated['password']);
        }

        $before = $makloon->only(['username', 'nama_maklon', 'kecamatan', 'kabupaten', 'is_active']);
        $makloon->update($validated);

        $this->auditLog->log($request->user(), 'admin_makloon_update', null, [
            'target_user_id' => $makloon->id,
            'before' => $before,
            'after' => $makloon->fresh()->only(['username', 'nama_maklon', 'kecamatan', 'kabupaten', 'is_active']),
            'password_changed' => array_key_exists('password', $validated),
        ]);

        return response()->json(['data' => new AdminUserResource($makloon->fresh('role'))]);
    }

    public function destroy(Request $request, User $makloon)
    {
        $this->ensureMakloon($makloon);

        $detail = [
            'target_user_id' => $makloon->id,
            'username' => $makloon->username,
            'nama_maklon' => $makloon->nama_maklon,
        ];

        $this->auditLog->log($request->user(), 'admin_makloon_delete', null, $detail);
        $makloon->delete();

        return response()->noContent();
    }

    private function validateMakloon(Request $request, ?User $makloon = null): array
    {
        return $request->validate([
            'username' => [
                $makloon ? 'sometimes' : 'required',
                'string',
                'max:100',
                Rule::unique('users', 'username')->ignore($makloon?->id),
            ],
            'password' => [$makloon ? 'sometimes' : 'required', 'string', 'min:8', 'confirmed'],
            'nama_maklon' => [$makloon ? 'sometimes' : 'required', 'string', 'max:150'],
            'kecamatan' => ['nullable', 'string', 'max:100'],
            'kabupaten' => ['nullable', 'string', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function ensureMakloon(User $user): void
    {
        abort_unless((int) $user->role_id === (int) $this->makloonRoleId(), 404);
    }

    private function makloonRoleId(): int
    {
        return (int) Role::where('nama_role', 'makloon')->value('id');
    }
}
