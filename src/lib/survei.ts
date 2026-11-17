/** Jadwal survei lokasi (migrasi 20261130_survei). Berkas ini tanpa ketergantungan server, jadi aman dipakai komponen klien. */

export type WaktuUsulan = "pagi" | "siang" | "sore";
export type Usulan = { tanggal: string; waktu: WaktuUsulan };
export type StatusSurvei = "diminta" | "dijadwalkan" | "selesai" | "dibatalkan";

/** Yang terlihat oleh tenant: tanpa catatan hasil dan tanpa identitas staf NFR selain pendamping. */
export type SurveiTenant = {
  id: string;
  status: StatusSurvei;
  usulan: Usulan[];
  catatan_tenant: string | null;
  diminta: string | null;
  diminta_oleh: string | null;
  jadwal_tanggal: string | null;
  /** "HH:MM", jam setempat di lokasi SPBU. */
  jadwal_jam: string | null;
  pendamping: string | null;
  catatan_jadwal: string | null;
  selesai: string | null;
  alasan_batal: string | null;
  dibatalkan: string | null;
  dibatalkan_pihak: "tenant" | "nfr" | null;
};

export type Survei = SurveiTenant & {
  dijadwalkan: string | null;
  dijadwalkan_oleh: string | null;
  hasil: string | null;
  selesai_oleh: string | null;
  dibatalkan_oleh: string | null;
  /** Kapan pengelola SPBU menandai jadwal ini sudah diketahui; gugur bila jadwal berubah. */
  diketahui_dealer: string | null;
  diketahui_oleh: string | null;
  /** SPBU-nya sudah ditautkan ke organisasi pengelola di aplikasi ini. */
  dealer_terhubung: boolean;
};

/** Survei terjadwal untuk pengelola SPBU: tanpa nama calon tenant, syarat sewa, dan catatan survei. */
export type SurveiDealer = {
  id: string;
  spbu_id: string;
  spbu_nomor: string;
  lahan_id: string;
  lahan_kode: string;
  luas_m2: number | null;
  posisi: string | null;
  segmen: string | null;
  jadwal_tanggal: string;
  jadwal_jam: string;
  pendamping: string | null;
  diketahui: string | null;
  diketahui_oleh: string | null;
};

export const WAKTU: Record<WaktuUsulan, string> = {
  pagi: "pagi, 08.00 sampai 11.00",
  siang: "siang, 11.00 sampai 14.00",
  sore: "sore, 14.00 sampai 17.00",
};

/** Jam yang diisikan saat analis memakai usulan tenant. Hanya titik awal; analis boleh mengubahnya. */
export const JAM_AWAL: Record<WaktuUsulan, string> = { pagi: "09:00", siang: "13:00", sore: "15:00" };

export const STATUS_SURVEI: Record<StatusSurvei, { nama: string; warna: "netral" | "hijau" | "biru" | "kuning" }> = {
  diminta: { nama: "Menunggu jadwal", warna: "kuning" },
  dijadwalkan: { nama: "Dijadwalkan", warna: "biru" },
  selesai: { nama: "Selesai", warna: "hijau" },
  dibatalkan: { nama: "Dibatalkan", warna: "netral" },
};

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-11-24" → "Selasa, 24 November 2026". Dihitung dalam UTC supaya tidak bergeser zona waktu. */
export function hariTanggal(iso: string | null | undefined) {
  if (!iso) return "–";
  const [t, b, h] = iso.slice(0, 10).split("-").map(Number);
  return `${HARI[new Date(Date.UTC(t, b - 1, h)).getUTCDay()]}, ${h} ${BULAN[b - 1]} ${t}`;
}

/** "14:30" → "14.30" */
export const jam = (v: string | null | undefined) => (v ? v.slice(0, 5).replace(":", ".") : "–");

export const berjalan = <T extends SurveiTenant>(daftar: T[]) => daftar.find((s) => s.status === "diminta" || s.status === "dijadwalkan") ?? null;

/** Tanggal hari ini menurut WIB ditambah sekian hari, sebagai "YYYY-MM-DD". */
export const hariWib = (tambah = 0) => new Date(Date.now() + 7 * 3600e3 + tambah * 86400e3).toISOString().slice(0, 10);
