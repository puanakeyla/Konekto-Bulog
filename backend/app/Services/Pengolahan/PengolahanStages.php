<?php

namespace App\Services\Pengolahan;

use App\Models\PengolahanGudang;
use App\Models\PengolahanLhpk;

/**
 * Urutan tahap per skema pengolahan. Dua skema memuat role yang sama persis; bedanya cuma
 * siapa yang mengisi lebih dulu.
 *
 * Tahap `operasi` & `pengadaan` bermodel null karena bekerja di level MO (gabungan banyak
 * transaksi), bukan satu baris per transaksi -- alasan yang sama dengan pengadaan & keuangan
 * di TransaksiStages. Keduanya tidak lewat PengolahanStageService::submitStage generik,
 * melainkan MoGroupingService/MoReviewService yang memindahkan current_stage secara manual.
 */
class PengolahanStages
{
    public const SKEMA = ['GDG', 'UBJ'];

    /** Role yang memulai tiap skema -- dipakai untuk menentukan siapa boleh membuat transaksi. */
    public const PEMBUAT = ['GDG' => 'gudang', 'UBJ' => 'ub_jastasma'];

    public static function sequence(string $skema): array
    {
        $penutup = [
            ['role' => 'operasi', 'model' => null],
            ['role' => 'pengadaan', 'model' => null],
        ];

        return match ($skema) {
            'GDG' => [
                ['role' => 'gudang', 'model' => PengolahanGudang::class],
                ['role' => 'ub_jastasma', 'model' => PengolahanLhpk::class],
                ...$penutup,
            ],
            'UBJ' => [
                ['role' => 'ub_jastasma', 'model' => PengolahanLhpk::class],
                ['role' => 'gudang', 'model' => PengolahanGudang::class],
                ...$penutup,
            ],
            default => [],
        };
    }

    public static function label(array $stage): string
    {
        return match ($stage['role']) {
            'ub_jastasma' => 'UB Jastasma',
            default => str($stage['role'])->replace('_', ' ')->title()->toString(),
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

    /** Tahap terakhir yang punya model data -- yang direview Operasi sebelum digabung ke MO. */
    public static function tahapDataTerakhir(string $skema): array
    {
        return self::sequence($skema)[1];
    }
}
