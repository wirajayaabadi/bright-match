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
export async function getEmailPengguna(): Promise<string | null> {
  if (!supabaseSiap) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" ? email : null;
}
