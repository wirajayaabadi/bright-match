import { rpc } from "@/lib/data";
import type { Lingkungan, Pasangan, Wilayah } from "@/lib/data-tahap1";
import type { TipeLokasi } from "@/lib/tipe-lokasi";

/** Kueri tahap 3: calon tenant, pipeline peluang, dan kartu penawaran. */

export type CalonTenant = {
  id: string;
  token: string;
  nama_usaha: string;
  segmen: string;
  deskripsi: string | null;
  target_pasar: string | null;
  asal: "lokal" | "internasional";
  negara: string | null;
  jumlah_gerai: number | null;
  kanal: string;
  kontak_nama: string;
  kontak_email: string | null;
  kontak_telepon: string | null;
  luas_min: number | null;
  luas_maks: number | null;
  posisi: "dalam" | "luar" | "bebas";
  daya_min: number | null;
  anggaran_tahunan: number | null;
  provinsi_minat: string[];
  catatan: string | null;
  bahasa: "id" | "en";
  status: string;
  dibuat: string;
  dibuat_oleh: string;
};

export type BarisCalon = Pick<
  CalonTenant,
  "id" | "nama_usaha" | "segmen" | "asal" | "negara" | "kanal" | "status" | "kontak_nama" | "provinsi_minat" | "dibuat"
> & { peluang: number };

export const getDaftarCalon = (p: { cari?: string; status?: string; halaman?: number }) =>
  rpc<{ total: number; baris: BarisCalon[] }>("calon_daftar", { p_cari: p.cari, p_status: p.status, p_halaman: p.halaman });

export type PeluangRingkas = {
  id: string;
  lahan_id: string;
  lahan_kode: string;
  spbu_nomor: string;
  kota: string | null;
  tahap: string;
  skor: number | null;
  diubah: string;
};

export type KecocokanCalon = { calon: CalonTenant; wilayah: Wilayah; peluang: PeluangRingkas[]; lahan: Pasangan[] };

export const getKecocokanCalon = (id: string, p: { provinsi?: string; kota?: string }) =>
  rpc<KecocokanCalon>("kecocokan_calon", { p_id: id, p_provinsi: p.provinsi, p_kota: p.kota });

/** Hasil untuk pendaftar formulir publik (dipanggil tanpa login, dengan token). */
export type HasilCalon = {
  calon: Pick<CalonTenant, "nama_usaha" | "segmen" | "provinsi_minat" | "luas_min" | "luas_maks" | "posisi" | "anggaran_tahunan" | "bahasa">;
  jumlah: number;
  lahan: {
    kode: string;
    spbu_nomor: string;
    kota: string | null;
    provinsi: string;
    luas_m2: number | null;
    posisi: string | null;
    daya_w: number | null;
    tarif_tahunan: number | null;
    tipe_lokasi: TipeLokasi | null;
    skor: number;
  }[];
};

export const getHasilCalon = (token: string) => rpc<HasilCalon>("hasil_calon", { p_token: token });

// ------------------------------------------------------------------ pipeline

export type BarisPeluang = {
  id: string;
  lahan_id: string;
  lahan_kode: string;
  spbu_id: string;
  spbu_nomor: string;
  kota: string | null;
  provinsi: string | null;
  segmen: string | null;
  skor: number | null;
  tahap: string;
  pemilik: string | null;
  dibuat: string;
  diubah: string;
  jenis_pihak: "calon" | "tenant";
  pihak: string;
  syarat_terpenuhi: number;
  syarat_total: number;
};

export type DaftarPeluang = { total: number; per_tahap: Record<string, number>; baris: BarisPeluang[] };

export const getDaftarPeluang = (p: { tahap?: string; cari?: string; halaman?: number }) =>
  rpc<DaftarPeluang>("peluang_daftar", { p_tahap: p.tahap, p_cari: p.cari, p_halaman: p.halaman });

export type Syarat = {
  id: number;
  pihak: "tenant" | "spbu" | "pertamina";
  urut: number;
  butir: string;
  terpenuhi: boolean;
  diubah: string | null;
  diubah_oleh: string | null;
};

export type PeluangRinci = {
  peluang: {
    id: string;
    lahan_id: string;
    lahan_kode: string;
    spbu_id: string;
    spbu_nomor: string;
    kota: string | null;
    provinsi: string | null;
    calon_id: string | null;
    tenant_kunci: string | null;
    tenant_nama: string | null;
    segmen: string | null;
    skor: number | null;
    tahap: string;
    catatan: string | null;
    pemilik: string | null;
    dibuat: string;
    diubah: string;
  };
  calon: CalonTenant | null;
  tenant: { id: string; nama: string; segmen_utama: string; spbu: number; lahan: number } | null;
  lahan: {
    status: string;
    luas_m2: number | null;
    daya_w: number | null;
    tarif_tahunan: number | null;
    posisi: string | null;
    lantai: string | null;
    alamat: string | null;
  } | null;
  syarat: Syarat[];
  riwayat: { tahap_dari: string | null; tahap_ke: string; oleh: string | null; catatan: string | null; waktu: string }[];
};

export const getPeluang = (id: string) => rpc<PeluangRinci>("peluang_rinci", { p_id: id });

// ------------------------------------------------------------------ kartu penawaran

export type Penawaran = {
  lahan: {
    lahan_id: string;
    kode: string;
    luas_m2: number | null;
    kelas: string | null;
    panjang_m: number | null;
    lebar_m: number | null;
    tinggi_m: number | null;
    daya_w: number | null;
    posisi: string | null;
    lantai: string | null;
    tarif_tahunan: number | null;
    tarif_per_m2: number | null;
  };
  spbu: {
    id: string;
    nomor: string;
    alamat: string | null;
    kota: string | null;
    provinsi: string;
    lat: number | null;
    lng: number | null;
    fasilitas: string[];
    jumlah_foto: number;
  };
  ringkasan: { lahan: number; lahan_tersewa: number; lahan_kosong: number };
  jenis_usaha_ada: string[];
  lingkungan: Lingkungan | null;
  poi: { nama: string; jenis: string; jarak_m: number }[];
  pihak: Pasangan | null;
  nama_pihak: string | null;
};

export const getPenawaran = (lahanId: string, p: { tenant?: string; calon?: string }) =>
  rpc<Penawaran>("penawaran", { p_lahan_id: lahanId, p_tenant_id: p.tenant, p_calon_id: p.calon });
