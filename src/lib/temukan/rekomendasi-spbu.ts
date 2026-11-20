import { namaTipe } from "../tipe-lokasi.ts";
import type { Faktor, Kesesuaian, SumberData } from "./rekomendasi.ts";
import { SEGMEN_KARTU } from "./tenant-v1.ts";
import type { JawabRuang, JawabSpbu, Jawaban } from "./tipe.ts";

/**
 * Rekomendasi untuk pengelola SPBU, dua tingkat: jenis usaha yang cocok untuk tiap ruang, lalu calon
 * tenant di jenis usaha itu. Skor dan syaratnya dari mesin kecocokan yang sama (arah "satu ruang").
 * Nama calon tidak pernah dikirim ke sini; profilnya pun hanya untuk akun yang wewenangnya tercatat.
 */

const angka = new Intl.NumberFormat("id-ID");
const jepit = (v: number) => Math.min(1, Math.max(0, v));

export type CalonAnonim = {
  skor: number;
  skala: "besar" | "menengah" | "kecil";
  di_kota: boolean;
  di_provinsi: boolean;
  luas_ok: boolean | null;
  daya_ok: boolean | null;
  tarif_ok: boolean | null;
  poin_jaringan: number;
  poin_harga: number;
};

export type Kategori = {
  segmen: string;
  /** Skor calon terbaik di jenis usaha ini untuk ruang ini. */
  skor: number;
  jumlah_calon: number;
  tingkat: "kota" | "provinsi";
  n_segmen: number;
  n_pembanding: number;
  segmen_sudah_ada: boolean;
  tipe_lokasi: string | null;
  lift_tipe: number | null;
  pct_di_tipe: number | null;
  pct_semua: number | null;
  penduduk_3km: number | null;
  poi_1km: number | null;
  sejenis_500m: number | null;
  poin_tipe: number;
  poin_permintaan: number;
  poin_pelengkap: number;
  calon: CalonAnonim[] | null;
};

export type RuangPeluang = {
  lahan_id: string;
  kode: string;
  luas_m2: number | null;
  posisi: string | null;
  lantai: string | null;
  daya_w: number | null;
  terverifikasi: boolean;
  kategori: Kategori[];
};

export type PeluangSpbu = {
  spbu: { id: string; nomor: string; alamat: string | null; kota: string | null; provinsi: string; tipe_lokasi: string | null };
  berwenang: boolean;
  versi_model: string;
  sumber: SumberData[];
  /** Ruang yang boleh tampil tetapi belum dihitung karena batas enam ruang per halaman. */
  ruang_lain: number;
  ruang: RuangPeluang[];
};

/** Masukan fungsi temukan_peluang_spbu dari jawaban. null bila SPBU belum terdaftar atau belum dipilih. */
export function permintaanSpbu(jawaban: Jawaban): { spbuId: string; lahanIds: string[] | null } | null {
  const spbu = jawaban.spbu as JawabSpbu | undefined;
  if (!spbu?.terdaftar) return null;
  const ruang = jawaban.ruang as JawabRuang | undefined;
  return { spbuId: spbu.id, lahanIds: ruang && !ruang.semua && ruang.lahan.length > 0 ? ruang.lahan.map((l) => l.lahan_id) : null };
}

/** Segmen yang diinginkan pengelola. null = terbuka untuk rekomendasi. */
export function segmenDiinginkan(jawaban: Jawaban): string[] | null {
  const pilih = Array.isArray(jawaban.usaha) ? (jawaban.usaha as string[]) : [];
  if (pilih.length === 0 || pilih.includes("terbuka")) return null;
  return pilih.flatMap((k) => SEGMEN_KARTU[k] ?? []);
}

const EV = "Energi Baru (EV/PLTS)";

