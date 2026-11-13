#!/usr/bin/env python3
"""Hitung fitur lingkungan tiap SPBU dari data terbuka, lalu tentukan tipe lokasinya.

Masukan
  ../nfr-dashboard/public/eksplorasi/spbu.json      koordinat SPBU (hasil pipeline)
  data/eksternal/overture/part-*.parquet            titik tempat Overture (unduh_overture.py)
  data/eksternal/worldpop/idn_pop_*_1km_*.tif       penduduk per sel 1 km (WorldPop, CC BY 4.0)

Keluaran
  supabase/lingkungan/spbu_lingkungan.csv   satu baris per SPBU berkoordinat (boleh di-commit)
  supabase/lingkungan/poi_sekitar.csv       tempat penting terdekat per SPBU (maks. 8)
  data/eksternal/laporan_lingkungan.json   ringkasan untuk uji mutu

    python3 scripts/eksternal/fitur_lingkungan.py

Raster WorldPop diunduh sekali (5 MB) dari:
  https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2026/IDN/v1/1km_ua/constrained/idn_pop_2026_CN_1km_R2025A_UA_v1.tif

Butuh numpy, pyarrow, dan Pillow.
"""
from __future__ import annotations

import csv
import glob
import json
import math
import os
import sys
from collections import Counter, defaultdict
from datetime import date

import numpy as np
import pyarrow.dataset as ds
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPBU_JSON = os.environ.get("SEED_SOURCE", os.path.join(ROOT, "..", "nfr-dashboard", "public", "eksplorasi"))
OVERTURE = os.path.join(ROOT, "data", "eksternal", "overture")
WORLDPOP = os.path.join(ROOT, "data", "eksternal", "worldpop")
SEED = os.path.join(ROOT, "supabase", "lingkungan")

# Tempat dengan keyakinan rendah (umumnya halaman media sosial yang tidak terverifikasi) dibuang.
KEYAKINAN_MIN = 0.5

# ---------------------------------------------------------------- kelompok tempat
# Kelompok untuk tipe lokasi. Kunci = basic_category Overture.
KELOMPOK = {
    "kampus": {"college_university", "campus_building", "research_institute"},
    "sekolah": {
        "elementary_school", "middle_school", "high_school", "preschool", "place_of_learning", "education",
        "specialty_school", "tutoring_service", "educational_service", "library", "educational_facility",
    },
    "kantor": {
        "corporate_or_business_office", "government_office", "government_department", "professional_service",
        "financial_service", "bank_or_credit_union", "b2b_service", "b2b_office_and_professional_service",
        "attorney_or_law_firm", "legal_service", "media_service", "technical_service", "design_service",
        "courthouse", "embassy", "b2b_science_and_technology_service", "telecommunications_service",
    },
    "belanja": {
        "shopping_mall", "department_store", "shopping", "fashion_and_apparel_store", "electronics_store",
        "hardware_home_and_garden_store", "market", "farmers_market", "warehouse_club_store", "superstore",
        "specialty_store", "personal_care_and_beauty_store", "sporting_goods_store", "books_music_and_video_store",
        "toys_and_games_store", "flowers_and_gifts_store", "arts_crafts_and_hobby_store", "second_hand_store",
        "office_supply_store", "discount_store", "food_and_beverage_store", "convenience_store",
    },
    "kuliner": {
        "restaurant", "cafe", "coffee_shop", "casual_eatery", "fast_food_restaurant", "food_truck_stand", "bar",
        "food_and_drink", "non_alcoholic_beverage_venue", "smoothie_juice_bar", "food_court", "food_service",
    },
    "wisata": {
        "hotel", "lodging", "resort", "private_lodging", "bed_and_breakfast", "inn", "campground", "historic_site",
        "beach", "museum", "amusement_park", "national_park", "zoo", "aquarium", "monument", "art_gallery",
        "travel_service", "waterfall", "hot_springs", "nature_reserve", "amusement_attraction", "animal_attraction",
        "cultural_center", "theatre_venue", "garden",
    },
    # Gerai kurir dan jasa konstruksi sengaja tidak dimasukkan: keduanya banyak di kawasan non-industri.
    "industri": {
        "manufacturer", "supplier_or_distributor", "wholesaler", "b2b_transportation_and_storage_service",
        "storage_facility", "b2b_industrial_and_machine_service", "industrial_facility_or_service",
    },
    "kesehatan": {
        "hospital", "health_care", "outpatient_care_facility", "dental_clinic", "diagnostics_imaging_or_lab_service",
        "primary_care_or_general_clinic", "medical_service", "pharmacy_and_drug_store", "pediatric_clinic",
        "emergency_department", "specialized_medical_facility", "specialized_health_care",
        "emergency_or_urgent_care_facility", "vision_or_eye_care_clinic", "reproductive_perinatal_and_womens_care",
    },
    "transportasi": {
        "train_station", "airport", "public_transit_facility_or_service", "air_transport_facility_or_service", "pier",
    },
}

