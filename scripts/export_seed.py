#!/usr/bin/env python3
"""Ubah data bersih hasil pipeline (eksplorasi.py) menjadi CSV siap muat ke Supabase.

Sumber bawaan: ../nfr-dashboard/public/eksplorasi (spbu.json + lahan/<provinsi>.json).
Keluaran:      supabase/seed/{spbu,lahan,area_sekitar}.csv  (tidak ikut di-commit)

Pemakaian:
    python3 scripts/export_seed.py [folder_sumber]

Hanya memakai pustaka standar Python.
"""
from __future__ import annotations

import csv
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "..", "nfr-dashboard", "public", "eksplorasi")
OUT = os.path.join(ROOT, "supabase", "seed")


def pg_array(items: list[str]) -> str:
    """Literal array Postgres: {"a","b"} dengan escape untuk \\ dan "."""
    esc = ['"' + str(x).replace("\\", "\\\\").replace('"', '\\"') + '"' for x in items if str(x).strip()]
    return "{" + ",".join(esc) + "}"


def teks(v):
    """String kosong dan tanda '-' dianggap tidak ada data."""
    if v is None:
        return None
    s = str(v).strip()
    return None if s in ("", "-") else s


def tulis(nama: str, kolom: list[str], baris: list[list]) -> None:
    path = os.path.join(OUT, nama)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(kolom)
        w.writerows(baris)
    print(f"  {nama:<18} {len(baris):>7,} baris".replace(",", "."))


def main() -> int:
    src = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SEED_SOURCE", DEFAULT_SRC))
    spbu_path = os.path.join(src, "spbu.json")
    lahan_paths = sorted(glob.glob(os.path.join(src, "lahan", "*.json")))
    if not os.path.exists(spbu_path) or not lahan_paths:
        print(f"Data sumber tidak ditemukan di {src}.\nJalankan dulu `python3 eksplorasi.py` di proyek pipeline.", file=sys.stderr)
        return 1

    os.makedirs(OUT, exist_ok=True)
    print(f"Sumber: {src}")

    spbu = json.load(open(spbu_path, encoding="utf-8"))
    spbu_ids = {s["id"] for s in spbu}

    spbu_rows, area_rows = [], []
    for s in spbu:
        spbu_rows.append([
            s["id"], s["no"], s["nama"], teks(s.get("alamat")), s["kota"], s["prov"],
            s.get("lat"), s.get("lng"), bool(s.get("fix")),
            pg_array(s.get("fas") or []), int(s.get("foto") or 0), bool(s.get("l360")), teks(s.get("stl")),
        ])
        for a in s.get("area") or []:
            if teks(a.get("n")):
                area_rows.append([s["id"], teks(a.get("n")), teks(a.get("k")), teks(a.get("ket")), a.get("km")])

    lahan_rows, seen, yatim = [], set(), 0
    for path in lahan_paths:
        for l in json.load(open(path, encoding="utf-8")):
            if l["s"] not in spbu_ids:
                yatim += 1
                continue
            m = l.get("m") or {}
            dup = l["i"] in seen
            seen.add(l["i"])
            lahan_rows.append([
                l["i"], l["s"], l["k"], l["st"], l["seg"],
                l.get("lu"), l.get("d"), l.get("h"), teks(l.get("p")), l.get("ht"), l.get("hm2"),
                teks(l.get("o")), teks(l.get("ds")), l.get("t"), l.get("pj"), l.get("lb"),
                teks(l.get("lt")), teks(l.get("ps")), dup,
                teks(m.get("t")), teks(m.get("a")), teks(m.get("z")), m.get("v"), teks(m.get("s")), m.get("n"),
            ])

    tulis("spbu.csv", [
        "id", "nomor", "nama", "alamat", "kota", "provinsi", "lat", "lng", "koordinat_diperbaiki",
        "fasilitas", "jumlah_foto", "punya_tur_360", "status_listing",
    ], spbu_rows)
    tulis("lahan.csv", [
        "lahan_id", "spbu_id", "kode", "status", "segmen", "luas_m2", "daya_w", "harga", "periode",
        "tarif_tahunan", "tarif_per_m2", "outlet", "deskripsi", "tinggi_m", "panjang_m", "lebar_m",
        "lantai", "posisi", "duplikat", "tenant", "kontrak_mulai", "kontrak_akhir", "kontrak_nilai",
        "kontrak_status", "kontrak_baris",
    ], lahan_rows)
    tulis("area_sekitar.csv", ["spbu_id", "nama", "kategori", "keterangan", "jarak_km"], area_rows)

    dobel = sum(1 for r in lahan_rows if r[18])
    print(f"  lahan dobel di sumber: {dobel}; lahan tanpa SPBU (dilewati): {yatim}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