/** Kesesuaian satu jenis usaha dengan tujuan dan pilihan pengelola. Jenis usaha yang diinginkan berbobot 2, tiap tujuan 1. */
export function kesesuaianKategori(c: Kategori, jawaban: Jawaban): Kesesuaian {
  const faktor: Faktor[] = [];
  const ingin = segmenDiinginkan(jawaban);
  if (ingin) {
    const cocok = ingin.includes(c.segmen);
    faktor.push({
      kunci: "usaha",
      nama: "Jenis usaha yang Anda inginkan",
      bobot: 2,
      nilai: cocok ? 1 : 0,
      alasan: cocok ? "Termasuk jenis usaha yang Anda pilih." : "Bukan jenis usaha yang Anda pilih; ditampilkan sebagai pembanding.",
    });
  }
  const tujuan = Array.isArray(jawaban.tujuan) ? (jawaban.tujuan as string[]) : [];
  for (const t of tujuan) {
    if (t === "pelengkap" || t === "fasilitas") {
      faktor.push({
        kunci: t,
        nama: t === "pelengkap" ? "Melengkapi jenis usaha yang sudah ada" : "Menambah fasilitas SPBU",
        bobot: 1,
        nilai: c.segmen_sudah_ada ? 0.2 : 1,
        alasan: c.segmen_sudah_ada ? "SPBU ini sudah punya jenis usaha ini." : "SPBU ini belum punya jenis usaha ini.",
      });
    } else if (t === "ev") {
      faktor.push({
        kunci: t,
        nama: "Mendukung ekosistem kendaraan listrik",
        bobot: 1,
        nilai: c.segmen === EV ? 1 : 0,
        alasan: c.segmen === EV ? "Jenis usaha ini adalah layanan kendaraan listrik." : "Bukan layanan kendaraan listrik.",
      });
    } else if (t === "kosong") {
      faktor.push({
        kunci: t,
        nama: "Mengoptimalkan ruang kosong",
        bobot: 1,
        nilai: jepit(c.jumlah_calon / 5),
        alasan: `${angka.format(c.jumlah_calon)} calon tenant di jaringan memenuhi syarat untuk ruang ini.`,
      });
    } else if (t === "kunjungan") {
      faktor.push({
        kunci: t,
        nama: "Meningkatkan kunjungan pelanggan",
        bobot: 1,
        nilai: c.tipe_lokasi == null || c.lift_tipe == null ? null : jepit(c.poin_tipe / 25),
        alasan:
          c.tipe_lokasi == null || c.lift_tipe == null
            ? "Tipe lokasi SPBU ini belum terhitung."
            : `Di lokasi bertipe ${namaTipe(c.tipe_lokasi).toLowerCase()}, jenis usaha ini ${c.lift_tipe >= 1.15 ? "lebih sering" : c.lift_tipe <= 0.85 ? "lebih jarang" : "sama sering"} hadir dibanding di jaringan. Ini pola kehadiran, bukan jumlah kunjungan.`,
      });
    } else if (t === "sewa") {
      faktor.push({ kunci: t, nama: "Meningkatkan pendapatan sewa", bobot: 1, nilai: null, alasan: "Nilai sewa per jenis usaha belum bisa kami buka di sini; dibahas bersama tim Non Fuel Retail." });
    }
  }
  const ada = faktor.filter((f) => f.nilai != null);
  const bobot = ada.reduce((a, f) => a + f.bobot, 0);
  return { skor: bobot > 0 ? Math.round((100 * ada.reduce((a, f) => a + f.bobot * (f.nilai as number), 0)) / bobot) : null, faktor };
}

