import { PROVINSI } from "../istilah.ts";
import { kolomAktif, langkahAktif } from "./cabang.ts";
import type {
  JawabAnggaran,
  JawabIsian,
  JawabRuang,
  JawabSpbu,
  JawabWilayah,
  Jawaban,
  Kuesioner,
  NilaiJawab,
  Pertanyaan,
  Pilihan,
  Wilayah,
} from "./tipe.ts";

/**
 * Pemeriksa jawaban. Dipakai wizard (pesan langsung di layar) dan server (sebelum disimpan dan
 * sebelum jawaban tersimpan dipakai lagi). Jawaban yang lolos dikembalikan dalam bentuk bersih:
 * hanya pilihan yang dikenal, angka dalam batas, teks terpangkas.
 */

export type HasilPeriksa =
  | { ok: true; nilai: NilaiJawab }
  | { ok: false; pesan: string; kolom?: Record<string, string> };

/** Batas anggaran sewa per tahun yang masuk akal untuk diisi sendiri. */
export const ANGGARAN_MIN = 100_000;
export const ANGGARAN_MAKS = 100_000_000_000;

const objek = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const teks = (v: unknown, maks: number) => (typeof v === "string" ? v.trim().slice(0, maks) : "");
const angka = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Pilihan yang dikenal, tanpa ganda, urutan pengguna dipertahankan. Pilihan eksklusif menang sendirian. */
function pilihanSah(mentah: unknown, pilihan: Pilihan[]): string[] {
  if (!Array.isArray(mentah)) return [];
  const hasil: string[] = [];
  for (const v of mentah) {
    if (typeof v === "string" && pilihan.some((p) => p.nilai === v) && !hasil.includes(v)) hasil.push(v);
  }
  const eksklusif = hasil.find((v) => pilihan.find((p) => p.nilai === v)?.eksklusif);
  return eksklusif ? [eksklusif] : hasil;
}

function periksaPilih(p: Extract<Pertanyaan, { jenis: "pilih" }>, mentah: unknown): HasilPeriksa {
  const nilai = pilihanSah(mentah, p.pilihan);
  if (nilai.length === 0) return { ok: false, pesan: p.maks === 1 ? "Pilih salah satu dulu." : "Pilih paling sedikit satu." };
  if (nilai.length > p.maks) return { ok: false, pesan: `Pilih paling banyak ${p.maks}.` };
  return { ok: true, nilai };
}

function periksaWilayah(p: Extract<Pertanyaan, { jenis: "wilayah" }>, mentah: unknown): HasilPeriksa {
  if (!objek(mentah)) return { ok: false, pesan: "Pilih paling sedikit satu wilayah, atau tandai terbuka di berbagai wilayah." };
  const terbuka = mentah.terbuka === true;
  const daftar: Wilayah[] = [];
  if (!terbuka && Array.isArray(mentah.daftar)) {
    for (const w of mentah.daftar) {
      if (!objek(w) || typeof w.provinsi !== "string" || !PROVINSI.includes(w.provinsi)) continue;
      const kota = teks(w.kota, 80) || null;
      if (daftar.some((x) => x.provinsi === w.provinsi && x.kota === kota)) continue;
      daftar.push({ provinsi: w.provinsi, kota });
    }
  }
  if (!terbuka && daftar.length === 0) {
    return { ok: false, pesan: "Pilih paling sedikit satu wilayah, atau tandai terbuka di berbagai wilayah." };
  }
  if (daftar.length > p.maks) return { ok: false, pesan: `Pilih paling banyak ${p.maks} wilayah.` };
  const nilai: JawabWilayah = { terbuka, lain: !terbuka && mentah.lain === true, daftar };
  return { ok: true, nilai };
}

