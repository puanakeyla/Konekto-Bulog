<?php

namespace App\Models;

use App\Services\Transaksi\TransaksiStages;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Transaksi extends Model
{
    protected $table = 'transaksi';
    protected $primaryKey = 'id_transaksi';
    protected $keyType = 'string';
    public $incrementing = false;

    public function getRouteKeyName(): string
    {
        return 'id_transaksi';
    }

    /**
     * FK `cascadeOnDelete()` menghapus baris tahap di level MySQL, sehingga event Eloquent
     * mereka TIDAK pernah jalan -- padahal di situlah medialibrary membersihkan berkas foto
     * (InteractsWithMedia::bootInteractsWithMedia). Tanpa hook ini, tiap transaksi yang
     * dihapus admin meninggalkan baris `media` yatim beserta file fisiknya di disk selamanya.
     * Dihapus lewat Eloquent lebih dulu supaya cascade tidak kebagian apa-apa.
     */
    protected static function booted(): void
    {
        static::deleting(function (self $transaksi) {
            foreach (['dataJemputPangan', 'dataMakloonMpp', 'dataMakloonTjp', 'dataUbJastasma'] as $relasi) {
                $transaksi->{$relasi}?->delete();
            }
        });
    }

    public function resolveRouteBinding($value, $field = null)
    {
        if (! preg_match('#^\d{5}/\d{2}/\d{4}/(TJP|MPP)$#', (string) $value)) {
            abort(404);
        }

        return $this->where('id_transaksi', $value)->firstOrFail();
    }

    protected $fillable = [
        'id_transaksi',
        'skema',
        'current_stage',
        'status_keseluruhan',
        'created_by',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function dataJemputPangan(): HasOne
    {
        return $this->hasOne(DataJemputPangan::class, 'transaksi_id', 'id_transaksi');
    }

    public function dataMakloonMpp(): HasOne
    {
        return $this->hasOne(DataMakloonMpp::class, 'transaksi_id', 'id_transaksi');
    }

    public function dataMakloonTjp(): HasOne
    {
        return $this->hasOne(DataMakloonTjp::class, 'transaksi_id', 'id_transaksi');
    }

    public function dataUbJastasma(): HasOne
    {
        return $this->hasOne(DataUbJastasma::class, 'transaksi_id', 'id_transaksi');
    }

    public function poDetail(): HasMany
    {
        return $this->hasMany(PoDetail::class, 'transaksi_id', 'id_transaksi');
    }

    public function riwayatPenolakan(): HasMany
    {
        return $this->hasMany(RiwayatPenolakan::class, 'transaksi_id', 'id_transaksi');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class, 'transaksi_id', 'id_transaksi');
    }

    /**
     * Antrean kerja milik satu role: transaksi yang berjalan DAN sedang berada di salah satu
     * tahap yang dipegang role tersebut.
     *
     * Sengaja satu tempat, karena definisi ini dipakai dua pemanggil yang harus sepakat:
     * daftar transaksi (TransaksiController::index) dan hitungan chip/kartu dashboard
     * (DashboardController::ringkasan). Kalau keduanya menyalin filter masing-masing, angka
     * ringkasan bisa menyimpang dari isi tabel tanpa ada yang menyadarinya.
     */
    public function scopeAntreanRole(Builder $query, string $role): Builder
    {
        $stageRoles = collect(['TJP', 'MPP'])
            ->flatMap(fn (string $skema) => TransaksiStages::sequence($skema))
            ->filter(fn (array $stage) => TransaksiStages::actorRole($stage) === $role)
            ->pluck('role')
            ->unique()
            ->values()
            ->all();

        return $query
            ->whereIn('transaksi.current_stage', $stageRoles ?: [$role])
            ->where('transaksi.status_keseluruhan', 'berjalan');
    }

    /**
     * Batasi hasil ke transaksi yang BOLEH DILIHAT peminta.
     *
     * Hanya Makloon yang dibatasi: mitra makloon adalah perusahaan yang berdiri sendiri, jadi
     * data satu makloon rahasia bagi makloon lain. Role internal BULOG (Jemput Pangan, UB
     * Jastasma, Pengadaan, Keuangan, Admin) tetap melihat seluruh transaksi -- pembatasan
     * Bagian 3.3 untuk mereka bersifat per-field, bukan per-baris.
     *
     * Wajib dipasang di SETIAP query yang mengembalikan daftar transaksi, termasuk yang hanya
     * menghitung: kalau daftar disaring tapi hitungannya tidak, angka kartu/chip membocorkan
     * keberadaan transaksi makloon lain walau barisnya tidak tampil.
     */
    public function scopeTerlihatOleh(Builder $query, User $user): Builder
    {
        if ($user->role?->nama_role !== 'makloon') {
            return $query;
        }

        return $query->where(function (Builder $q) use ($user) {
            // MPP dibuat sendiri oleh makloon; TJP ditunjuk Jemput Pangan lewat makloon_user_id.
            $q->where(fn (Builder $t) => $t->where('transaksi.skema', 'MPP')
                ->where('transaksi.created_by', $user->id))
                ->orWhere(fn (Builder $t) => $t->where('transaksi.skema', 'TJP')
                    ->whereHas('dataJemputPangan', fn (Builder $jp) => $jp->where('makloon_user_id', $user->id)));
        });
    }

    /**
     * Versi satu-baris dari scopeTerlihatOleh(), untuk endpoint yang menerima satu transaksi.
     * Tanpa ini id_transaksi yang berpola urut (00006/07/2026/TJP) bisa ditebak satu per satu.
     */
    public function bolehDilihatOleh(User $user): bool
    {
        return $user->role?->nama_role !== 'makloon' || $this->dimilikiOleh($user);
    }

    /**
     * Transaksi ini ditangani oleh user tersebut? Dipakai saat user non-admin dibukakan
     * akses edit rekap: dia hanya boleh menyentuh transaksinya sendiri, bukan seluruh
     * baris role-nya (rekap difilter per role, bukan per user).
     *
     * Kepemilikan hanya terekam untuk dua role: Jemput Pangan lewat `created_by`, dan
     * Makloon lewat creator (MPP dibuat makloon sendiri) atau tunjukan JP (TJP). Role
     * lain (UB Jastasma, Pengadaan, Keuangan) tidak punya kolom pemilik -- datanya
     * memang milik bersama/level PO -- jadi pembatasnya tinggal scope field di
     * TransaksiController::SCOPE_EDIT_REKAP.
     */
    public function dimilikiOleh(User $user): bool
    {
        $this->loadMissing('dataJemputPangan');

        return match ($user->role?->nama_role) {
            'jemput_pangan' => (int) $this->created_by === (int) $user->id,
            'makloon' => $this->skema === 'MPP'
                ? (int) $this->created_by === (int) $user->id
                : (int) $this->dataJemputPangan?->makloon_user_id === (int) $user->id,
            default => true,
        };
    }
}
