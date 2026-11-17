/** Pilihan dan label yang dipakai formulir calon tenant, pipeline, dan kartu penawaran. */

export type Bahasa = "id" | "en";

/** Jenis usaha yang bisa dipilih calon tenant. Nilainya sama dengan kolom lahan.segmen. */
export const JENIS_USAHA: { nilai: string; id: string; en: string }[] = [
  { nilai: "F&B / Kuliner", id: "Makanan & minuman", en: "Food & beverage" },
  { nilai: "Minimarket & Ritel", id: "Minimarket & ritel", en: "Convenience store & retail" },
  { nilai: "Perbankan & ATM", id: "Perbankan & ATM", en: "Banking & ATM" },
  { nilai: "Nitrogen & Perawatan", id: "Perawatan kendaraan", en: "Vehicle care" },
  { nilai: "Logistik & Ekspedisi", id: "Logistik & paket", en: "Logistics & parcel" },
  { nilai: "Kesehatan & Jasa", id: "Kesehatan & jasa pribadi", en: "Health & personal services" },
  { nilai: "Pelumas & Oli", id: "Pelumas & oli", en: "Lubricants" },
  { nilai: "LPG & Bright Gas", id: "LPG & Bright Gas", en: "LPG" },
  { nilai: "Energi Baru (EV/PLTS)", id: "Energi baru (EV, PLTS)", en: "New energy (EV, solar)" },
  { nilai: "Pameran & Promosi", id: "Pameran & promosi", en: "Exhibition & promotion" },
  { nilai: "Lainnya", id: "Lainnya", en: "Other" },
];

export const namaJenisUsaha = (nilai: string | null | undefined, bahasa: Bahasa = "id") =>
  JENIS_USAHA.find((j) => j.nilai === nilai)?.[bahasa] ?? nilai ?? "–";

/** Provinsi yang punya lahan kosong (scraping 3 November 2026). Dipakai formulir publik, yang tidak boleh membaca basis data. */
export const PROVINSI = [
  "Aceh", "Bali", "Banten", "Bengkulu", "DI Yogyakarta", "DKI Jakarta", "Gorontalo", "Jambi", "Jawa Barat", "Jawa Tengah",
  "Jawa Timur", "Kalimantan Barat", "Kalimantan Selatan", "Kalimantan Tengah", "Kalimantan Timur", "Kalimantan Utara",
  "Kep. Bangka Belitung", "Kepulauan Riau", "Lampung", "Maluku", "Maluku Utara", "Nusa Tenggara Barat",
  "Nusa Tenggara Timur", "Papua", "Papua Barat", "Papua Selatan", "Riau", "Sulawesi Barat", "Sulawesi Selatan",
  "Sulawesi Tengah", "Sulawesi Tenggara", "Sulawesi Utara", "Sumatera Barat", "Sumatera Selatan", "Sumatera Utara",
];

export const KANAL: Record<string, string> = {
  formulir: "Formulir Jadi Bright Partner",
  tenant_eksisting: "Tenant eksisting",
  waralaba: "Waralaba",
  umkm_binaan: "UMKM binaan",
  broker: "Broker properti",
  pameran: "Pameran",
  lainnya: "Lainnya",
};

export const STATUS_CALON: Record<string, string> = {
  baru: "Baru",
  dikualifikasi: "Dikualifikasi",
  aktif: "Aktif",
  tidak_lanjut: "Tidak lanjut",
};

/**
 * Dua belas tahap alur komersial, berurutan. Harus sama dengan urutan_tahap() di basis data.
 * `pihak` = siapa yang bergerak di tahap itu.
 */
