#!/usr/bin/env python3
"""Unduh titik tempat (places) Overture Maps untuk wilayah Indonesia.

Sumber : s3://overturemaps-us-west-2/release/<rilis>/theme=places/type=place (terbuka, tanpa akun)
Lisensi: per sumber (CDLA Permissive 2.0, Apache 2.0, CC0) — lihat https://docs.overturemaps.org/attribution/
Keluaran: data/eksternal/overture/part-XX.parquet (satu berkas per berkas sumber) + rilis.txt

Hanya kolom yang dipakai yang diambil, dan hanya baris di dalam kotak wilayah Indonesia.
Aman diulang: berkas yang sudah selesai dilewati, jadi unduhan yang putus bisa dilanjutkan.

    python3 scripts/eksternal/unduh_overture.py [rilis]

Butuh pyarrow (pip install pyarrow).
"""
from __future__ import annotations

import os
import sys
import time

import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as fs
import pyarrow.parquet as pq

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "eksternal", "overture")
BUCKET = "overturemaps-us-west-2"

# Kotak wilayah Indonesia (Sabang–Merauke, Miangas–Rote). Negara tetangga yang ikut masuk
# tidak mengganggu: fitur hanya dihitung di sekitar koordinat SPBU.
BARAT, TIMUR, SELATAN, UTARA = 94.9, 141.1, -11.1, 6.2

KOLOM = {
    "id": pc.field("id"),
    "nama": pc.field("names", "primary"),
    "kategori": pc.field("basic_category"),
    "taksonomi": pc.field("taxonomy", "primary"),
    "hierarki": pc.field("taxonomy", "hierarchy"),
    "merek": pc.field("brand", "names", "primary"),
    "keyakinan": pc.field("confidence"),
    "status": pc.field("operating_status"),
    "lng": pc.field("bbox", "xmin"),
    "lat": pc.field("bbox", "ymin"),
}
SARING = (
    (pc.field("bbox", "xmin") >= BARAT)
    & (pc.field("bbox", "xmin") <= TIMUR)
    & (pc.field("bbox", "ymin") >= SELATAN)
    & (pc.field("bbox", "ymin") <= UTARA)
)


def s3() -> fs.S3FileSystem:
    return fs.S3FileSystem(
        anonymous=True,
        region="us-west-2",
        retry_strategy=fs.AwsStandardS3RetryStrategy(max_attempts=10),
        request_timeout=120,
        connect_timeout=30,
    )


def rilis_terbaru(sistem: fs.S3FileSystem) -> str:
    isi = sistem.get_file_info(fs.FileSelector(f"{BUCKET}/release", recursive=False))
    return sorted(os.path.basename(f.path) for f in isi)[-1]


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    sistem = s3()
    catatan = os.path.join(OUT, "rilis.txt")
    if len(sys.argv) > 1:
        rilis = sys.argv[1]
    elif os.path.exists(catatan):
        rilis = open(catatan).read().strip()  # lanjutkan rilis yang sama agar bagian-bagiannya konsisten
    else:
        rilis = rilis_terbaru(sistem)
    open(catatan, "w").write(rilis + "\n")

    dasar = f"{BUCKET}/release/{rilis}/theme=places/type=place"
    berkas = sorted(f.path for f in sistem.get_file_info(fs.FileSelector(dasar, recursive=False)) if f.path.endswith(".parquet"))
    print(f"Rilis {rilis}: {len(berkas)} berkas sumber", flush=True)

    total = 0
    for i, path in enumerate(berkas):
        tujuan = os.path.join(OUT, f"part-{i:02d}.parquet")
        if os.path.exists(tujuan):
            n = pq.read_metadata(tujuan).num_rows
            total += n
            print(f"  [{i + 1:>2}/{len(berkas)}] sudah ada, {n:,} baris".replace(",", "."), flush=True)
            continue
        for coba in range(1, 9):
            try:
                mulai = time.time()
                tabel = ds.dataset(path, filesystem=s3(), format="parquet").to_table(filter=SARING, columns=KOLOM)
                pq.write_table(tabel, tujuan + ".tmp", compression="zstd")
                os.replace(tujuan + ".tmp", tujuan)
                total += tabel.num_rows
                print(
                    f"  [{i + 1:>2}/{len(berkas)}] {tabel.num_rows:,} baris, {time.time() - mulai:.0f} dtk".replace(",", "."),
                    flush=True,
                )
                break
            except OSError as e:
                print(f"  [{i + 1:>2}/{len(berkas)}] percobaan {coba} gagal: {str(e)[-110:]}", flush=True)
                time.sleep(min(60, 5 * coba))
        else:
            print("Berhenti: berkas ini gagal 8 kali. Jalankan ulang untuk melanjutkan.", file=sys.stderr)
            return 1

    print(f"Selesai: {total:,} tempat di {OUT}".replace(",", "."), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