/** Alasan sebuah jenis usaha cocok untuk satu ruang, dari angka mesin. */
export function alasanKategori(c: Kategori, kota: string | null, provinsi: string): string[] {
  const hasil: string[] = [];
  if (c.tipe_lokasi != null && c.lift_tipe != null && c.pct_di_tipe != null && c.pct_semua != null) {
    const arah = c.lift_tipe >= 1.15 ? "lebih sering" : c.lift_tipe <= 0.85 ? "lebih jarang" : "sama seringnya";
    hasil.push(`Di SPBU bertipe ${namaTipe(c.tipe_lokasi).toLowerCase()}, jenis usaha ini ada di ${angka.format(c.pct_di_tipe)}% SPBU, ${arah} dibanding ${angka.format(c.pct_semua)}% di seluruh jaringan.`);
  }
  if (c.n_pembanding > 0) {
    hasil.push(`${angka.format(c.n_segmen)} dari ${angka.format(c.n_pembanding)} ruang sejenis di ${c.tingkat === "kota" ? (kota ?? "kota ini") : provinsi} disewa jenis usaha ini.`);
  }
  hasil.push(c.segmen_sudah_ada ? "SPBU ini sudah punya jenis usaha ini, jadi sifatnya menambah pilihan." : "SPBU ini belum punya jenis usaha ini, jadi sifatnya melengkapi.");
  if (c.sejenis_500m != null) hasil.push(c.sejenis_500m === 0 ? "Tidak ada usaha sejenis dalam 500 m." : `Ada ${angka.format(c.sejenis_500m)} usaha sejenis dalam 500 m.`);
  return hasil;
}

/** Keterbatasan data yang perlu diketahui untuk satu jenis usaha. */
export function batasKategori(c: Kategori): string[] {
  const hasil: string[] = [];
  if (c.tipe_lokasi == null) hasil.push("Lingkungan SPBU belum terhitung, jadi tipe lokasi dan permintaan dinilai netral.");
  if (c.n_pembanding === 0) hasil.push("Belum ada ruang sejenis yang tersewa di wilayah ini sebagai pembanding.");
  if (c.tingkat === "provinsi" && c.n_pembanding > 0) hasil.push("Pembanding diambil dari tingkat provinsi karena di kota ini datanya terlalu sedikit.");
  return hasil;
}

export type KategoriDinilai = { kategori: Kategori; sesuai: Kesesuaian };

/**
 * Jenis usaha untuk satu ruang, urut dari rata-rata skor kecocokan dan kesesuaian. "Lainnya" tidak
 * ditampilkan: ia kumpulan usaha yang tidak terklasifikasi, bukan jenis usaha yang bisa disarankan.
 */
export function urutkanKategori(daftar: Kategori[], jawaban: Jawaban): KategoriDinilai[] {
  return daftar
    .filter((c) => c.segmen !== "Lainnya")
    .map((kategori) => ({ kategori, sesuai: kesesuaianKategori(kategori, jawaban) }))
    .sort((a, b) => {
      const x = a.sesuai.skor == null ? a.kategori.skor : (a.kategori.skor + a.sesuai.skor) / 2;
      const y = b.sesuai.skor == null ? b.kategori.skor : (b.kategori.skor + b.sesuai.skor) / 2;
      return y - x || b.kategori.skor - a.kategori.skor || a.kategori.segmen.localeCompare(b.kategori.segmen);
    });
}

const SKALA: Record<CalonAnonim["skala"], string> = {
  besar: "Jaringan besar: 50 SPBU atau lebih",
  menengah: "Jaringan menengah: 10 sampai 49 SPBU",
  kecil: "Jaringan kecil: di bawah 10 SPBU",
};

/** Keterangan satu calon tanpa nama, untuk pengelola yang berwenang. */
export function keteranganCalon(c: CalonAnonim, kota: string | null, provinsi: string): string[] {
  const perlu = [c.luas_ok == null ? "luas" : null, c.daya_ok == null ? "daya" : null, c.tarif_ok == null ? "tarif" : null].filter(Boolean);
  return [
    SKALA[c.skala],
    c.di_kota ? `Sudah beroperasi di ${kota ?? "kota ini"}` : c.di_provinsi ? `Belum ada di ${kota ?? "kota ini"}, sudah ada di ${provinsi}` : `Belum ada di ${provinsi}`,
    ...(perlu.length > 0 ? [`Perlu dicek: ${perlu.join(", ")}`] : []),
  ];
}
