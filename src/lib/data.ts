import { createClient } from "@/lib/supabase/server";
import { supabaseSiap } from "@/lib/supabase/env";

/**
 * Akses data Bright Match. Semua fungsi berjalan di server dan memakai sesi pengguna,
 * jadi hasilnya mengikuti Row Level Security. Kegagalan yang bisa diperkirakan
 * (belum terhubung, skema belum dipasang) dikembalikan sebagai `galat`, bukan dilempar,
 * supaya halaman bisa menampilkan petunjuk yang jelas.
 */
export type Hasil<T> = { data: T; galat?: undefined } | { data?: undefined; galat: Galat };

export type Galat =
  | { jenis: "belum-terhubung" }
  | { jenis: "skema-belum-ada" }
  | { jenis: "lain"; pesan: string };

export type Ringkasan = {
  spbu: number;
  lahan: number;
  lahan_tersewa: number;
  lahan_kosong: number;
  okupansi_pct: number | null;
  kosong_bertarif: number;
  potensi_sewa_bertarif: number;
  spbu_dengan_kosong: number;
  tenant: number;
};

export type Peluang = {
  provinsi: string;
  kota?: string | null;
  spbu: number;
  lahan: number;
  lahan_kosong: number;
  okupansi_pct: number | null;
  kosong_bertarif: number;
  potensi_sewa_bertarif: number;
  spbu_dengan_kosong: number;
};

type GalatPostgrest = { code?: string; message: string };

export function keGalat(error: GalatPostgrest): Galat {
  // PGRST205: tabel atau view tidak ditemukan; PGRST202: fungsi tidak ditemukan; 42P01/42883: sama, dari Postgres.
  if (["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "")) return { jenis: "skema-belum-ada" };
  return { jenis: "lain", pesan: error.message };
}

/**
 * Memanggil fungsi basis data (RPC) yang mengembalikan jsonb. Satu halaman = satu panggilan.
 * Parameter bernilai undefined tidak dikirim, sehingga nilai bawaan fungsi yang dipakai.
 * Hasil null berarti data yang diminta tidak ada.
 */
export async function rpc<T>(fungsi: string, args: Record<string, unknown> = {}): Promise<Hasil<T | null>> {
  if (!supabaseSiap) return { galat: { jenis: "belum-terhubung" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fungsi, args);
  if (error) return { galat: keGalat(error) };
  return { data: (data ?? null) as T | null };
}

export async function getRingkasan(): Promise<Hasil<Ringkasan>> {
  if (!supabaseSiap) return { galat: { jenis: "belum-terhubung" } };
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_ringkasan").select("*").single();
  if (error) return { galat: keGalat(error) };
  return { data: data as Ringkasan };
}

export async function getPeluangProvinsi(): Promise<Hasil<Peluang[]>> {
  if (!supabaseSiap) return { galat: { jenis: "belum-terhubung" } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_peluang_provinsi")
    .select("*")
    .order("lahan_kosong", { ascending: false })
    .order("provinsi");
  if (error) return { galat: keGalat(error) };
  return { data: (data ?? []) as Peluang[] };
}

export async function getPeluangKota(provinsi: string): Promise<Hasil<Peluang[]>> {
  if (!supabaseSiap) return { galat: { jenis: "belum-terhubung" } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_peluang_kota")
    .select("*")
    .eq("provinsi", provinsi)
    .order("lahan_kosong", { ascending: false })
    .order("kota");
  if (error) return { galat: keGalat(error) };
  return { data: (data ?? []) as Peluang[] };
}

/** Email pengguna yang sedang masuk, atau null. */
/** Ruang kerja pengguna dari token masuk: nfr, tenant, atau dealer. null bila token belum memuatnya. */
export async function getRuang(): Promise<"nfr" | "tenant" | "dealer" | null> {
  if (!supabaseSiap) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const ruang = (data?.claims?.app_metadata as { ruang?: unknown } | undefined)?.ruang;
  return ruang === "nfr" || ruang === "tenant" || ruang === "dealer" ? ruang : null;
}

export async function getEmailPengguna(): Promise<string | null> {
  if (!supabaseSiap) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" ? email : null;
}

/** Angka dasbor eksekutif NFR (migrasi 20261127_dasbor). `terealisasi` null = belum ada sumber datanya. */
export type Dasbor = {
  spbu: number;
  lahan: number;
  lahan_tersewa: number;
  lahan_kosong: number;
  kosong_terverifikasi: number;
  kosong_boleh_ditawarkan: number;
  kosong_tertahan_temuan: number;
  kosong_ditahan: number;
  spbu_wewenang_pasti: number;
  peluang_berjalan: number;
  peluang_berakhir: number;
  peluang_terlambat: number;
  peluang_tanpa_pemilik: number;
  peluang_tanpa_tindakan: number;
  peluang_berversi: number;
  peluang_tanpa_versi: number;
  per_tahap: Record<string, number>;
  persetujuan_menunggu: number;
  inspeksi_menunggu: number;
  temuan_kritis: number;
  tanggapan_tenant_7hari: number;
  kontrak_ditandatangani: number;
  outlet_beroperasi: number;
  nilai: {
    perkiraan_tahunan: number;
    perkiraan_lahan: number;
    ditawarkan_tahunan: number;
    ditawarkan_peluang: number;
    terkontrak_tahunan: number;
    terkontrak_masa_sewa: number;
    terealisasi: number | null;
  };
  sumber: { nama: string; per_tanggal: string | null }[];
};

export const getDasbor = () => rpc<Dasbor>("dasbor_nfr");
