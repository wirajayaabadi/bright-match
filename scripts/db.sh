#!/usr/bin/env bash
# Pasang skema dan muat data Bright Match ke Supabase (atau Postgres mana pun).
#
#   npm run db:schema   pasang migrasi di supabase/migrations yang belum terpasang
#   npm run db:seed     ekspor data bersih ke CSV, lalu ganti seluruh isi tabel
#   npm run db:setup    schema + seed
#   npm run db:lingkungan  muat ulang data lingkungan (tipe lokasi) dari supabase/lingkungan/*.csv
#   npm run db:gambar   muat ulang daftar gambar dari supabase/gambar/gambar.csv.gz
#   npm run db:validasi cari ulang temuan kualitas data (pusat validasi data)
#   npm run db:test     uji otomatis aturan akses dan alur di basis data (tidak meninggalkan data)
#   npm run db:check    tampilkan ringkasan isi basis data
#
# Butuh: psql, python3, dan SUPABASE_DB_URL (di .env.local atau variabel lingkungan).
set -euo pipefail
cd "$(dirname "$0")/.."

# Baca SUPABASE_DB_URL dari .env.local tanpa mengeksekusi berkasnya.
if [ -z "${SUPABASE_DB_URL:-}" ] && [ -f .env.local ]; then
  SUPABASE_DB_URL=$(grep -E '^SUPABASE_DB_URL=' .env.local | tail -1 | cut -d= -f2- \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//" || true)
fi
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL belum diisi. Ambil dari dasbor Supabase: Connect > Session pooler, lalu tulis di .env.local." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql tidak ditemukan. Pasang dengan: brew install libpq && brew link --force libpq" >&2
  exit 1
fi

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
sql() { psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

schema() {
  # Catatan migrasi disimpan di skema `private`, yang tidak dibuka lewat API Supabase.
  sql -q -c "create schema if not exists private" \
      -c "create table if not exists private.migrasi (nama text primary key, dipasang timestamptz not null default now())"
  for berkas in supabase/migrations/*.sql; do
    nama=$(basename "$berkas")
    if [ "$(sql -Atc "select 1 from private.migrasi where nama = '$nama'")" = "1" ]; then
      echo "lewati  $nama (sudah terpasang)"
      continue
    fi
    echo "pasang  $nama"
    # Satu transaksi: migrasi dan catatannya masuk bersama, atau tidak sama sekali.
    sql -q -1 -f "$berkas" -c "insert into private.migrasi (nama) values ('$nama')"
  done
}

lingkungan() {
  if [ ! -f supabase/lingkungan/spbu_lingkungan.csv ]; then
    echo "Data lingkungan belum ada (supabase/lingkungan/). Hitung dulu dengan: npm run data:lingkungan" >&2
    return 0
  fi
  local ada_peta=false
  [ -f supabase/lingkungan/tempat_peta.csv.gz ] && ada_peta=true
  sql -v ada_peta="$ada_peta" -f supabase/load_lingkungan.sql
}

gambar() {
  if [ ! -f supabase/gambar/gambar.csv.gz ]; then
    echo "Daftar gambar belum ada (supabase/gambar/). Buat dulu dengan: npm run data:gambar" >&2
    return 0
  fi
  if [ "$(sql -Atc "select to_regclass('public.gambar') is not null")" != "t" ]; then
    echo "Tabel gambar belum dipasang. Jalankan dulu: npm run db:schema" >&2
    return 0
  fi
  sql -f supabase/load_gambar.sql
}

seed() {
  python3 scripts/export_seed.py
  sql -f supabase/load.sql
  lingkungan   # load.sql mengosongkan tabel lingkungan dan gambar, jadi dimuat kembali di sini
  gambar
  validasi     # temuan kualitas data dicari ulang; keputusan peninjau yang sudah ada tidak ditimpa
}

validasi() {
  if [ "$(sql -Atc "select to_regprocedure('public.deteksi_masalah_data()') is not null")" != "t" ]; then
    echo "Pusat validasi data belum dipasang. Jalankan dulu: npm run db:schema" >&2
    return 0
  fi
  sql -c "select jsonb_pretty(public.deteksi_masalah_data()) as temuan_data"
}

uji() {
  for berkas in supabase/tests/*.sql; do
    echo "uji  $(basename "$berkas")"
    sql -q -f "$berkas"
  done
}

case "${1:-}" in
  schema) schema ;;
  seed)   seed ;;
  setup)  schema; seed ;;
  lingkungan) lingkungan ;;
  gambar) gambar ;;
  validasi) validasi ;;
  test) uji ;;
  check)  sql -c "select * from public.v_ringkasan" ;;
  *) echo "Pemakaian: scripts/db.sh schema|seed|setup|lingkungan|gambar|validasi|test|check" >&2; exit 1 ;;
esac