export const TAHAP = [
  { nilai: "baru", nama: "Dibuat", arti: "Peluang dicatat untuk satu lahan dan satu pihak.", pihak: "NFR" },
  { nilai: "terverifikasi", nama: "Data terverifikasi", arti: "Lahan tersedia dan datanya lolos inspeksi lokasi.", pihak: "NFR" },
  { nilai: "terpilih", nama: "Terpilih", arti: "Masuk daftar pendek dan punya pemilik.", pihak: "NFR" },
  { nilai: "dihubungi", nama: "Dihubungi", arti: "Sudah ada kontak pertama dengan calon.", pihak: "NFR" },
  { nilai: "berminat", nama: "Minat dikonfirmasi", arti: "Calon menyatakan berminat. Belum mengikat.", pihak: "Tenant" },
  { nilai: "survei", nama: "Survei lokasi", arti: "Calon meninjau lahan di SPBU.", pihak: "Tenant, SPBU" },
  { nilai: "penawaran", nama: "Penawaran", arti: "Versi penawaran resmi sudah diterbitkan.", pihak: "NFR" },
  { nilai: "negosiasi", nama: "Negosiasi", arti: "Syarat komersial sedang dibahas.", pihak: "NFR, tenant" },
  { nilai: "persetujuan", nama: "Persetujuan", arti: "Menunggu keputusan NFR, SPBU, tenant, dan HSSE.", pihak: "Semua pihak" },
  { nilai: "kontrak", nama: "Tanda tangan kontrak", arti: "Semua pihak setuju; kontrak sedang ditandatangani.", pihak: "NFR, tenant, SPBU" },
  { nilai: "aktivasi", nama: "Persiapan dan aktivasi", arti: "Kontrak ditandatangani; outlet disiapkan.", pihak: "Tenant, SPBU" },
  { nilai: "pemantauan", nama: "Pemantauan kinerja", arti: "Outlet beroperasi dan dipantau.", pihak: "NFR" },
] as const;

/** Hasil akhir selain kontrak. Semuanya wajib beralasan dan bisa dibuka kembali. */
export const HASIL = [
  { nilai: "menolak", nama: "Tenant menolak", arti: "Calon tenant menolak penawaran." },
  { nilai: "ditarik", nama: "Ditarik", arti: "Calon tenant menarik minatnya." },
  { nilai: "ditolak", nama: "Ditolak", arti: "NFR atau pemilik SPBU menolak calon ini." },
  { nilai: "kalah", nama: "Kalah", arti: "Calon memilih lokasi lain." },
  { nilai: "batal", nama: "Dibatalkan", arti: "Peluang dibatalkan karena sebab lain." },
] as const;

export const tahapBerakhir = (t: string) => HASIL.some((h) => h.nilai === t);

export const namaTahap = (t: string) =>
  TAHAP.find((x) => x.nilai === t)?.nama ?? HASIL.find((x) => x.nilai === t)?.nama ?? t;

export const PIHAK_SETUJU: Record<string, string> = {
  nfr: "Pertamina NFR",
  dealer: "Pemilik atau pengelola SPBU",
  tenant: "Calon tenant",
  hsse: "HSSE",
};

export const STATUS_SETUJU: Record<string, string> = {
  menunggu: "Menunggu keputusan",
  disetujui: "Disetujui",
  minta_revisi: "Minta revisi",
  ditolak: "Ditolak",
};

export const SKEMA: Record<string, string> = { sewa_tetap: "Sewa tetap", bagi_hasil: "Bagi hasil", campuran: "Sewa tetap dan bagi hasil" };

export const PENERIMA_SEWA: Record<string, string> = {
  belum_dipastikan: "Belum dipastikan",
  pertamina: "Pertamina",
  pemilik_spbu: "Pemilik SPBU",
  dibagi: "Dibagi Pertamina dan pemilik SPBU",
};

export const STATUS_VERSI: Record<string, string> = { draf: "Draf", diterbitkan: "Berlaku", digantikan: "Digantikan" };

export const PIHAK: Record<string, string> = {
  tenant: "Calon tenant",
  spbu: "Pemilik atau pengelola SPBU",
  pertamina: "Pertamina",
};

export const POSISI: Record<string, { id: string; en: string }> = {
  bebas: { id: "Dalam atau luar bangunan", en: "Indoor or outdoor" },
  dalam: { id: "Di dalam bangunan", en: "Indoor" },
  luar: { id: "Di luar bangunan", en: "Outdoor" },
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
