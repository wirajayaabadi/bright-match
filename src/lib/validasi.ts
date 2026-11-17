/** Pusat validasi data: jenis temuan, artinya bagi bisnis, dan langkah yang disarankan. */

export type Tingkat = "kritis" | "sedang" | "rendah";
export type StatusMasalah = "terbuka" | "ditinjau" | "selesai" | "diabaikan";

export const JENIS_MASALAH: Record<string, { nama: string; arti: string; dampak: string; tindakan: string }> = {
  kode_dobel: {
    nama: "Kode lahan dipakai ganda",
    arti: "Satu kode lahan dipakai oleh beberapa lahan di SPBU yang sama.",
    dampak:
      "Kontrak di file master ditautkan lewat kode lahan, jadi tidak bisa dipastikan kontrak itu milik lahan yang mana. Lahan kosong di kelompok ini bisa saja sebenarnya sudah terikat kontrak.",
    tindakan:
      "Pastikan ke pengelola SPBU lahan mana yang benar-benar kosong, lalu minta kode lahan di Brightspace dirapikan agar satu kode hanya untuk satu lahan.",
  },
  kosong_kontrak_aktif: {
    nama: "Kosong, tetapi kontrak masih berjalan",
    arti: "Brightspace mencatat lahan ini kosong, sedangkan file master mencatat kontrak yang belum berakhir.",
    dampak: "Bila lahan ditawarkan padahal masih terikat kontrak, penawaran bisa berbenturan dengan hak tenant yang ada.",
    tindakan: "Pastikan mana yang benar: kontraknya sudah diakhiri, atau status di Brightspace belum diperbarui.",
  },
  tersewa_tanpa_kontrak: {
    nama: "Tersewa, tetapi kontrak tidak ditemukan",
    arti: "Brightspace mencatat lahan ini tersewa, sedangkan kontraknya tidak ada di file master.",
    dampak: "Nilai sewa dan masa kontrak lahan ini tidak tercatat, jadi tidak ikut dalam hitungan pendapatan dan perpanjangan.",
    tindakan: "Cari kontraknya di wilayah terkait, lalu lengkapi file master.",
  },
  kontrak_lewat: {
    nama: "Kontrak sudah lewat tanggal",
    arti: "Lahan masih tersewa di Brightspace, tetapi masa kontrak di file master sudah berakhir.",
    dampak: "Tenant mungkin masih beroperasi tanpa perpanjangan tercatat, atau lahannya sebenarnya sudah kosong.",
    tindakan: "Pastikan apakah kontrak sudah diperpanjang. Bila belum, ini momen menawarkan perpanjangan atau mencari tenant baru.",
  },
  lahan_id_dobel: {
    nama: "Lahan muncul dua kali",
    arti: "Satu lahan muncul lebih dari sekali di Brightspace.",
    dampak: "Tanpa dirapikan, lahan terhitung ganda. Bright Match hanya menghitung kemunculan pertama.",
    tindakan: "Minta entri ganda di Brightspace dihapus.",
  },
  tarif_tak_wajar: {
    nama: "Harga di luar rentang wajar",
    arti: "Harga lahan kosong tercatat, tetapi nilainya di luar rentang yang masuk akal untuk luasnya.",
    dampak: "Lahan ini tidak punya tarif acuan, jadi tidak ikut hitungan potensi sewa dan lemah di Mesin kecocokan.",
    tindakan: "Periksa apakah harga tertukar antara bulanan dan tahunan, atau salah ketik angka.",
  },
  luas_tak_valid: {
    nama: "Luas tidak bisa dipakai",
    arti: "Luas lahan kosong tercatat nol atau tidak diisi.",
    dampak: "Tanpa luas, lahan tidak bisa dicocokkan dengan kebutuhan ruang tenant.",
    tindakan: "Ukur ulang atau minta pengelola SPBU mengisi luas lahan di Brightspace.",
  },
  spbu_tanpa_koordinat: {
    nama: "SPBU tanpa koordinat",
    arti: "SPBU ini tidak punya koordinat di Brightspace.",
    dampak: "Tidak ada peta, data lingkungan, maupun tipe lokasi, sehingga skor kecocokan lahannya kehilangan dua komponen.",
    tindakan: "Lengkapi koordinat SPBU di Brightspace.",
  },
  spbu_tanpa_kota: {
    nama: "SPBU tanpa nama kota",
    arti: "Nama kota SPBU ini tidak tercatat.",
    dampak: "SPBU ini tidak ikut perbandingan sekota di Profil lokasi dan Mesin kecocokan.",
    tindakan: "Lengkapi kota SPBU di Brightspace.",
  },
};

export const namaJenisMasalah = (j: string) => JENIS_MASALAH[j]?.nama ?? j;

