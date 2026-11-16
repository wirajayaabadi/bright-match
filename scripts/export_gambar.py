#!/usr/bin/env python3
"""
Ringkas manifest gambar Brightspace menjadi supabase/gambar/gambar.csv.gz untuk tabel public.gambar.

Sumber bawaan: ../out/gambar/manifest.csv (hasil brightspace_gambar.py di akar proyek).
Hanya gambar yang berkasnya berhasil diunduh dan diubah ke WebP yang ikut. Kolom `kunci` adalah
kunci objek di bucket (brightspace/<aa>/<sha256>.webp); thumbnail 480 px memakai kunci yang sama
dengan akhiran -480.webp.

Pemakaian: python3 scripts/export_gambar.py [--manifest PATH]
"""

import argparse
import csv
import gzip
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOLOM = ["spbu_id", "lahan_id", "jenis", "urutan", "label", "diunggah", "kunci", "lebar", "tinggi"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default=os.path.join(ROOT, "..", "out", "gambar", "manifest.csv"))
    a = ap.parse_args()
    if not os.path.exists(a.manifest):
        sys.exit(f"{a.manifest} belum ada. Jalankan brightspace_gambar.py di akar proyek dulu.")

    baris, lewati, terlihat = [], Counter(), set()
    with open(a.manifest, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["status_unduh"] != "ok" or not r["kunci_objek"].endswith(".webp") or not r["kunci_kecil"]:
                lewati["berkas tidak tersedia"] += 1
                continue
            if r["ada_di_data"] != "True":
                lewati["tidak ada di data"] += 1
                continue
            # Sumber kadang memuat gambar yang sama dua kali di satu lahan: cukup satu.
            kunci = (r["spbu_id"], r["lahan_id"], r["jenis"], r["kunci_objek"])
            if kunci in terlihat:
                lewati["dobel di satu lahan"] += 1
                continue
            terlihat.add(kunci)
            baris.append([r["spbu_id"], r["lahan_id"], r["jenis"], r["urutan"], r["label"], r["diunggah"],
                          r["kunci_objek"], r["lebar"], r["tinggi"]])

    keluar = os.path.join(ROOT, "supabase", "gambar", "gambar.csv.gz")
    os.makedirs(os.path.dirname(keluar), exist_ok=True)
    with gzip.open(keluar, "wt", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(KOLOM)
        w.writerows(baris)

    per = Counter(b[2] for b in baris)
    print(f"{len(baris)} gambar ditulis ke {os.path.relpath(keluar, ROOT)} ({os.path.getsize(keluar) / 1e6:.1f} MB)")
    print("  per jenis: " + ", ".join(f"{k} {v}" for k, v in sorted(per.items())))
    if lewati:
        print("  dilewati: " + ", ".join(f"{k} {v}" for k, v in lewati.items()))


if __name__ == "__main__":
    main()
