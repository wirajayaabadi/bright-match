/**
 * Tipe lokasi SPBU (tahap 2). Ditentukan oleh scripts/eksternal/fitur_lingkungan.py dari bauran
 * tempat dalam 1 km (Overture Maps) dan kepadatan penduduk (WorldPop). Ambangnya masih usulan
 * yang perlu uji lapangan di kota pilot.
 */
export const TIPE_LOKASI = {
  kampus: { nama: "Kampus", arti: "Perguruan tinggi menonjol di antara tempat dalam 1 km." },
  perkantoran: { nama: "Perkantoran", arti: "Kantor swasta dan pemerintah menonjol dalam 1 km." },
  komersial: { nama: "Komersial", arti: "Pertokoan dan tempat makan menonjol dalam 1 km." },
  wisata: { nama: "Wisata & perhotelan", arti: "Hotel dan tempat wisata menonjol dalam 1 km." },
  industri: { nama: "Industri & pergudangan", arti: "Pabrik, distributor, dan gudang menonjol dalam 1 km." },
  pusat_kota: { nama: "Pusat kota", arti: "Sangat ramai dan beragam: 500 tempat atau lebih dalam 1 km tanpa satu jenis yang menonjol." },
  perumahan: { nama: "Perumahan", arti: "Padat penduduk (≥ 4.000 jiwa/km²) tanpa pusat kegiatan yang menonjol." },
  luar_kota: { nama: "Luar kota", arti: "Sedikit tempat usaha dan penduduk di sekitarnya; umumnya jalur antarkota atau rest area." },
  campuran: { nama: "Campuran", arti: "Kegiatan di sekitarnya beragam dan tidak ada yang menonjol." },
} as const;

export type TipeLokasi = keyof typeof TIPE_LOKASI;

export const DAFTAR_TIPE = Object.keys(TIPE_LOKASI) as TipeLokasi[];

export const namaTipe = (t: string | null | undefined) =>
  t && t in TIPE_LOKASI ? TIPE_LOKASI[t as TipeLokasi].nama : "Belum ada data";

export const artiTipe = (t: string | null | undefined) =>
  t && t in TIPE_LOKASI ? TIPE_LOKASI[t as TipeLokasi].arti : "Koordinat SPBU ini tidak bisa dipakai, jadi lingkungannya belum dihitung.";

/** Atribusi wajib untuk data lingkungan. */
export const ATRIBUSI_LINGKUNGAN = "Tempat: Overture Maps Foundation. Penduduk: WorldPop (CC BY 4.0).";

/** Nama tipe lokasi dalam bahasa Inggris, untuk kartu penawaran. */
export const TIPE_LOKASI_EN: Record<TipeLokasi, { nama: string; arti: string }> = {
  kampus: { nama: "Campus area", arti: "Universities and colleges stand out among places within 1 km." },
  perkantoran: { nama: "Office district", arti: "Private and government offices stand out within 1 km." },
  komersial: { nama: "Commercial area", arti: "Shops and eateries stand out within 1 km." },
  wisata: { nama: "Tourism and hotels", arti: "Hotels and attractions stand out within 1 km." },
  industri: { nama: "Industrial and warehousing", arti: "Factories, distributors and warehouses stand out within 1 km." },
  pusat_kota: { nama: "City centre", arti: "Very busy and varied: 500 or more places within 1 km." },
  perumahan: { nama: "Residential", arti: "Densely populated (4,000 people per km² or more) with no dominant activity." },
  luar_kota: { nama: "Out of town", arti: "Few businesses and residents nearby; typically an intercity road or rest area." },
  campuran: { nama: "Mixed", arti: "Varied activity nearby with nothing dominant." },
};
