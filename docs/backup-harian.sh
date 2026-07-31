#!/bin/sh
# Backup harian SERGAB (spec Bagian 9): database + folder foto.
#
# Foto disimpan di disk lokal VPS, jadi tidak punya redundansi bawaan seperti object
# storage -- satu disk mati = seluruh bukti transaksi hilang. Selama masih disk lokal,
# script ini WAJIB jalan dan tujuannya HARUS di mesin/volume lain.
#
# Pasang di crontab root, tiap hari 02:00:
#   0 2 * * * /path/ke/backup-harian.sh >> /var/log/sergab-backup.log 2>&1
#
# Setelah pindah ke S3/Spaces, bagian rsync foto boleh dicabut -- object storage
# sudah mereplikasi sendiri; bagian mysqldump tetap perlu.
set -eu

APP_DIR="${APP_DIR:-/var/www/sergab/backend}"
TUJUAN="${BACKUP_DIR:-/mnt/backup/sergab}"   # idealnya mount/volume terpisah atau host lain
SIMPAN_HARI="${BACKUP_RETENTION_DAYS:-14}"
STAMP=$(date +%Y%m%d-%H%M)

# Kredensial dibaca dari .env aplikasi supaya tidak ada duplikasi password di dua tempat.
DB_DATABASE=$(grep -E '^DB_DATABASE=' "$APP_DIR/.env" | cut -d= -f2-)
DB_USERNAME=$(grep -E '^DB_USERNAME=' "$APP_DIR/.env" | cut -d= -f2-)
DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$APP_DIR/.env" | cut -d= -f2-)

mkdir -p "$TUJUAN/db" "$TUJUAN/foto"

# --single-transaction: snapshot konsisten tanpa mengunci tabel (InnoDB), jadi aman
# dijalankan selagi aplikasi melayani request.
MYSQL_PWD="$DB_PASSWORD" mysqldump --single-transaction --quick \
  -u "$DB_USERNAME" "$DB_DATABASE" | gzip > "$TUJUAN/db/$DB_DATABASE-$STAMP.sql.gz"

# Foto hanya bertambah & tidak pernah diubah isinya, jadi rsync inkremental murah.
# --delete sengaja TIDAK dipakai: foto terhapus di server tetap disimpan di backup.
rsync -a "$APP_DIR/storage/app/foto-transaksi/" "$TUJUAN/foto/"

find "$TUJUAN/db" -name '*.sql.gz' -mtime "+$SIMPAN_HARI" -delete

# Peringatan dini kehabisan disk -- foto tumbuh terus dan tidak ada yang memantau
# kapasitas secara otomatis (spec Bagian 6).
PAKAI=$(df --output=pcent "$APP_DIR" | tr -dc '0-9')
[ "$PAKAI" -ge 85 ] && echo "PERINGATAN: disk aplikasi terpakai ${PAKAI}% -- siapkan volume tambahan atau migrasi ke object storage."

echo "Backup selesai $STAMP (disk terpakai ${PAKAI}%)."
