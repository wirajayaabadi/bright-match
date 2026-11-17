import type { Pasangan } from "@/lib/data-tahap1";
import { n, pct, rp } from "@/lib/format";
import { namaTipe } from "@/lib/tipe-lokasi";

/**
 * Penjelasan skor Mesin kecocokan versi 2. Angkanya dihitung di basis data
 * (fungsi public.kecocokan); berkas ini hanya menerjemahkannya menjadi kalimat.
 */

/** Enam komponen skor dengan poin maksimumnya (total 100). */
export const KOMPONEN = [
  { kunci: "poin_tipe", nama: "Tipe lokasi", maks: 25 },
  { kunci: "poin_jaringan", nama: "Bukti jaringan", maks: 20 },
  { kunci: "poin_permintaan", nama: "Permintaan", maks: 20 },
  { kunci: "poin_pelengkap", nama: "Melengkapi jenis usaha yang ada", maks: 15 },
  { kunci: "poin_harga", nama: "Kecocokan harga", maks: 10 },
  { kunci: "poin_kesiapan", nama: "Kesiapan lahan", maks: 10 },
] as const;

const wilayah = (p: Pasangan) => (p.tingkat === "kota" ? (p.kota ?? "kota ini") : p.provinsi);
const kali = (v: number) => `${v.toFixed(2).replace(".", ",")}×`;

/** Alasan di balik skor, dari komponen berbobot terbesar. */
export function alasan(p: Pasangan): string[] {
  const hasil: string[] = [];

  // tipe lokasi
  if (p.tipe_lokasi == null) {
    hasil.push("Lingkungan SPBU ini belum terhitung, jadi tipe lokasi dan permintaan dinilai netral.");
  } else if (p.lift_tipe == null || p.pct_di_tipe == null) {
    hasil.push(`Belum ada usaha ${p.segmen} di SPBU bertipe ${namaTipe(p.tipe_lokasi).toLowerCase()}.`);
  } else {
    const arah = p.lift_tipe >= 1.15 ? "lebih sering" : p.lift_tipe <= 0.85 ? "lebih jarang" : "sama seringnya";
    hasil.push(
      `Lokasi bertipe ${namaTipe(p.tipe_lokasi).toLowerCase()}: usaha ${p.segmen} ada di ${pct(p.pct_di_tipe)} SPBU bertipe ini, ${arah} dibanding ${pct(p.pct_semua)} di seluruh jaringan (${kali(p.lift_tipe)}).`,
    );
  }

  // bukti jaringan
  if (p.n_pembanding > 0) {
    hasil.push(
      `${n(p.n_segmen)} dari ${n(p.n_pembanding)} lahan sejenis di ${wilayah(p)} disewa usaha ${p.segmen} (${pct((100 * p.n_segmen) / p.n_pembanding)}).`,
    );
  } else {
    hasil.push("Belum ada lahan sejenis yang tersewa di wilayah ini sebagai pembanding.");
  }
  if (p.tenant_lahan === 0) {
    // calon tenant baru: belum punya jejak di jaringan
    hasil.push(`${p.tenant} belum punya lahan di jaringan SPBU; ini akan menjadi lokasi pertamanya.`);
  } else if (p.lahan_di_kota > 0) {
    hasil.push(`${p.tenant} sudah menyewa ${n(p.lahan_di_kota)} lahan di ${p.kota ?? "kota ini"}.`);
  } else {
    hasil.push(`${p.tenant} belum ada di ${p.kota ?? "kota ini"}, tetapi punya ${n(p.lahan_di_provinsi)} lahan di ${p.provinsi}.`);
  }

  // permintaan
  if (p.penduduk_3km != null && p.poi_1km != null) {
    hasil.push(`Sekitar ${n(Math.round(p.penduduk_3km / 1000) * 1000)} penduduk dalam 3 km dan ${n(p.poi_1km)} tempat usaha dalam 1 km.`);
  }

  // pelengkap bauran dan usaha sejenis di sekitar
  let bauran = p.segmen_sudah_ada
    ? `SPBU ini sudah punya usaha ${p.segmen}, jadi tenant ini menambah pilihan, bukan jenis usaha baru.`
    : `SPBU ini belum punya usaha ${p.segmen}.`;
  if (p.sejenis_500m != null) {
    bauran += p.sejenis_500m === 0 ? " Tidak ada usaha sejenis dalam 500 m." : ` Ada ${n(p.sejenis_500m)} usaha sejenis dalam 500 m.`;
  }
  hasil.push(bauran);

  // harga
  if (p.tarif_tahunan == null) {
    hasil.push("Tarif lahan belum tercantum, jadi kecocokan harga dinilai netral.");
  } else if (p.tenant_lahan === 0) {
    // calon tenant: pembandingnya anggaran yang ia nyatakan
    hasil.push(
      p.tenant_tarif_p90 == null
        ? "Calon tidak menyebut anggaran sewa, jadi kecocokan harga dinilai netral."
        : `Tarif ${rp(p.tarif_tahunan)}/th berada dalam anggaran calon (${rp(p.tenant_tarif_p90)}/th).`,
    );
  } else if (p.tenant_tarif_median == null) {
    hasil.push("Tarif yang biasa dibayar tenant ini tidak tercatat, jadi kecocokan harga dinilai netral.");
  } else if (p.tarif_tahunan <= p.tenant_tarif_median) {
    hasil.push(`Tarif ${rp(p.tarif_tahunan)}/th tidak melebihi median yang dibayar tenant ini (${rp(p.tenant_tarif_median)}/th).`);
  } else {
    hasil.push(
      `Tarif ${rp(p.tarif_tahunan)}/th di atas median yang dibayar tenant ini (${rp(p.tenant_tarif_median)}/th), masih dalam batas atasnya.`,
    );
  }

  return hasil;
}

