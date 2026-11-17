import { rpc } from "@/lib/data";
import type { VersiPenawaran } from "@/lib/data-tahap3";
import type { Gambar } from "@/lib/gambar";
import type { RincianInspeksi } from "@/lib/status-lahan";

/** Wewenang SPBU dan portal dealer (migrasi 20261126_wewenang_dealer). */

export const POLA: Record<string, string> = {
  COCO: "COCO: dimiliki dan dikelola Pertamina",
  DODO: "DODO: dimiliki dan dikelola mitra",
  CODO: "CODO: dimiliki Pertamina, dikelola mitra",
  lainnya: "Pola lain",
};

export const PENERIMA: Record<string, string> = {
  pertamina: "Pertamina",
  pemilik_spbu: "Pemilik SPBU",
  dibagi: "Dibagi Pertamina dan pemilik SPBU",
};

export type HakSpbu = {
  spbu_id: string;
  pola: string | null;
  pemilik_aset: string | null;
  pengelola: string | null;
  organisasi_dealer: string | null;
  organisasi_nama: string | null;
  dealer_berwenang: boolean;
  penyetuju: string | null;
  pihak_kontrak: string | null;
  penerima_sewa: string | null;
  bagi_hasil: string | null;
  dokumen: string | null;
  status: "belum_dipastikan" | "dipastikan";
  dipastikan: string | null;
  dipastikan_oleh: string | null;
  diubah: string;
  diubah_oleh: string | null;
};

export type HakRinci = { hak: HakSpbu | null; pilihan: { id: string; nama: string; demo: boolean }[] };

export const getHakSpbu = (spbuId: string) => rpc<HakRinci>("hak_spbu_rinci", { p_spbu_id: spbuId });

export type RingkasanDealer = {
  spbu: { spbu_id: string; nomor: string; alamat: string | null; kota: string | null; provinsi: string; ruang: number; kosong: number; perlu_konfirmasi: number; foto: string | null }[];
  persetujuan: { peluang_id: string; lahan_kode: string; spbu_nomor: string; pihak: string | null; segmen: string | null; versi: number; berwenang: boolean }[];
};

export const getRingkasanDealer = () => rpc<RingkasanDealer>("dealer_ringkasan");

export type HakUntukDealer = Pick<HakSpbu, "pola" | "penyetuju" | "pihak_kontrak" | "penerima_sewa" | "bagi_hasil" | "dealer_berwenang" | "status"> & {
  pemilik_aset?: string | null;
  pengelola?: string | null;
};

export type RuangDealer = {
  lahan_id: string;
  kode: string;
  status_sumber: string;
  outlet: string | null;
  segmen: string | null;
  luas_m2: number | null;
  daya_w: number | null;
  posisi: string | null;
  status_ruang: string;
  alasan_ruang: string | null;
  status_data: string;
  kesiapan: string;
  konfirmasi: "tersedia" | "tidak_tersedia" | null;
  konfirmasi_waktu: string | null;
  konfirmasi_catatan: string | null;
  foto: string | null;
  inspeksi: { id: string; status: string; milik_saya: boolean; pemeriksa: string | null } | null;
};

export type SpbuDealer = {
  spbu: { id: string; nomor: string; alamat: string | null; kota: string | null; provinsi: string; fasilitas: string[] };
  hak: HakUntukDealer | null;
  foto_spbu: Gambar[];
  ruang: RuangDealer[];
};

export const getSpbuDealer = (spbuId: string) => rpc<SpbuDealer>("dealer_spbu_rinci", { p_spbu_id: spbuId });

export const getInspeksiDealer = (id: string) => rpc<RincianInspeksi>("dealer_inspeksi_rinci", { p_id: id });

export type KartuKeputusan = {
  peluang_id: string;
  lahan_kode: string;
  tahap_persetujuan: boolean;
  spbu: { id: string; nomor: string; kota: string | null };
  tenant: { nama: string | null; segmen: string | null; baru: boolean; deskripsi: string | null; jumlah_gerai: number | null; jaringan_spbu: number | null };
  ruang: { luas_m2: number | null; daya_w: number | null; posisi: string | null; lantai: string | null } | null;
  foto: Gambar[];
  syarat: Omit<VersiPenawaran, "id" | "dibuat" | "dibuat_oleh" | "diterbitkan_oleh">;
  hak: HakUntukDealer;
  kesiapan: { kesiapan: string; pembatasan: string | null; status_data: string } | null;
  usaha_ada: string[];
  persetujuan: { pihak: string; status: string; diputuskan: string | null; alasan: string | null }[];
  peran_saya: string;
};

export const getKartuKeputusan = (peluangId: string) => rpc<KartuKeputusan>("dealer_persetujuan_rinci", { p_peluang_id: peluangId });