function periksaAnggaran(p: Extract<Pertanyaan, { jenis: "anggaran" }>, mentah: unknown): HasilPeriksa {
  if (!objek(mentah) || typeof mentah.pilihan !== "string") return { ok: false, pesan: "Pilih satu rentang anggaran dulu." };
  const satuan = mentah.satuan === "bulan" ? "bulan" : "tahun";
  const fleksibel = mentah.fleksibel === true;
  if (mentah.pilihan === "belum") {
    return { ok: true, nilai: { pilihan: "belum", min: null, maks: null, fleksibel: true, satuan } satisfies JawabAnggaran };
  }
  const rentang = p.rentang.find((r) => r.nilai === mentah.pilihan);
  if (rentang) {
    // Batasnya diambil dari kuesioner, bukan dari kiriman peramban.
    return { ok: true, nilai: { pilihan: rentang.nilai, min: rentang.min, maks: rentang.maks, fleksibel, satuan } satisfies JawabAnggaran };
  }
  if (mentah.pilihan !== "sendiri") return { ok: false, pesan: "Pilih satu rentang anggaran dulu." };
  const maks = angka(mentah.maks);
  const min = angka(mentah.min);
  const kolom: Record<string, string> = {};
  if (maks == null) kolom.maks = "Isi anggaran tertinggi Anda, dalam rupiah.";
  else if (maks < ANGGARAN_MIN || maks > ANGGARAN_MAKS) kolom.maks = "Isi angka antara Rp 100 ribu dan Rp 100 miliar per tahun.";
  if (min != null && (min < 0 || min > ANGGARAN_MAKS)) kolom.min = "Isi angka antara 0 dan Rp 100 miliar per tahun.";
  else if (min != null && maks != null && min > maks) kolom.min = "Anggaran terendah tidak boleh melebihi anggaran tertinggi.";
  if (Object.keys(kolom).length > 0) return { ok: false, pesan: "Periksa lagi anggaran yang Anda isi.", kolom };
  return {
    ok: true,
    nilai: { pilihan: "sendiri", min: min != null && min > 0 ? Math.round(min) : null, maks: Math.round(maks as number), fleksibel, satuan } satisfies JawabAnggaran,
  };
}

function periksaIsian(p: Extract<Pertanyaan, { jenis: "isian" }>, mentah: unknown, semua: Jawaban): HasilPeriksa {
  const isi = objek(mentah) ? mentah : {};
  const nilai: JawabIsian = {};
  const kolom: Record<string, string> = {};
  const format = new Intl.NumberFormat("id-ID");
  for (const c of kolomAktif(p, semua, isi)) {
    const v = isi[c.id];
    if (c.jenis === "angka") {
      if (v == null || v === "") continue;
      const n = angka(v);
      if (n == null) kolom[c.id] = "Isi dengan angka saja.";
      else if (n < c.min || n > c.maks) kolom[c.id] = `Isi angka antara ${format.format(c.min)} dan ${format.format(c.maks)}.`;
      else nilai[c.id] = n;
    } else if (c.jenis === "pilih") {
      if (typeof v === "string" && c.pilihan.some((o) => o.nilai === v)) nilai[c.id] = v;
    } else if (c.jenis === "centang") {
      const pilih = pilihanSah(v, c.pilihan);
      if (pilih.length > 0) nilai[c.id] = pilih;
    } else {
      const t = teks(v, c.maks);
      if (t !== "") nilai[c.id] = t;
    }
  }
  for (const c of p.kolom) {
    if (c.jenis !== "angka" || !c.batas_atas || kolom[c.id] || kolom[c.batas_atas]) continue;
    const a = nilai[c.id];
    const b = nilai[c.batas_atas];
    if (typeof a === "number" && typeof b === "number" && a > b) {
      const atas = p.kolom.find((x) => x.id === c.batas_atas);
      kolom[c.id] = `${c.nama} tidak boleh melebihi ${atas?.nama.toLowerCase() ?? "batas atasnya"}.`;
    }
  }
  if (Object.keys(kolom).length > 0) return { ok: false, pesan: "Ada isian yang perlu diperbaiki.", kolom };
  return { ok: true, nilai };
}

