const angka = new Intl.NumberFormat("id-ID");
const satuDesimal = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 31861 → "31.861" */
export const n = (v: number | null | undefined) => (v == null ? "–" : angka.format(v));

/** 82.5 → "82,5%" */
export const pct = (v: number | null | undefined) => (v == null ? "–" : `${satuDesimal.format(v)}%`);

/** Rupiah ringkas: 106336314752 → "Rp 106,3 M", 538300000 → "Rp 538,3 jt". */
export function rp(v: number | null | undefined) {
  if (v == null) return "–";
  if (v >= 1e12) return `Rp ${satuDesimal.format(v / 1e12)} T`;
  if (v >= 1e9) return `Rp ${satuDesimal.format(v / 1e9)} M`;
  if (v >= 1e6) return `Rp ${satuDesimal.format(v / 1e6)} jt`;
  return `Rp ${angka.format(Math.round(v))}`;
}

/** 4 → "4 m²" */
export const luas = (v: number | null | undefined) => (v == null ? "–" : `${angka.format(v)} m²`);

/** 1300 → "1.300 W" */
export const daya = (v: number | null | undefined) => (v == null ? "–" : `${angka.format(v)} W`);

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-11-12" → "12 Nov 2026". Dipotong dari teksnya, tanpa objek Date, agar tidak bergeser zona waktu. */
export function tanggal(iso: string | null | undefined) {
  if (!iso) return "–";
  const [t, b, h] = iso.slice(0, 10).split("-").map(Number);
  return `${h} ${BULAN[b - 1]} ${t}`;
}

/** Ambil satu nilai dari parameter URL yang bisa berupa teks atau daftar. */
export const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Susun alamat dengan parameter; nilai kosong dilewati. */
export function alamat(path: string, params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const teks = q.toString();
  return teks ? `${path}?${teks}` : path;
}