# Usaha sejenis di sekitar, per jenis usaha NFR (untuk konteks persaingan; tidak masuk skor).
SEJENIS = {
    "minimarket": {"convenience_store", "superstore", "discount_store"},
    "fnb": {"coffee_shop", "cafe", "fast_food_restaurant", "casual_eatery", "food_truck_stand", "smoothie_juice_bar",
            "non_alcoholic_beverage_venue"},
    "bank": {"bank_or_credit_union", "atm"},
    "otomotif": {"automotive_service", "vehicle_service", "vehicle_parts_store"},
    "logistik": {"shipping_or_delivery_service"},
    "apotek": {"pharmacy_and_drug_store", "primary_care_or_general_clinic", "outpatient_care_facility", "dental_clinic"},
    "spbu_lain": {"gas_station", "fueling_station"},
    "ev": {"ev_charging_station"},
}

# Tempat penting yang ditampilkan di profil lokasi, dengan label Indonesia.
PENTING = {
    "college_university": "Kampus", "shopping_mall": "Mal", "hospital": "Rumah sakit", "hotel": "Hotel",
    "train_station": "Stasiun", "airport": "Bandara", "government_office": "Kantor pemerintah",
    "corporate_or_business_office": "Perkantoran", "high_school": "SMA", "department_store": "Toserba",
    "market": "Pasar", "farmers_market": "Pasar", "public_transit_facility_or_service": "Terminal / halte",
    "stadium_arena": "Stadion", "manufacturer": "Pabrik", "amusement_park": "Taman hiburan",
}

KELOMPOK_TIPE = ["kampus", "kantor", "belanja", "kuliner", "wisata", "industri"]