function periksaSpbu(mentah: unknown): HasilPeriksa {
  const pesan = "Pilih SPBU dari hasil pencarian, atau isi data SPBU yang belum terdaftar.";
  if (!objek(mentah)) return { ok: false, pesan };
  if (mentah.terdaftar === true) {
    const id = teks(mentah.id, 80);
    const nomor = teks(mentah.nomor, 20);
    const provinsi = teks(mentah.provinsi, 80);
    if (!id || !nomor || !provinsi) return { ok: false, pesan };
    const nilai: JawabSpbu = { terdaftar: true, id, nomor, alamat: teks(mentah.alamat, 300) || null, kota: teks(mentah.kota, 80) || null, provinsi };
    return { ok: true, nilai };
  }
  const nomor = teks(mentah.nomor, 20);
  const kota = teks(mentah.kota, 80);
  const kolom: Record<string, string> = {};
  if (nomor !== "" && !/^[0-9. -]{4,20}$/.test(nomor)) kolom.nomor = "Nomor SPBU berisi angka, misalnya 3415138.";
  if (kota.length < 2) kolom.kota = "Isi kota atau kabupaten tempat SPBU berada.";
  if (Object.keys(kolom).length > 0) return { ok: false, pesan, kolom };
  const nilai: JawabSpbu = { terdaftar: false, nomor, kota, catatan: teks(mentah.catatan, 300) };
  return { ok: true, nilai };
}

function periksaRuang(mentah: unknown): HasilPeriksa {
  const pesan = "Pilih paling sedikit satu ruang, atau usulkan ruang yang belum terdaftar.";
  if (!objek(mentah)) return { ok: false, pesan };
  const semua = mentah.semua === true;
  const lahan: JawabRuang["lahan"] = [];
  if (!semua && Array.isArray(mentah.lahan)) {
    for (const l of mentah.lahan.slice(0, 50)) {
      if (!objek(l)) continue;
      const lahan_id = teks(l.lahan_id, 80);
      const kode = teks(l.kode, 40);
      if (lahan_id && kode && !lahan.some((x) => x.lahan_id === lahan_id)) lahan.push({ lahan_id, kode });
    }
  }
  const usul = teks(mentah.usul, 300);
  if (!semua && lahan.length === 0 && usul === "") return { ok: false, pesan };
  return { ok: true, nilai: { semua, lahan, usul } satisfies JawabRuang };
}

/** Memeriksa satu jawaban. `semua` adalah jawaban lain, dipakai untuk kolom yang bercabang. */
export function periksa(p: Pertanyaan, mentah: unknown, semua: Jawaban = {}): HasilPeriksa {
  switch (p.jenis) {
    case "pilih":
      return periksaPilih(p, mentah);
    case "wilayah":
      return periksaWilayah(p, mentah);
    case "anggaran":
      return periksaAnggaran(p, mentah);
    case "isian":
      return periksaIsian(p, mentah, semua);
    case "spbu":
      return periksaSpbu(mentah);
    case "ruang":
      return periksaRuang(mentah);
  }
}

export type Bersih = { jawaban: Jawaban; dilewati: string[]; ditolak: string[] };

/**
 * Membersihkan seluruh jawaban terhadap kuesioner: jawaban untuk pertanyaan yang tidak dikenal atau
 * tidak lagi tampil dibuang, yang tidak sah dicatat di `ditolak` dan tidak ikut disimpan.
 * Pertanyaan diperiksa berurutan, jadi percabangan memakai jawaban yang sudah bersih.
 */
export function bersihkan(k: Kuesioner, mentah: unknown, dilewati: unknown = []): Bersih {
  const asal = objek(mentah) ? mentah : {};
  const jawaban: Jawaban = {};
  const ditolak: string[] = [];
  for (const p of k.pertanyaan) {
    if (!langkahAktif(k, jawaban).includes(p) || asal[p.id] === undefined) continue;
    const h = periksa(p, asal[p.id], jawaban);
    if (h.ok) jawaban[p.id] = h.nilai;
    else ditolak.push(p.id);
  }
  const aktif = langkahAktif(k, jawaban);
  const lewati = Array.isArray(dilewati)
    ? aktif.filter((p) => !p.inti && jawaban[p.id] === undefined && dilewati.includes(p.id)).map((p) => p.id)
    : [];
  return { jawaban, dilewati: lewati, ditolak };
}
