/**
 * Gambar Brightspace yang disimpan di object storage (Cloudflare R2).
 * Tabel `gambar` hanya menyimpan kunci objek; alamatnya dirangkai di sini.
 */
export type Gambar = {
  kunci: string;
  lebar: number | null;
  tinggi: number | null;
  /** Dari nama berkas asli di Brightspace, mis. "Pintu Masuk". Sering berupa kode yang tidak bermakna. */
  label: string | null;
  diunggah: string | null;
  /** Keterangan dari aplikasi, mis. "SPBU 3412804, Kodya Jakarta Selatan · 3412804-IN-002". Tampil apa adanya. */
  keterangan?: string | null;
};

/**
 * Alamat dasar foto, tanpa garis miring di akhir.
 * - "/foto": lewat aplikasi ini (src/app/foto), yang mengambil berkas dari R2 dengan kredensial R2_*.
 *   Dipakai karena alamat r2.dev diblokir di sebagian jaringan Indonesia.
 * - "https://foto.domain-anda": langsung dari bucket, bila bucket sudah dipasangi domain sendiri.
 * Kosong = foto tidak ditampilkan.
 */
const DASAR = (process.env.NEXT_PUBLIC_GAMBAR_URL ?? "").replace(/\/+$/, "");

export const gambarSiap = DASAR !== "";

/** `kecil` = thumbnail 480 px; selain itu versi utama (sisi terpanjang 1600 px). */
export const urlGambar = (kunci: string, kecil = false) =>
  `${DASAR}/${kecil ? kunci.replace(/\.webp$/, "-480.webp") : kunci}`;

/**
 * Label hanya ditampilkan bila terbaca sebagai keterangan, mis. "Pintu Masuk". Nama berkas bawaan kamera
 * atau aplikasi ("IMG 7707", "Whats App Image 20260216at 145850", "1000239254") tidak ditampilkan.
 */
export function labelGambar(g: Gambar): string | null {
  if (g.keterangan) return g.keterangan;
  const l = g.label?.trim() ?? "";
  if (l.length < 4 || !/[a-z]{3}/i.test(l) || /\d{5}/.test(l)) return null;
  if (/^(img|dsc|dcim|wa|whats ?app|image|foto|photo|screenshot|screen ?shot|pxl|cam)\b/i.test(l)) return null;
  return l;
}

/** Rentang waktu unggah foto, mis. "Jul 2025" atau "Jul 2025 sampai Feb 2026". null bila tidak tercatat. */
export function rentangUnggah(gambar: Gambar[]): string | null {
  const t = gambar.map((g) => g.diunggah?.slice(0, 7)).filter((x): x is string => Boolean(x)).sort();
  if (t.length === 0) return null;
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const teks = (ym: string) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  return t[0] === t[t.length - 1] ? teks(t[0]) : `${teks(t[0])} sampai ${teks(t[t.length - 1])}`;
}
