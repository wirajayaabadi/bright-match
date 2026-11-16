import { rpc } from "@/lib/data";
import type { TipeLokasi } from "@/lib/tipe-lokasi";

/**
 * Kueri tahap 1: Profil lokasi, Profil tenant, dan Mesin kecocokan.
 * Setiap fungsi memanggil satu fungsi basis data di supabase/migrations/…_tahap1.sql.
 */

// ------------------------------------------------------------------ wilayah

export type Wilayah = { provinsi: string; kota: string[] }[];

export const getWilayah = () => rpc<Wilayah>("wilayah");

// ------------------------------------------------------------------ profil lokasi

export type BarisSpbu = {
  id: string;
  nomor: string;
  nama: string;
  alamat: string | null;
  kota: string | null;
  provinsi: string;
  tipe_lokasi: TipeLokasi | null;
  lahan: number;
  lahan_kosong: number;
  tenant: number;
  potensi_sewa_bertarif: number;
};

export type DaftarSpbu = { total: number; baris: BarisSpbu[] };

export const getDaftarSpbu = (p: {
  cari?: string;
  provinsi?: string;
  kota?: string;
  hanyaKosong?: boolean;
  tipe?: string;
  halaman?: number;
}) =>
  rpc<DaftarSpbu>("daftar_spbu", {
    p_cari: p.cari,
    p_provinsi: p.provinsi,
    p_kota: p.kota,
    p_hanya_kosong: p.hanyaKosong,
    p_tipe: p.tipe,
    p_halaman: p.halaman,
  });

/** Fitur lingkungan satu SPBU dari data terbuka (tahap 2). Null bila koordinatnya tidak bisa dipakai. */
export type Lingkungan = {
  spbu_id: string;
  tipe_lokasi: TipeLokasi;
  tipe_kedua: TipeLokasi | null;
  poi_500m: number;
  poi_1km: number;
  kampus_1km: number;
  sekolah_1km: number;
  kantor_1km: number;
  belanja_1km: number;
  kuliner_1km: number;
  wisata_1km: number;
  industri_1km: number;
  kesehatan_1km: number;
  transportasi_1km: number;
  minimarket_500m: number;
  fnb_500m: number;
  bank_500m: number;
  otomotif_500m: number;
  logistik_500m: number;
  apotek_500m: number;
  minimarket_1km: number;
  spbu_lain_1km: number;
  ev_1km: number;
  penduduk_km2: number;
  penduduk_3km: number;
  pct_penduduk: number;
  pct_aktivitas: number;
  sumber_tempat: string;
  sumber_penduduk: string;
  dihitung: string;
};

export type LahanSpbu = {
  lahan_id: string;
  kode: string;
  status: "Tersedia" | "Tersewa";
  segmen: string;
  luas_m2: number | null;
  daya_w: number | null;
  tarif_tahunan: number | null;
  posisi: string | null;
  lantai: string | null;
  deskripsi: string | null;
  tenant: string | null;
  tenant_id: string | null;
  kontrak_akhir: string | null;
};

export type ProfilSpbu = {
  spbu: {
    id: string;
    nomor: string;
    nama: string;
    alamat: string | null;
    kota: string | null;
    provinsi: string;
    lat: number | null;
    lng: number | null;
    fasilitas: string[];
    jumlah_foto: number;
    punya_tur_360: boolean;
  };
  ringkasan: {
    lahan: number;
    lahan_kosong: number;
    lahan_tersewa: number;
    tenant: number;
    potensi_sewa_bertarif: number;
  };
  lahan: LahanSpbu[];
  area: { nama: string; kategori: string | null; keterangan: string | null; jarak_km: number | null }[];
  bauran_kota: { spbu_di_kota: number; segmen: { segmen: string; spbu: number; ada: boolean }[] };
  lingkungan: Lingkungan | null;
  poi: { nama: string; jenis: string; jarak_m: number }[];
};

export const getProfilSpbu = (id: string) => rpc<ProfilSpbu>("profil_spbu", { p_id: id });

// ------------------------------------------------------------------ profil tenant

export type TenantProfil = {
  id: string;
  nama: string;
  segmen_utama: string;
  lahan: number;
  spbu: number;
  kota: number;
  provinsi: number;
  lahan_dalam: number;
  lahan_luar: number;
  luas_p10: number | null;
  luas_median: number | null;
  luas_p90: number | null;
  daya_median: number | null;
  tarif_median: number | null;
  tarif_p90: number | null;
  lahan_bertarif: number;
  kontrak_lewat: number;
  kontrak_segera: number;
  kontrak_akhir_berikutnya: string | null;
};