def jarak_m(lat1, lng1, lat2, lng2):
    """Jarak haversine (meter); lat2/lng2 boleh berupa array."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lng2 - lng1) / 2) ** 2
    return 6371000.0 * 2 * np.arcsin(np.sqrt(a))


def persentil(nilai: np.ndarray) -> np.ndarray:
    """Peringkat 0–1 tiap nilai di antara semua SPBU (nilai sama mendapat peringkat rata-rata)."""
    urut = np.sort(nilai)
    bawah = np.searchsorted(urut, nilai, side="left")
    atas = np.searchsorted(urut, nilai, side="right")
    return (bawah + atas) / 2 / len(nilai)


def muat_spbu():
    """SPBU yang koordinatnya layak dipakai, dan id SPBU yang koordinatnya meragukan (dikeluarkan)."""
    # Hanya koordinat lengkap dan berada di wilayah Indonesia. Di sumber ada 5 SPBU tanpa bujur
    # dan 4 SPBU yang koordinatnya salah tanda atau salah ketik.
    def sah(s):
        lat, lng = s.get("lat"), s.get("lng")
        angka = all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lat, lng))
        return angka and -11.1 <= lat <= 6.2 and 94.9 <= lng <= 141.1

    spbu = [s for s in json.load(open(os.path.join(SPBU_JSON, "spbu.json"), encoding="utf-8")) if sah(s)]

    # Koordinat yang berjarak > 150 km dari titik tengah SPBU sekotanya hampir pasti salah; dikeluarkan.
    per_kota = defaultdict(list)
    for s in spbu:
        per_kota[(s["prov"], s["kota"])].append(s)
    meragukan = set()
    for daftar in per_kota.values():
        if len(daftar) < 5:
            continue
        tlat = float(np.median([s["lat"] for s in daftar]))
        tlng = float(np.median([s["lng"] for s in daftar]))
        for s in daftar:
            if float(jarak_m(tlat, tlng, s["lat"], s["lng"])) > 150_000:
                meragukan.add(s["id"])
    return [s for s in spbu if s["id"] not in meragukan], meragukan


def muat_tempat():
    """Titik tempat Overture yang dipakai: (lat, lng, kategori, nama, rilis, jumlah baris sumber). None bila belum diunduh."""
    berkas = sorted(glob.glob(os.path.join(OVERTURE, "part-*.parquet")))
    if not berkas:
        print("Data Overture belum ada. Jalankan scripts/eksternal/unduh_overture.py dulu.", file=sys.stderr)
        return None
    rilis = open(os.path.join(OVERTURE, "rilis.txt")).read().strip()
    t = ds.dataset(berkas, format="parquet").to_table(columns=["nama", "kategori", "merek", "keyakinan", "status", "lat", "lng"])
    yakin = np.nan_to_num(t.column("keyakinan").to_numpy(zero_copy_only=False), nan=0.0) >= KEYAKINAN_MIN
    status = np.array(t.column("status").to_pylist(), dtype=object)
    pakai = yakin & (status != "permanently_closed") & (status != "temporarily_closed")
    plat = t.column("lat").to_numpy()[pakai]
    plng = t.column("lng").to_numpy()[pakai]
    pkat = np.array(t.column("kategori").to_pylist(), dtype=object)[pakai]
    pnama = np.array(t.column("nama").to_pylist(), dtype=object)[pakai]
    return plat, plng, pkat, pnama, rilis, t.num_rows


def main() -> int:
    # ------------------------------------------------------------ SPBU
    spbu, meragukan = muat_spbu()
    print(f"Koordinat meragukan (dikeluarkan): {len(meragukan)}")
    S = len(spbu)
    slat = np.array([s["lat"] for s in spbu], dtype=np.float64)
    slng = np.array([s["lng"] for s in spbu], dtype=np.float64)
    print(f"SPBU berkoordinat: {S:,}".replace(",", "."))

    # ------------------------------------------------------------ Overture
    tempat = muat_tempat()
    if tempat is None:
        return 1
    plat, plng, pkat, pnama, rilis, jumlah_sumber = tempat
    print(f"Tempat Overture dipakai: {len(plat):,} dari {jumlah_sumber:,} (keyakinan ≥ {KEYAKINAN_MIN})".replace(",", "."))

    # kode kelompok per tempat
    kat_unik, kat_idx = np.unique(np.where(pkat == None, "", pkat).astype(str), return_inverse=True)  # noqa: E711
    def topeng(himpunan):
        return np.isin(kat_unik, list(himpunan))[kat_idx]
    m_kelompok = {k: topeng(v) for k, v in KELOMPOK.items()}
    m_sejenis = {k: topeng(v) for k, v in SEJENIS.items()}
    m_penting = topeng(PENTING.keys())

    # indeks kisi 0,01° (≈ 1,1 km) agar pencarian tetangga cepat
    SEL = 0.01
    gx = np.floor(plng / SEL).astype(np.int64)
    gy = np.floor(plat / SEL).astype(np.int64)
    kunci = gy * 100000 + gx
    urut = np.argsort(kunci, kind="stable")
    kunci_urut = kunci[urut]

    kolom_hitung = (
        ["poi_500m", "poi_1km"]
        + [f"{k}_1km" for k in KELOMPOK]
        + [f"{k}_500m" for k in SEJENIS if k not in ("spbu_lain", "ev")]
        + ["minimarket_1km", "spbu_lain_1km", "ev_1km"]
    )
    F = {k: np.zeros(S, dtype=np.int32) for k in kolom_hitung}
    poi_rows = []

    for i in range(S):
        cy, cx = int(math.floor(slat[i] / SEL)), int(math.floor(slng[i] / SEL))
        bagian = []
        for dy in (-1, 0, 1):
            k0 = (cy + dy) * 100000 + (cx - 1)
            a, b = np.searchsorted(kunci_urut, [k0, k0 + 3])  # tiga sel berurutan pada baris yang sama
            if b > a:
                bagian.append(urut[a:b])
        if not bagian:
            continue
        idx = np.concatenate(bagian)
        d = jarak_m(slat[i], slng[i], plat[idx], plng[idx])
        d1 = d <= 1000
        d5 = d <= 500
        F["poi_1km"][i] = int(d1.sum())
        F["poi_500m"][i] = int(d5.sum())
        for k in KELOMPOK:
            F[f"{k}_1km"][i] = int((d1 & m_kelompok[k][idx]).sum())
        for k in SEJENIS:
            if k not in ("spbu_lain", "ev"):
                F[f"{k}_500m"][i] = int((d5 & m_sejenis[k][idx]).sum())
        F["minimarket_1km"][i] = int((d1 & m_sejenis["minimarket"][idx]).sum())
        # SPBU lain: buang titik dalam 80 m, yang hampir pasti SPBU ini sendiri
        F["spbu_lain_1km"][i] = int((d1 & (d > 80) & m_sejenis["spbu_lain"][idx]).sum())
        F["ev_1km"][i] = int((d1 & m_sejenis["ev"][idx]).sum())

        # tempat penting terdekat, paling banyak 8, satu per nama
        cand = idx[d1 & m_penting[idx]]
        if len(cand):
            dd = d[d1 & m_penting[idx]]
            lihat, n = set(), 0
            for j in np.argsort(dd):
                nama = pnama[cand[j]]
                if not nama or nama.lower() in lihat:
                    continue
                lihat.add(nama.lower())
                poi_rows.append([spbu[i]["id"], nama.strip()[:120], PENTING[pkat[cand[j]]], int(round(dd[j]))])
                n += 1
                if n == 8:
                    break
        if (i + 1) % 2000 == 0:
            print(f"  {i + 1:,} SPBU".replace(",", "."), flush=True)

    # ------------------------------------------------------------ WorldPop
    tif = sorted(glob.glob(os.path.join(WORLDPOP, "idn_pop_*_1km_*.tif")))
    if not tif:
        print("Raster WorldPop belum ada di data/eksternal/worldpop. Alamat unduhnya ada di bagian atas skrip ini.", file=sys.stderr)
        return 1
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(tif[-1])
    tag = im.tag_v2
    px, py = tag[33550][0], tag[33550][1]
    x0, y0 = tag[33922][3], tag[33922][4]
    pop = np.array(im, dtype=np.float32)
    pop[pop < 0] = 0  # nodata
    H, W = pop.shape
    kepadatan = np.zeros(S)
    pend3 = np.zeros(S)
    R = 4  # ± 4 sel ≈ 3,7 km
    for i in range(S):
        c = int((slng[i] - x0) / px)
        r = int((y0 - slat[i]) / py)
        if not (0 <= r < H and 0 <= c < W):
            continue
        luas_sel = (py * 111.32) * (px * 111.32 * math.cos(math.radians(slat[i])))  # km²
        kepadatan[i] = pop[r, c] / luas_sel
        r0, r1, c0, c1 = max(0, r - R), min(H, r + R + 1), max(0, c - R), min(W, c + R + 1)
        rr, cc = np.mgrid[r0:r1, c0:c1]
        d = jarak_m(slat[i], slng[i], y0 - (rr + 0.5) * py, x0 + (cc + 0.5) * px)
        pend3[i] = float(pop[r0:r1, c0:c1][d <= 3000].sum())
    print(f"Penduduk: median kepadatan {np.median(kepadatan):,.0f} jiwa/km², median dalam 3 km {np.median(pend3):,.0f}".replace(",", "."))

    # ------------------------------------------------------------ tipe lokasi
    tipe, kedua, lq_all = tentukan_tipe(F, kepadatan, pend3)
    pct_penduduk = persentil(pend3)
    pct_aktivitas = persentil(F["poi_1km"].astype(float))

    # ------------------------------------------------------------ tulis
    os.makedirs(SEED, exist_ok=True)
    hari_ini = date.today().isoformat()
    kolom = (["spbu_id", "tipe_lokasi", "tipe_kedua"] + kolom_hitung
             + ["penduduk_km2", "penduduk_3km", "pct_penduduk", "pct_aktivitas", "sumber_tempat", "sumber_penduduk", "dihitung"])
    with open(os.path.join(SEED, "spbu_lingkungan.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(kolom)
        for i, s in enumerate(spbu):
            w.writerow([s["id"], tipe[i], kedua[i] or None] + [int(F[k][i]) for k in kolom_hitung]
                       + [round(float(kepadatan[i])), round(float(pend3[i])), round(float(pct_penduduk[i]), 4),
                          round(float(pct_aktivitas[i]), 4), f"Overture Maps {rilis}", os.path.basename(tif[-1]), hari_ini])
    with open(os.path.join(SEED, "poi_sekitar.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["spbu_id", "nama", "jenis", "jarak_m"])
        w.writerows(poi_rows)

    laporan = {
        "rilis_overture": rilis, "raster_worldpop": os.path.basename(tif[-1]), "dihitung": hari_ini,
        "spbu": S, "koordinat_meragukan": len(meragukan), "tempat_dipakai": int(len(plat)), "keyakinan_min": KEYAKINAN_MIN,
        "tipe": dict(Counter(tipe).most_common()),
        "kuantil": {k: [int(x) for x in np.quantile(F[k], [0.1, 0.25, 0.5, 0.75, 0.9])] for k in ["poi_500m", "poi_1km"] + [f"{k}_1km" for k in KELOMPOK_TIPE]},
        "kuantil_kepadatan": [int(x) for x in np.quantile(kepadatan, [0.1, 0.25, 0.5, 0.75, 0.9])],
        "kuantil_penduduk_3km": [int(x) for x in np.quantile(pend3, [0.1, 0.25, 0.5, 0.75, 0.9])],
        "spbu_tanpa_tempat_1km": int((F["poi_1km"] == 0).sum()),
        "poi_sekitar": len(poi_rows),
    }
    json.dump(laporan, open(os.path.join(ROOT, "data", "eksternal", "laporan_lingkungan.json"), "w"), ensure_ascii=False, indent=2)
    print(json.dumps(laporan, ensure_ascii=False, indent=1))
    return 0


# Ambang tipe lokasi. Semua adalah usulan awal; uji lapangan di kota pilot yang menentukan nilainya.
SEPI_POI = 25            # < 25 tempat dalam 1 km dan …
SEPI_KEPADATAN = 1000    # … < 1.000 jiwa/km² → jalur luar kota
MIN_KELOMPOK = {"kampus": 4, "kantor": 15, "belanja": 25, "kuliner": 25, "wisata": 10, "industri": 10}
LQ_MIN = 1.35            # kelompok harus ≥ 1,35× porsi rata-rata jaringan agar menjadi tipe
PUSAT_KOTA_POI = 500     # tanpa kelompok dominan tetapi ≥ 500 tempat dalam 1 km (10% teratas) → pusat kota
PADAT_HUNIAN = 4000      # jiwa/km²: tanpa kelompok dominan dan sepadat ini → perumahan

NAMA_TIPE = {"kampus": "kampus", "kantor": "perkantoran", "belanja": "komersial", "kuliner": "komersial",
             "wisata": "wisata", "industri": "industri"}


def tentukan_tipe(F, kepadatan, pend3):
    """Tipe lokasi dari bauran tempat dalam 1 km dan kepadatan penduduk.

    Location quotient (LQ) = porsi satu kelompok di sekitar SPBU ÷ porsi kelompok itu di seluruh jaringan.
    Tipe = kelompok dengan LQ tertinggi yang jumlahnya memadai. Tanpa kelompok dominan: pusat kota bila sangat
    ramai, perumahan bila padat penduduk, jalur luar kota bila sepi, selain itu campuran.
    """
    S = len(kepadatan)
    M = np.stack([F[f"{k}_1km"].astype(float) for k in KELOMPOK_TIPE], axis=1)
    total = np.maximum(M.sum(axis=1), 1)
    porsi = M / total[:, None]
    porsi_jaringan = M.sum(axis=0) / M.sum()
    lq = porsi / porsi_jaringan[None, :]

    tipe, kedua = [], []
    for i in range(S):
        if F["poi_1km"][i] < SEPI_POI and kepadatan[i] < SEPI_KEPADATAN:
            tipe.append("luar_kota")
            kedua.append("")
            continue
        kandidat = sorted(
            ((lq[i, j], NAMA_TIPE[k]) for j, k in enumerate(KELOMPOK_TIPE) if M[i, j] >= MIN_KELOMPOK[k] and lq[i, j] >= LQ_MIN),
            reverse=True,
        )
        nama = []
        for _, n in kandidat:  # "belanja" dan "kuliner" sama-sama komersial
            if n not in nama:
                nama.append(n)
        if nama:
            tipe.append(nama[0])
            kedua.append(nama[1] if len(nama) > 1 else "")
        elif F["poi_1km"][i] >= PUSAT_KOTA_POI:
            tipe.append("pusat_kota")
            kedua.append("")
        elif kepadatan[i] >= PADAT_HUNIAN:
            tipe.append("perumahan")
            kedua.append("")
        elif F["poi_1km"][i] < SEPI_POI:
            tipe.append("luar_kota")
            kedua.append("")
        else:
            tipe.append("campuran")
            kedua.append("")
    return tipe, kedua, lq


if __name__ == "__main__":
    raise SystemExit(main())
