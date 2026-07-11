<?php

namespace App\Services\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;

class TransaksiStages
{
    /**
     * Urutan tahap per skema. Tahap dengan 'model' null (pengadaan s/d gudang) beroperasi
     * di level PO (gabungan banyak transaksi), bukan satu baris per transaksi — jadi tidak
     * lewat TransaksiStageService::submitStage/terima/tolak generik, melainkan endpoint
     * khusus di PengadaanController yang memindahkan current_stage transaksi terkait secara manual.
     */
    public static function sequence(string $skema): array
    {
        $afterMakloon = [
            ['role' => 'ub_jastasma', 'model' => DataUbJastasma::class],
            ['role' => 'pengadaan', 'model' => null],
            ['role' => 'keuangan', 'model' => null],
            ['role' => 'operasi', 'model' => null],
            ['role' => 'gudang', 'model' => null],
        ];

        return match ($skema) {
            'TJP' => [
                ['role' => 'jemput_pangan', 'model' => DataJemputPangan::class],
                ['role' => 'makloon', 'model' => DataMakloonTjp::class],
                ...$afterMakloon,
            ],
            'MPP' => [
                ['role' => 'makloon', 'model' => DataMakloonMpp::class],
                ...$afterMakloon,
            ],
            default => [],
        };
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
