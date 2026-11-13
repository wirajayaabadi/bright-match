/**
 * Peta sekitar SPBU: titik tempat Overture Maps dalam 1 km, disiapkan oleh scripts/eksternal/peta_tempat.py.
 * Berkas ini aman dipakai di peramban (tanpa akses data).
 */

/** [meter ke timur, meter ke utara, indeks KELOMPOK_PETA, nama]. Urut dari yang terdekat. */
export type TitikPeta = [dx: number, dy: number, kelompok: number, nama: string];

export type PetaSpbu = {
  nomor: string;
  lat: number;
  lng: number;
  jumlah: number;
  titik: TitikPeta[];
  /** Misalnya "Overture Maps 2026-10-21.0". */
  sumber: string | null;
};

/**
 * Rumpun = warna di peta. Hanya tiga yang berwarna: pada peta sebar, lebih dari tiga warna tidak lagi
 * bisa dibedakan dengan andal, terutama bagi pembaca buta warna. Rincian per kelompok dilihat dengan
 * menyorot kelompoknya. Ketiga warna lolos uji semua-pasangan (skill dataviz, validate_palette.js).
 */
export const RUMPUN = {
  makan: { nama: "Tempat makan dan minum", warna: "#2a78d6" },
  belanja: { nama: "Pertokoan dan pasar", warna: "#eb6834" },
  kegiatan: { nama: "Pusat kegiatan", warna: "#1baf7a" },
  spbu: { nama: "SPBU lain", warna: "#101828" },
  lain: { nama: "Lainnya", warna: "#667085" },
} as const;

export type Rumpun = keyof typeof RUMPUN;

/** Urutan = kode yang disimpan di basis data. Jangan diubah tanpa mengubah scripts/eksternal/peta_tempat.py. */
export const KELOMPOK_PETA: readonly { kunci: string; nama: string; rumpun: Rumpun }[] = [
  { kunci: "kuliner", nama: "Tempat makan", rumpun: "makan" },
  { kunci: "belanja", nama: "Pertokoan", rumpun: "belanja" },
  { kunci: "kantor", nama: "Perkantoran", rumpun: "kegiatan" },
  { kunci: "pendidikan", nama: "Sekolah & kampus", rumpun: "kegiatan" },
  { kunci: "kesehatan", nama: "Kesehatan", rumpun: "kegiatan" },
  { kunci: "wisata", nama: "Hotel & wisata", rumpun: "kegiatan" },
  { kunci: "industri", nama: "Industri & gudang", rumpun: "kegiatan" },
  { kunci: "transportasi", nama: "Stasiun, terminal, bandara", rumpun: "kegiatan" },
  { kunci: "spbu", nama: "SPBU lain", rumpun: "spbu" },
  { kunci: "lain", nama: "Lainnya", rumpun: "lain" },
];

/** Urutan gambar: yang disebut belakangan digambar di atas. */
export const LAPIS_RUMPUN: Rumpun[] = ["lain", "kegiatan", "belanja", "makan", "spbu"];

export const RADIUS_PETA = [500, 1000] as const;
export type RadiusPeta = (typeof RADIUS_PETA)[number];

/** Peta dasar. Bisa diganti ke penyedia berbayar lewat NEXT_PUBLIC_PETA_UBIN tanpa mengubah kode. */
export const UBIN_PETA = process.env.NEXT_PUBLIC_PETA_UBIN || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATRIBUSI_UBIN =
  process.env.NEXT_PUBLIC_PETA_ATRIBUSI ||
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
