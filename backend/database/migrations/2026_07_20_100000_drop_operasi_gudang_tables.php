<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('data_gudang');
        Schema::dropIfExists('permintaan_operasi');
        Schema::dropIfExists('data_operasi');
    }

    public function down(): void
    {
        // Tabel lama sengaja tidak dibangun ulang; skema pengolahan menggantikannya.
    }
};