export type DaftarTenant = { total: number; segmen: string[]; baris: TenantProfil[] };

export const getDaftarTenant = (p: { cari?: string; segmen?: string; provinsi?: string; halaman?: number }) =>
  rpc<DaftarTenant>("daftar_tenant", {
    p_cari: p.cari,
    p_segmen: p.segmen,
    p_provinsi: p.provinsi,
    p_halaman: p.halaman,
  });

export type ProfilTenant = {
  tenant: TenantProfil;
  segmen: { segmen: string; lahan: number }[];
  provinsi: { provinsi: string; lahan: number; spbu: number; kota: number }[];
  kota: { kota: string | null; provinsi: string; lahan: number }[];
  kontrak: {
    kode: string;
    lahan_id: string;
    spbu_id: string;
    spbu_nomor: string;
    kota: string | null;
    segmen: string;
    kontrak_akhir: string;
    tarif_tahunan: number | null;
  }[];
};

export const getProfilTenant = (id: string) => rpc<ProfilTenant>("profil_tenant", { p_id: id });

// ------------------------------------------------------------------ mesin kecocokan

export type LahanKosong = {
  lahan_id: string;
  kode: string;
  spbu_id: string;
  spbu_nomor: string;
  kota: string | null;
  provinsi: string;
  luas_m2: number | null;
  daya_w: number | null;
  tarif_tahunan: number | null;
  posisi: string | null;
  lantai: string | null;
};

export type DaftarLahanKosong = { total: number; baris: LahanKosong[] };

export const getDaftarLahanKosong = (p: { provinsi?: string; kota?: string; halaman?: number }) =>
  rpc<DaftarLahanKosong>("daftar_lahan_kosong", { p_provinsi: p.provinsi, p_kota: p.kota, p_halaman: p.halaman });

/** Satu pasangan (lahan kosong, tenant) beserta syarat dan poin skornya. */
export type Pasangan = LahanKosong & {
  tenant_id: string;
  tenant: string;
  segmen: string;
  tenant_lahan: number;
  tenant_spbu: number;
  lahan_di_kota: number;
  lahan_di_provinsi: number;
  tingkat: "kota" | "provinsi";
  n_segmen: number;
  n_pembanding: number;
  segmen_sudah_ada: boolean;
  luas_ok: boolean | null;
  daya_ok: boolean | null;
  tarif_ok: boolean | null;
  tenant_luas_p10: number | null;
  tenant_luas_p90: number | null;
  tenant_tarif_median: number | null;
  tenant_tarif_p90: number | null;
  // lingkungan (null bila SPBU tidak punya data lingkungan)
  tipe_lokasi: TipeLokasi | null;
  lift_tipe: number | null;
  pct_di_tipe: number | null;
  pct_semua: number | null;
  penduduk_3km: number | null;
  poi_1km: number | null;
  sejenis_500m: number | null;
  poin_jaringan: number;
  poin_pelengkap: number;
  poin_harga: number;
  poin_kesiapan: number;
  poin_tipe: number;
  poin_permintaan: number;
  skor: number;
  jumlah_kandidat: number;
};

export type JenisUsaha = {
  tingkat: "kota" | "provinsi";
  segmen: string;
  n: number;
  total: number;
  sudah_ada: boolean;
  lift_tipe: number | null;
  pct_di_tipe: number | null;
  pct_semua: number | null;
};

export type KecocokanLahan = {
  lahan: LahanKosong & { alamat: string | null; deskripsi: string | null; kelas: string | null };
  lingkungan: Lingkungan | null;
  jenis_usaha: JenisUsaha[];
  tenant: Pasangan[];
};

export const getKecocokanLahan = (lahanId: string) =>
  rpc<KecocokanLahan>("kecocokan_lahan", { p_lahan_id: lahanId });

export type KecocokanTenant = { tenant: TenantProfil; wilayah: Wilayah; lahan: Pasangan[] };

export const getKecocokanTenant = (tenantId: string, p: { provinsi?: string; kota?: string }) =>
  rpc<KecocokanTenant>("kecocokan_tenant", { p_tenant_id: tenantId, p_provinsi: p.provinsi, p_kota: p.kota });