export const TINGKAT: Record<Tingkat, { nama: string; arti: string }> = {
  kritis: { nama: "Kritis", arti: "Menahan penawaran resmi sampai diputuskan" },
  sedang: { nama: "Sedang", arti: "Melemahkan data, tidak menahan penawaran" },
  rendah: { nama: "Rendah", arti: "Perlu dirapikan saat ada kesempatan" },
};

export const STATUS_MASALAH: Record<StatusMasalah, string> = {
  terbuka: "Belum ditinjau",
  ditinjau: "Sedang ditinjau",
  selesai: "Selesai",
  diabaikan: "Diabaikan",
};

/** Pilihan saringan status di daftar. "belum" dan "diputuskan" menggabungkan dua status. */
export const SARING_STATUS = [
  { nilai: "belum", label: "Belum diputuskan" },
  { nilai: "terbuka", label: "Belum ditinjau" },
  { nilai: "ditinjau", label: "Sedang ditinjau" },
  { nilai: "diputuskan", label: "Sudah diputuskan" },
  { nilai: "semua", label: "Semua status" },
] as const;

export const PERISTIWA: Record<string, string> = {
  masalah_ditinjau: "Mulai ditinjau",
  masalah_diputuskan: "Keputusan disimpan",
  masalah_dibuka_kembali: "Dibuka kembali",
};

export type SumberData = { kunci: string; nama: string; keterangan: string | null; per_tanggal: string | null };

export type BarisMasalah = {
  id: number;
  jenis: string;
  tingkat: Tingkat;
  entitas: "lahan" | "spbu";
  spbu_id: string;
  spbu_nomor: string;
  kota: string | null;
  provinsi: string | null;
  lahan_kode: string | null;
  ada_lahan_kosong: boolean;
  ringkasan: string;
  status: StatusMasalah;
  peninjau_email: string | null;
  terakhir_terdeteksi: string;
  diputuskan: string | null;
};

export type DaftarMasalah = { total: number; baris: BarisMasalah[] };

export type RingkasanMasalah = {
  per_jenis: { jenis: string; belum: number; kritis: number; diputuskan: number; total: number }[];
  kritis_belum: number;
  belum: number;
  diputuskan: number;
  lahan_kosong_tertahan: number;
  lahan_kosong: number;
  terakhir_diperiksa: string | null;
  sumber: SumberData[];
};

export type RekamanLahan = {
  lahan_id: string;
  kode: string;
  status: string;
  outlet: string | null;
  segmen: string | null;
  luas_m2: number | null;
  daya_w: number | null;
  harga: number | null;
  periode: string | null;
  tarif_tahunan: number | null;
  posisi: string | null;
};

export type KontrakMaster = {
  tenant: string;
  mulai: string | null;
  akhir: string | null;
  nilai: number | null;
  status: string | null;
  baris: number | null;
};

export type RincianMasalah = BarisMasalah & {
  lahan_ids: string[];
  bukti: {
    rekaman?: RekamanLahan[];
    kontrak?: KontrakMaster | null;
    spbu?: { id: string; nomor: string; nama: string; alamat: string | null; kota: string | null; provinsi: string | null };
  };
  keputusan: string | null;
  diputuskan_oleh: string | null;
  pertama_terdeteksi: string;
  dibuka_kembali: string | null;
  sumber: SumberData[];
  riwayat: { waktu: string; oleh: string | null; peristiwa: string; data: { alasan?: string; status_dari?: string; status_ke?: string } }[];
  peluang: { id: string; lahan_kode: string; tahap: string; pihak: string | null }[];
};

export type MasalahLahan = { id: number; jenis: string; tingkat: Tingkat; ringkasan: string; status: StatusMasalah };

export const PERAN: Record<string, string> = {
  nfr_admin: "Admin NFR",
  nfr_analis: "Analis komersial NFR",
  nfr_penyetuju: "Penyetuju NFR",
  auditor: "Auditor (hanya membaca)",
  tenant_admin: "Admin tenant",
  tenant_perwakilan: "Perwakilan tenant",
  dealer_admin: "Admin dealer",
  dealer_operator: "Operator SPBU",
};

export type ProfilSaya = {
  email: string | null;
  peran_nfr: string | null;
  keanggotaan: { organisasi: string; jenis: "nfr" | "tenant" | "dealer"; peran: string; demo: boolean }[];
};

/** true bila peran boleh mengubah data kerja NFR (auditor hanya membaca). */
export const bolehUbah = (p: ProfilSaya | null | undefined) =>
  p?.peran_nfr === "nfr_admin" || p?.peran_nfr === "nfr_analis" || p?.peran_nfr === "nfr_penyetuju";
