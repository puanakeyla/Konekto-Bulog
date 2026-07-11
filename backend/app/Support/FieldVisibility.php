<?php

namespace App\Support;

class FieldVisibility
{
    /**
     * Bagian 3.3: kuantum & foto surat jalan milik Jemput Pangan tidak boleh terlihat oleh
     * UB Jastasma, Pengadaan, Keuangan, Operasi, Gudang. Admin bypass semua pembatasan (Bagian 3.5).
     */
    public static function bolehLihatDataSensitifJp(?string $role): bool
    {
        return in_array($role, ['jemput_pangan', 'makloon', 'admin'], true);
    }
}
