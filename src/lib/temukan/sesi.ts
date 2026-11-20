import "server-only";
import { randomBytes } from "node:crypto";
import { createClient as createUmum } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { cookies } from "next/headers";
import { rpc } from "@/lib/data";
import { supabaseKey, supabaseSiap, supabaseUrl } from "@/lib/supabase/env";
import { adalahPeran, kuesioner } from "@/lib/temukan/kuesioner";
import { bersihkan } from "@/lib/temukan/periksa";
import type { Diminati, SesiTemukan, SpbuRinci, SpbuUmum, Wilayah } from "@/lib/temukan/tipe";

/**
 * Sesi Temukan peluang di sisi server. Kuncinya 32 byte acak di cookie httpOnly, jadi tidak terbaca
 * skrip di peramban; basis data hanya menyimpan sidiknya. Jawaban tidak pernah ditaruh di localStorage.
 */
const KUKI = "bm_temukan";
const TIGA_PULUH_HARI = 60 * 60 * 24 * 30;
const KUNCI_SAH = /^[A-Za-z0-9_-]{43,128}$/;

/** Kunci sesi dari cookie, atau null. Aman dipanggil dari Server Component. */
export async function kunciSesi(): Promise<string | null> {
  const nilai = (await cookies()).get(KUKI)?.value;
  return nilai && KUNCI_SAH.test(nilai) ? nilai : null;
}

/**
 * Kunci sesi yang ada, atau yang baru dibuat. Menulis cookie hanya saat membuat kunci baru (di Server
 * Action), supaya simpanan berikutnya tidak memicu halaman dimuat ulang dari server.
 */
export async function kunciSesiAtauBaru(): Promise<string> {
  const lama = await kunciSesi();
  if (lama) return lama;
  const kunci = randomBytes(32).toString("base64url");
  (await cookies()).set(KUKI, kunci, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TIGA_PULUH_HARI,
  });
  return kunci;
}

/**
 * Sesi milik pengunjung ini, sudah dibersihkan terhadap kuesioner terbaru. Yang tersimpan di basis data
 * diperlakukan sebagai masukan yang belum dipercaya: fungsi simpannya terbuka untuk umum.
 */
export async function bacaSesi(): Promise<SesiTemukan[]> {
  // Tanpa cookie pun tetap ditanyakan: pengguna yang masuk bisa punya preferensi atas akunnya.
  const kunci = await kunciSesi();
  const hasil = await rpc<{ peran: unknown; versi: unknown; langkah: unknown; status: unknown; jawaban: unknown; dilewati: unknown; diubah: unknown; akun: unknown; diminati: unknown }[]>(
    "temukan_sesi",
    { p_token: kunci },
  );
  if (hasil.galat || !Array.isArray(hasil.data)) return [];
  const sesi: SesiTemukan[] = [];
  for (const s of hasil.data) {
    if (!adalahPeran(s.peran)) continue;
    const k = kuesioner(s.peran);
    const b = bersihkan(k, s.jawaban, s.dilewati);
    sesi.push({
      peran: s.peran,
      versi: typeof s.versi === "string" ? s.versi : k.versi,
      langkah: typeof s.langkah === "string" && k.pertanyaan.some((p) => p.id === s.langkah) ? s.langkah : null,
      status: s.status === "selesai" ? "selesai" : "berjalan",
      jawaban: b.jawaban,
      dilewati: b.dilewati,
      diubah: typeof s.diubah === "string" ? s.diubah : "",
      akun: s.akun === true,
      diminati: bersihkanDiminati(s.diminati),
    });
  }
  return sesi;
}

/** Daftar lokasi yang ditandai, dari basis data atau dari peramban: hanya bentuk yang dikenal, paling banyak sepuluh. */
export function bersihkanDiminati(mentah: unknown): Diminati[] {
  if (!Array.isArray(mentah)) return [];
  const hasil: Diminati[] = [];
  for (const x of mentah.slice(0, 10)) {
    if (typeof x !== "object" || x === null) continue;
    const { lahan_id, kode, spbu_nomor, potret } = x as Record<string, unknown>;
    if (typeof lahan_id !== "string" || lahan_id === "" || lahan_id.length > 80 || hasil.some((h) => h.lahan_id === lahan_id)) continue;
    hasil.push({
      lahan_id,
      kode: typeof kode === "string" ? kode.slice(0, 40) : "",
      spbu_nomor: typeof spbu_nomor === "string" ? spbu_nomor.slice(0, 20) : "",
      potret: typeof potret === "object" && potret !== null ? (potret as Diminati["potret"]) : undefined,
    });
  }
  return hasil;
}

/**
 * Provinsi dan kota yang punya ruang usaha kosong. Daftarnya sama untuk semua orang dan hanya berubah saat data
 * Brightspace dimuat ulang, jadi disimpan sementara satu jam alih-alih ditanyakan ke basis data di tiap kunjungan.
 * Klien di dalamnya tidak membawa cookie: fungsi ini memang terbuka untuk umum, dan cache tidak boleh bergantung
 * pada siapa yang bertanya. Daftar kosong (gangguan sesaat) tidak disimpan.
 */
async function wilayahTersimpan(): Promise<Wilayah[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await createUmum(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } }).rpc("temukan_wilayah");
  if (error || !Array.isArray(data) || data.length === 0) throw new Error("wilayah kosong");
  return data as Wilayah[];
}

export async function getWilayahTemukan(): Promise<Wilayah[]> {
  if (!supabaseSiap) return [];
  try {
    return await wilayahTersimpan();
  } catch {
    return [];
  }
}

export async function cariSpbuUmum(cari: string): Promise<SpbuUmum[]> {
  const hasil = await rpc<SpbuUmum[]>("temukan_cari_spbu", { p_cari: cari });
  return hasil.galat || !Array.isArray(hasil.data) ? [] : hasil.data;
}

export async function getSpbuUmum(id: string): Promise<SpbuRinci | null> {
  const hasil = await rpc<SpbuRinci>("temukan_spbu", { p_spbu_id: id });
  return hasil.galat ? null : (hasil.data ?? null);
}

export { KUKI as KUKI_TEMUKAN };
