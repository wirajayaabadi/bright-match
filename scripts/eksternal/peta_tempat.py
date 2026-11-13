#!/usr/bin/env python3
"""Siapkan titik tempat di sekitar tiap SPBU untuk peta di halaman Profil lokasi.

Masukan sama dengan fitur_lingkungan.py (koordinat SPBU dan titik tempat Overture), dan SPBU yang
dipakai juga sama, sehingga jumlah di peta selaras dengan angka di panel lingkungan.

Keluaran
  supabase/lingkungan/tempat_peta.csv.gz   satu baris per SPBU berkoordinat: spbu_id, jumlah, titik

`titik` adalah larik JSON, urut dari yang terdekat. Tiap tempat ditulis [dx, dy, kelompok, nama]:
  dx, dy    jarak dari SPBU ke timur dan ke utara, dalam meter (negatif = barat / selatan)
  kelompok  indeks ke KELOMPOK_PETA di bawah (padanannya ada di src/lib/peta.ts)
  nama      nama tempat menurut Overture, paling panjang 60 karakter

Jarak dalam meter dipakai, bukan lintang dan bujur, agar berkas kecil: ± 1 juta tempat menjadi ± 15 MB.

    python3 scripts/eksternal/peta_tempat.py
"""
from __future__ import annotations

import csv
import gzip
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fitur_lingkungan import KELOMPOK, SEED, SEJENIS, jarak_m, muat_spbu, muat_tempat  # noqa: E402

RADIUS_M = 1000
NAMA_MAKS = 60
# Titik SPBU lain dalam jarak ini hampir pasti SPBU itu sendiri (sama dengan fitur_lingkungan.py).
DIRI_SENDIRI_M = 80

# Urutan ini adalah kode yang disimpan. Jangan diubah tanpa mengubah src/lib/peta.ts.
KELOMPOK_PETA = ["kuliner", "belanja", "kantor", "pendidikan", "kesehatan", "wisata", "industri", "transportasi", "spbu", "lain"]
DARI_KELOMPOK = {"kampus": "pendidikan", "sekolah": "pendidikan"}

M_PER_DERAJAT_LINTANG = 110_574.0
M_PER_DERAJAT_BUJUR = 111_320.0  # di khatulistiwa; dikali cos(lintang)


def main() -> int:
    spbu, _ = muat_spbu()
    tempat = muat_tempat()
    if tempat is None:
        return 1
    plat, plng, pkat, pnama, rilis, _ = tempat
    S = len(spbu)

    # kode kelompok per kategori Overture
    kode_kategori = {}
    for kelompok, kategori in KELOMPOK.items():
        kode = KELOMPOK_PETA.index(DARI_KELOMPOK.get(kelompok, kelompok))
        for k in kategori:
            kode_kategori[k] = kode
    for k in SEJENIS["spbu_lain"]:
        kode_kategori[k] = KELOMPOK_PETA.index("spbu")
    LAIN, KODE_SPBU = KELOMPOK_PETA.index("lain"), KELOMPOK_PETA.index("spbu")
    kat_unik, kat_idx = np.unique(np.where(pkat == None, "", pkat).astype(str), return_inverse=True)  # noqa: E711
    pkode = np.array([kode_kategori.get(k, LAIN) for k in kat_unik], dtype=np.int8)[kat_idx]

    # indeks kisi 0,01° (≈ 1,1 km), sama dengan fitur_lingkungan.py
    SEL = 0.01
    kunci = np.floor(plat / SEL).astype(np.int64) * 100000 + np.floor(plng / SEL).astype(np.int64)
    urut = np.argsort(kunci, kind="stable")
    kunci_urut = kunci[urut]

    os.makedirs(SEED, exist_ok=True)
    keluar = os.path.join(SEED, "tempat_peta.csv.gz")
    total, per_kelompok, terbanyak = 0, np.zeros(len(KELOMPOK_PETA), dtype=np.int64), 0
    with gzip.open(keluar, "wt", newline="", encoding="utf-8", compresslevel=9) as f:
        w = csv.writer(f)
        w.writerow(["spbu_id", "jumlah", "titik"])
        for i, s in enumerate(spbu):
            lat0, lng0 = float(s["lat"]), float(s["lng"])
            cy, cx = int(math.floor(lat0 / SEL)), int(math.floor(lng0 / SEL))
            bagian = []
            for dy in (-1, 0, 1):
                k0 = (cy + dy) * 100000 + (cx - 1)
                a, b = np.searchsorted(kunci_urut, [k0, k0 + 3])
                if b > a:
                    bagian.append(urut[a:b])
            titik = []
            if bagian:
                idx = np.concatenate(bagian)
                d = jarak_m(lat0, lng0, plat[idx], plng[idx])
                kode = pkode[idx]
                pakai = (d <= RADIUS_M) & ~((kode == KODE_SPBU) & (d <= DIRI_SENDIRI_M))
                idx, d, kode = idx[pakai], d[pakai], kode[pakai]
                dx = (plng[idx] - lng0) * M_PER_DERAJAT_BUJUR * math.cos(math.radians(lat0))
                dy_m = (plat[idx] - lat0) * M_PER_DERAJAT_LINTANG
                for j in np.argsort(d, kind="stable"):
                    nama = " ".join((pnama[idx[j]] or "").split())[:NAMA_MAKS]
                    titik.append([int(round(dx[j])), int(round(dy_m[j])), int(kode[j]), nama])
                np.add.at(per_kelompok, kode, 1)
            total += len(titik)
            terbanyak = max(terbanyak, len(titik))
            w.writerow([s["id"], len(titik), json.dumps(titik, ensure_ascii=False, separators=(",", ":"))])
            if (i + 1) % 2000 == 0:
                print(f"  {i + 1:,} SPBU".replace(",", "."), flush=True)

    ukuran = os.path.getsize(keluar) / 1e6
    print(f"Overture {rilis}: {total:,} tempat dalam {RADIUS_M} m untuk {S:,} SPBU (terbanyak {terbanyak:,} di satu SPBU)".replace(",", "."))
    print("Per kelompok: " + ", ".join(f"{k} {int(v):,}".replace(",", ".") for k, v in zip(KELOMPOK_PETA, per_kelompok)))
    print(f"Tertulis {keluar} ({ukuran:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
