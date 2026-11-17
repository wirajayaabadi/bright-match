import type { Gambar } from "@/lib/gambar";

/** Tiga status lahan yang berdiri sendiri, dan inspeksi kesiapan lokasi (migrasi 20261122_status_lahan). */

export const STATUS_RUANG: Record<string, { nama: string; arti: string }> = {
  tersedia: { nama: "Tersedia", arti: "Kosong menurut Brightspace dan tidak sedang ditahan." },
  ditahan: { nama: "Ditahan", arti: "Kosong, tetapi sementara tidak ditawarkan." },
  tidak_tersedia: { nama: "Tidak tersedia", arti: "Ditandai tim tidak bisa disewakan." },
  terisi: { nama: "Terisi", arti: "Sudah tersewa menurut Brightspace." },
};

export const STATUS_DATA: Record<string, { nama: string; arti: string }> = {
  belum_diverifikasi: { nama: "Belum diverifikasi", arti: "Belum ada inspeksi lokasi yang ditinjau dan diterima." },
  terverifikasi: { nama: "Terverifikasi", arti: "Inspeksi lokasi sudah ditinjau dan diterima." },
  disengketakan: { nama: "Disengketakan", arti: "Ada temuan data kritis yang belum diputuskan." },
  ditolak: { nama: "Ditolak", arti: "Data lahan ini dinyatakan tidak benar." },
};

export const KESIAPAN: Record<string, { nama: string; arti: string }> = {
  belum_diketahui: { nama: "Belum diketahui", arti: "Belum pernah diperiksa di lokasi." },
  perlu_inspeksi: { nama: "Perlu inspeksi", arti: "Inspeksi sedang berjalan atau harus diulang." },
  siap: { nama: "Siap", arti: "Menurut inspeksi, lahan bisa langsung dipakai." },
  belum_siap: { nama: "Belum siap", arti: "Menurut inspeksi, masih perlu pekerjaan sebelum dipakai." },
};

export const STATUS_INSPEKSI: Record<string, string> = {
  draf: "Draf",
  diajukan: "Menunggu tinjauan",
  diterima: "Diterima",
  ditolak: "Perlu diperbaiki",
};

export const SARING_INSPEKSI = [
  { nilai: "berjalan", label: "Sedang berjalan" },
  { nilai: "diajukan", label: "Menunggu tinjauan" },
  { nilai: "draf", label: "Draf" },
  { nilai: "ditolak", label: "Perlu diperbaiki" },
  { nilai: "diterima", label: "Diterima" },
  { nilai: "semua", label: "Semua status" },
] as const;

export const PILIHAN = {
  air: [
    { nilai: "tersedia", label: "Tersedia" },
    { nilai: "perlu_sambungan", label: "Perlu sambungan baru" },
    { nilai: "tidak_ada", label: "Tidak ada" },
  ],
  akses: [
    { nilai: "mudah", label: "Mudah" },
    { nilai: "terbatas", label: "Terbatas" },
    { nilai: "tidak_bisa", label: "Tidak bisa" },
  ],
  parkir: [
    { nilai: "cukup", label: "Cukup" },
    { nilai: "terbatas", label: "Terbatas" },
    { nilai: "tidak_ada", label: "Tidak ada" },
  ],
  pembatasan: [
    { nilai: "tidak_ada", label: "Tidak ada" },
    { nilai: "ada", label: "Ada" },
  ],
  hasil: [
    { nilai: "siap", label: "Siap dipakai" },
    { nilai: "belum_siap", label: "Belum siap" },
  ],
} as const;

export const labelPilihan = (kelompok: keyof typeof PILIHAN, nilai: string | null | undefined) =>
  PILIHAN[kelompok].find((p) => p.nilai === nilai)?.label ?? "Belum diisi";

export type IsiInspeksi = {
  panjang_m?: number;
  lebar_m?: number;
  luas_m2?: number;
  daya_w?: number;
  air?: string;
  akses?: string;
  parkir?: string;
  pembatasan?: string;
  pembatasan_rinci?: string;
  infrastruktur?: string;
  perubahan?: string;
  catatan?: string;
};

export type Boleh = { boleh: boolean; kode: string; alasan: string | null };

export type RingkasInspeksi = {
  id: string;
  status: string;
  hasil: string | null;
  pemeriksa_email: string | null;
  diubah: string;
  diajukan: string | null;
  ditinjau: string | null;
  peninjau_email: string | null;
};

export type StatusLahan = {
  lahan_id: string;
  spbu_id: string;
  kode: string;
  status_sumber: string;
  status_ruang: string;
  alasan_ruang: string | null;
  status_data: string;
  verifikasi_usang: boolean;
  kesiapan: string;
  pembatasan: string | null;
  inspeksi_id: string | null;
  diverifikasi: string | null;
  diverifikasi_oleh: string | null;
  konfirmasi_dealer: "tersedia" | "tidak_tersedia" | null;
  konfirmasi_dealer_waktu: string | null;
  konfirmasi_dealer_oleh: string | null;
  boleh: Boleh | null;
  inspeksi: RingkasInspeksi[];
};

export type FotoInspeksi = Gambar & { id: string };

export type RincianInspeksi = {
  id: string;
  spbu_id: string;
  lahan_id: string;
  lahan_kode: string;
  spbu_nomor: string;
  status: string;
  isi: IsiInspeksi;
  hasil: string | null;
  pemeriksa_email: string | null;
  dibuat: string;
  diubah: string;
  diajukan: string | null;
  peninjau_email: string | null;
  ditinjau: string | null;
  catatan_tinjau: string | null;
  milik_saya: boolean;
  kurang: string[];
  foto: FotoInspeksi[];
  lahan: {
    status: string;
    luas_m2: number | null;
    daya_w: number | null;
    panjang_m: number | null;
    lebar_m: number | null;
    posisi: string | null;
    lantai: string | null;
    tarif_tahunan: number | null;
    kota: string | null;
    provinsi: string | null;
    alamat: string | null;
  } | null;
  status_lahan?: StatusLahan | null;
};

export type BarisInspeksi = RingkasInspeksi & {
  lahan_id: string;
  lahan_kode: string;
  spbu_id: string;
  spbu_nomor: string;
  foto: number;
};

export type DaftarInspeksi = {
  total: number;
  baris: BarisInspeksi[];
  ringkasan: { lahan_kosong: number; terverifikasi: number; siap: number; menunggu: number };
};
