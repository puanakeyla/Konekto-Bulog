<?php

namespace App\Services\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;

class TransaksiStages
{
    /**
     * Urutan tahap per skema. Timeline transaksi berhenti di Keuangan (TJP 5 tahap, MPP 5 tahap);
     * Operasi & Gudang bukan tahap timeline lagi — keduanya bagian dari modul Pengolahan terpisah.
     * Tahap dengan 'model' null (pengadaan & keuangan) beroperasi di level PO (gabungan banyak
     * transaksi), bukan satu baris per transaksi — jadi tidak lewat TransaksiStageService::
     * submitStage/terima/tolak generik, melainkan endpoint khusus di PengadaanController yang
     * memindahkan current_stage transaksi terkait secara manual.
     */
    public static function sequence(string $skema): array
    {
        $afterMakloon = [
            ['role' => 'ub_jastasma', 'model' => DataUbJastasma::class],
            ['role' => 'pengadaan', 'model' => null],
            ['role' => 'keuangan', 'model' => null],
        ];

        return match ($skema) {
            'TJP' => [
                ['role' => 'jemput_pangan', 'model' => DataJemputPangan::class],
                ['role' => 'makloon', 'model' => DataMakloonTjp::class],
                ...$afterMakloon,
            ],
            'MPP' => [
                ['role' => 'makloon_kirim', 'model' => DataMakloonMpp::class, 'actor_role' => 'makloon', 'label' => 'Makloon Kirim'],
                ['role' => 'makloon_terima', 'model' => null, 'actor_role' => 'makloon', 'label' => 'Makloon Terima'],
                ...$afterMakloon,
            ],
            default => [],
        };
    }

    public static function actorRole(array $stage): string
    {
        return $stage['actor_role'] ?? $stage['role'];
    }

    public static function label(array $stage): string
    {
        return $stage['label'] ?? str($stage['role'])->replace('_', ' ')->title()->toString();
    }

    public static function indexOfRole(string $skema, string $role): ?int
    {
        foreach (self::sequence($skema) as $i => $stage) {
            if ($stage['role'] === $role) {
                return $i;
            }
        }

        return null;
    }

    public static function stageAt(string $skema, int $index): ?array
    {
        return self::sequence($skema)[$index] ?? null;
    }
}
