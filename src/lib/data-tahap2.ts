import { type Hasil, keGalat, rpc } from "@/lib/data";
import { supabaseSiap } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { TipeLokasi } from "@/lib/tipe-lokasi";

/** Kueri tahap 2: peluang per tipe lokasi dan statistik Playbook jenis usaha. */

export type PeluangTipe = {
  tipe_lokasi: TipeLokasi;
  spbu: number;
  lahan: number;
  lahan_kosong: number;
  okupansi_pct: number | null;
  potensi_sewa_bertarif: number;
  penduduk_3km_rata: number | null;
};

export async function getPeluangTipe(): Promise<Hasil<PeluangTipe[]>> {
  if (!supabaseSiap) return { galat: { jenis: "belum-terhubung" } };
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_peluang_tipe").select("*").order("lahan_kosong", { ascending: false });
  if (error) return { galat: keGalat(error) };
  return { data: (data ?? []) as PeluangTipe[] };
}

/** Statistik satu jenis usaha dari jaringan (fungsi public.playbook). */
export type StatistikUsaha = {
  segmen: string;
  lahan: number;
  spbu: number;
  tenant: number;
  spbu_pct: number;
  lahan_dalam: number;
  lahan_luar: number;
  luas_p10: number | null;
  luas_median: number | null;
  luas_p90: number | null;
  daya_median: number | null;
  tarif_median: number | null;
  tarif_p90: number | null;
  tenant_teratas: { id: string; nama: string; spbu: number }[];
  provinsi_teratas: { provinsi: string; lahan: number }[];
  tipe_lokasi: { tipe_lokasi: TipeLokasi; pct_di_tipe: number; pct_semua: number; lift: number; spbu: number }[];
};

export const getPlaybook = () => rpc<StatistikUsaha[]>("playbook");
