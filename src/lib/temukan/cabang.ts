import type { Jawaban, Kolom, Kuesioner, Pertanyaan, Syarat } from "./tipe.ts";

/** Percabangan kuesioner: pertanyaan dan kolom mana yang tampil untuk jawaban yang sudah ada. */

function nilaiDari(id: string, jawaban: Jawaban): unknown {
  const [tanya, kolom] = id.split(".");
  const v = jawaban[tanya];
  if (kolom === undefined) return v;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>)[kolom] : undefined;
}

const kosong = (v: unknown) =>
  v == null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

export function berlaku(s: Syarat | undefined, jawaban: Jawaban): boolean {
  if (!s) return true;
  if ("semua" in s) return s.semua.every((x) => berlaku(x, jawaban));
  if ("salah_satu" in s) return s.salah_satu.some((x) => berlaku(x, jawaban));
  if ("bukan" in s) return !berlaku(s.bukan, jawaban);
  const v = nilaiDari(s.id, jawaban);
  if ("terisi" in s) return !kosong(v);
  const dicari = Array.isArray(s.sama) ? s.sama : [s.sama];
  if (Array.isArray(v)) return v.some((x) => typeof x === "string" && dicari.includes(x));
  return typeof v === "string" && dicari.includes(v);
}

/** Pertanyaan yang tampil, berurutan. Kondisi hanya boleh menunjuk pertanyaan sebelumnya. */
export const langkahAktif = (k: Kuesioner, jawaban: Jawaban): Pertanyaan[] => k.pertanyaan.filter((p) => berlaku(p.tampil, jawaban));

/** Kolom isian yang tampil. Kondisinya boleh menunjuk kolom lain di pertanyaan yang sama (nilai yang sedang diisi). */
export function kolomAktif(p: Extract<Pertanyaan, { jenis: "isian" }>, jawaban: Jawaban, sedangDiisi?: Record<string, unknown>): Kolom[] {
  const gabung = sedangDiisi ? ({ ...jawaban, [p.id]: sedangDiisi } as Jawaban) : jawaban;
  return p.kolom.filter((c) => berlaku(c.tampil, gabung));
}

export const terjawab = (jawaban: Jawaban, id: string) => jawaban[id] !== undefined;

/**
 * Langkah pertama yang belum selesai: pertanyaan inti tanpa jawaban, atau pertanyaan tambahan yang
 * belum dijawab dan belum dilewati. null = semua langkah sudah dilalui.
 */
export function langkahBerikut(k: Kuesioner, jawaban: Jawaban, dilewati: string[]): string | null {
  for (const p of langkahAktif(k, jawaban)) {
    if (terjawab(jawaban, p.id)) continue;
    if (!p.inti && dilewati.includes(p.id)) continue;
    return p.id;
  }
  return null;
}

/** Semua pertanyaan inti yang tampil sudah dijawab: cukup untuk rekomendasi awal. */
export const intiLengkap = (k: Kuesioner, jawaban: Jawaban) => langkahAktif(k, jawaban).every((p) => !p.inti || terjawab(jawaban, p.id));

/** Penanda langkah terakhir wizard: ringkasan preferensi. */
export const RINGKASAN = "ringkasan";

/**
 * Langkah yang boleh dibuka untuk satu permintaan (dari alamat, tombol kembali peramban, atau sesi tersimpan).
 * Pertanyaan boleh dibuka bila semua pertanyaan inti sebelumnya sudah dijawab; selain itu pengguna
 * dibawa ke pertanyaan inti pertama yang masih kosong.
 */
export function langkahTujuan(k: Kuesioner, jawaban: Jawaban, dilewati: string[], diminta: string | null | undefined): string {
  const aktif = langkahAktif(k, jawaban);
  const kosong = aktif.find((p) => p.inti && !terjawab(jawaban, p.id));
  if (diminta === RINGKASAN) return kosong ? kosong.id : RINGKASAN;
  const i = aktif.findIndex((p) => p.id === diminta);
  if (i >= 0) return !kosong || i <= aktif.indexOf(kosong) ? aktif[i].id : kosong.id;
  return langkahBerikut(k, jawaban, dilewati) ?? RINGKASAN;
}

/** Pertanyaan teratas yang dirujuk satu kondisi. */
function rujukan(s: Syarat): string[] {
  if ("semua" in s) return s.semua.flatMap(rujukan);
  if ("salah_satu" in s) return s.salah_satu.flatMap(rujukan);
  if ("bukan" in s) return rujukan(s.bukan);
  return [s.id.split(".")[0]];
}

/**
 * Pertanyaan inti yang akan atau mungkin tampil: yang kondisinya terpenuhi, atau yang kondisinya bergantung pada
 * pertanyaan yang belum dijawab. Dipakai untuk "Langkah n dari m", supaya m tidak bertambah di tengah jalan saat
 * pertanyaan bercabang muncul; m hanya bisa berkurang setelah jawabannya menutup satu cabang.
 */
export const intiDiperkirakan = (k: Kuesioner, jawaban: Jawaban): Pertanyaan[] =>
  k.pertanyaan.filter((p) => p.inti && (!p.tampil || berlaku(p.tampil, jawaban) || rujukan(p.tampil).some((id) => jawaban[id] === undefined)));
