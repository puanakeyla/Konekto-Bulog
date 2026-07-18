#!/usr/bin/env bash
# Salin database konekto_bulog -> sergab_lampung (data lama tetap aman sebagai cadangan).
# Jalankan SETELAH Laragon / MySQL menyala. Dari Git Bash:
#   bash backend/rename-db-to-sergab.sh
set -euo pipefail

MYSQL_BIN="/c/laragon/bin/mysql/mysql-8.0.30-winx64/bin"
HOST=127.0.0.1
PORT=3306
USER=root
PASS=123
OLD=konekto_bulog
NEW=sergab_lampung

MYSQL="$MYSQL_BIN/mysql.exe -h$HOST -P$PORT -u$USER -p$PASS"
DUMP="$MYSQL_BIN/mysqldump.exe -h$HOST -P$PORT -u$USER -p$PASS"

echo ">> Membuat database $NEW (jika belum ada)..."
$MYSQL -e "CREATE DATABASE IF NOT EXISTS \`$NEW\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo ">> Menyalin struktur + data $OLD -> $NEW..."
$DUMP --routines --triggers --single-transaction "$OLD" | $MYSQL "$NEW"

echo ">> Selesai. Database $NEW siap. Database lama $OLD dibiarkan sebagai cadangan."
echo ">> (Opsional) hapus cadangan setelah yakin: $MYSQL -e \"DROP DATABASE \\\`$OLD\\\`;\""
