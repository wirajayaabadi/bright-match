import type { Kuesioner } from "./tipe.ts";

/**
 * Analitik Temukan peluang untuk tim NFR. Angkanya dihitung fungsi basis data temukan_analitik dari peristiwa
 * tanpa identitas; berkas ini hanya mengurutkan, memberi nama, dan menghitung persentase.
 */

export type AnalitikPeran = {
  /** Sesi yang mulai menjawab dalam jendela waktu. Semua angka lain dihitung untuk sesi-sesi ini. */
  mulai: number;
  selesai: number;
  detik_median: number | null;
  pertanyaan: { langkah: string; dijawab: number; dilewati: number }[];
  /** Pertanyaan terakhir yang dijawab atau dilewati oleh sesi yang tidak selesai. */
  berhenti: { langkah: string; sesi: number }[];
  pilihan: { langkah: string; nilai: string; sesi: number }[];
  rekomendasi: { dibuat: number; kosong: number; sesi_melihat: number; sesi_klik: number; sesi_minat: number; sesi_ubah: number };
  umpan: { sesuai: number; kurang: number; skor_sesuai: number | null; skor_kurang: number | null; alasan: { alasan: string; n: number }[] };
};

export type Analitik = { hari: number; retensi_hari: number; tenant: AnalitikPeran; dealer: AnalitikPeran };

/** Di bawah jumlah ini, persentase lebih menggambarkan kebetulan daripada pola. */
export const SESI_MINIMUM = 30;

/** Persentase satu desimal, atau null bila pembaginya nol. */
export const persen = (bagian: number, seluruh: number): number | null => (seluruh > 0 ? Math.round((1000 * bagian) / seluruh) / 10 : null);

export const teksPersen = (v: number | null) => (v == null ? "–" : `${String(v).replace(".", ",")}%`);

/** 200 → "3 menit 20 detik". */
export function teksLama(detik: number | null): string {
  if (detik == null) return "–";
  const d = Math.round(detik);
  if (d < 60) return `${d} detik`;
  const m = Math.floor(d / 60);
  return d % 60 === 0 ? `${m} menit` : `${m} menit ${d % 60} detik`;
}

export type BarisCorong = {
  id: string;
  nama: string;
  inti: boolean;
  dijawab: number;
  dilewati: number;
  /** Sesi yang tidak selesai dan berhenti tepat setelah pertanyaan ini. */
  berhenti: number;
  /** Bagian sesi yang mulai dan menjawab pertanyaan ini. */
  pct: number | null;
};

/**
 * Corong per pertanyaan, mengikuti urutan kuesioner. Pertanyaan bercabang wajar punya angka lebih kecil:
 * ia hanya tampil untuk sebagian jawaban. Pertanyaan yang sudah tidak ada di kuesioner tetap ditampilkan di akhir.
 */
export function corong(k: Kuesioner, a: AnalitikPeran): BarisCorong[] {
  const baris = (id: string, nama: string, inti: boolean): BarisCorong => {
    const p = a.pertanyaan.find((x) => x.langkah === id);
    return {
      id,
      nama,
      inti,
      dijawab: p?.dijawab ?? 0,
      dilewati: p?.dilewati ?? 0,
      berhenti: a.berhenti.find((x) => x.langkah === id)?.sesi ?? 0,
      pct: persen(p?.dijawab ?? 0, a.mulai),
    };
  };
  const dikenal = k.pertanyaan.map((p) => baris(p.id, p.ringkas, p.inti));
  const lama = a.pertanyaan.filter((x) => !k.pertanyaan.some((p) => p.id === x.langkah)).map((x) => baris(x.langkah, `${x.langkah} (versi lama)`, false));
  return [...dikenal, ...lama];
}

const NAMA_KHUSUS: Record<string, string> = { terbuka: "Terbuka di berbagai wilayah", sendiri: "Angka sendiri", belum: "Belum menentukan" };

/** Nama satu pilihan seperti yang dilihat pengguna. Nilai yang tidak dikenal ditampilkan apa adanya. */
export function namaNilai(k: Kuesioner, langkah: string, nilai: string): string {
  const p = k.pertanyaan.find((x) => x.id === langkah);
  if (p?.jenis === "pilih") return p.pilihan.find((o) => o.nilai === nilai)?.nama ?? nilai;
  if (p?.jenis === "anggaran") return p.rentang.find((r) => r.nilai === nilai)?.nama ?? NAMA_KHUSUS[nilai] ?? nilai;
  return NAMA_KHUSUS[nilai] ?? nilai;
}

export type PilihanTeratas = { id: string; nama: string; butir: { nama: string; sesi: number; pct: number | null }[] };

/** Pilihan yang paling sering dipakai, per pertanyaan, mengikuti urutan kuesioner. Persentase terhadap sesi yang menjawab pertanyaan itu. */
export function pilihanTeratas(k: Kuesioner, a: AnalitikPeran, maks = 4): PilihanTeratas[] {
  return k.pertanyaan
    .map((p) => {
      const dijawab = a.pertanyaan.find((x) => x.langkah === p.id)?.dijawab ?? 0;
      const butir = a.pilihan
        .filter((x) => x.langkah === p.id)
        .sort((x, y) => y.sesi - x.sesi || x.nilai.localeCompare(y.nilai))
        .slice(0, maks)
        .map((x) => ({ nama: namaNilai(k, p.id, x.nilai), sesi: x.sesi, pct: persen(x.sesi, dijawab) }));
      return { id: p.id, nama: p.ringkas, butir };
    })
    .filter((x) => x.butir.length > 0);
}

export const ALASAN_UMPAN: Record<string, string> = {
  tarif: "Tarif tidak sesuai",
  lokasi: "Lokasi kurang cocok",
  ruang: "Ruang tidak sesuai kebutuhan",
  data: "Datanya kurang lengkap",
  lain: "Alasan lain",
  tanpa: "Tanpa alasan",
};
