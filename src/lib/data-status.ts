import { rpc } from "@/lib/data";
import type { DaftarInspeksi, RincianInspeksi, StatusLahan } from "@/lib/status-lahan";

export const getStatusLahan = (lahanId: string) => rpc<StatusLahan>("status_lahan_rinci", { p_lahan_id: lahanId });

export const getInspeksiRinci = (id: string) => rpc<RincianInspeksi>("inspeksi_rinci", { p_id: id });

export const getInspeksiDaftar = (p: { status?: string; cari?: string; halaman?: number }) =>
  rpc<DaftarInspeksi>("inspeksi_daftar", { p_status: p.status, p_cari: p.cari, p_halaman: p.halaman });