/** Syarat wajib yang tidak bisa dipastikan karena datanya kosong. */
export function perluDicek(p: Pasangan): string[] {
  const hasil: string[] = [];
  if (p.luas_ok == null) hasil.push("luas lahan");
  if (p.daya_ok == null) hasil.push("daya listrik");
  if (p.tarif_ok == null) hasil.push("tarif");
  return hasil;
}

/** Warna lencana skor: hijau ≥ 75, biru ≥ 60, abu-abu di bawahnya. */
export function kelasSkor(skor: number) {
  if (skor >= 75) return "bg-brand-green-soft text-brand-green-strong";
  if (skor >= 60) return "bg-brand-blue-soft text-brand-blue-strong";
  return "bg-canvas text-muted";
}

/** Alasan kecocokan dalam bahasa Inggris, untuk kartu penawaran berbahasa Inggris. */
export function alasanEn(p: Pasangan, namaJenis: string, namaTipeEn: string | null): string[] {
  const hasil: string[] = [];
  const angka = (v: number) => new Intl.NumberFormat("en-US").format(v);
  if (namaTipeEn && p.lift_tipe != null && p.pct_di_tipe != null) {
    hasil.push(
      `${namaJenis} businesses operate at ${p.pct_di_tipe}% of stations in ${namaTipeEn.toLowerCase()} locations, against ${p.pct_semua}% across the network.`,
    );
  }
  if (p.n_pembanding > 0) {
    hasil.push(`${angka(p.n_segmen)} of ${angka(p.n_pembanding)} comparable spaces in ${p.tingkat === "kota" ? (p.kota ?? "this city") : p.provinsi} are rented by ${namaJenis.toLowerCase()} businesses.`);
  }
  if (p.penduduk_3km != null && p.poi_1km != null) {
    hasil.push(`About ${angka(Math.round(p.penduduk_3km / 1000) * 1000)} people live within 3 km, with ${angka(p.poi_1km)} businesses within 1 km.`);
  }
  hasil.push(
    p.segmen_sudah_ada
      ? `The station already has a ${namaJenis.toLowerCase()} tenant.`
      : `The station has no ${namaJenis.toLowerCase()} tenant yet.`,
  );
  if (p.sejenis_500m != null) {
    hasil.push(p.sejenis_500m === 0 ? "No similar business within 500 m." : `${angka(p.sejenis_500m)} similar businesses within 500 m.`);
  }
  return hasil;
}
