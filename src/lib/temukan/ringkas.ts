import { kolomAktif, langkahAktif } from "./cabang.ts";
import { SEGMEN_KARTU } from "./tenant-v1.ts";
import type { JawabAnggaran, JawabIsian, JawabRuang, JawabSpbu, JawabWilayah, Jawaban, Kuesioner, Pertanyaan, Sifat } from "./tipe.ts";

/** Ringkasan preferensi dan pengolahan jawaban menjadi masukan layanan yang sudah ada. */

const angka = new Intl.NumberFormat("id-ID");

/** Rupiah ringkas: Rp 25 juta, Rp 1,5 miliar. */
export function rpRingkas(v: number) {
  if (v >= 1_000_000_000) return `Rp ${angka.format(Math.round(v / 10_000_000) / 100)} miliar`;
  if (v >= 1_000_000) return `Rp ${angka.format(Math.round(v / 10_000) / 100)} juta`;
  if (v >= 10_000) return `Rp ${angka.format(Math.round(v / 1000))} ribu`;
  return `Rp ${angka.format(Math.round(v))}`;
}

export const namaWilayah = (w: { provinsi: string; kota: string | null }) => (w.kota ? `${w.kota}, ${w.provinsi}` : `Seluruh ${w.provinsi}`);

export function teksAnggaran(a: JawabAnggaran): string {
  if (a.pilihan === "belum") return "Belum ditentukan";
  const bagi = a.satuan === "bulan" ? 12 : 1;
  const per = a.satuan === "bulan" ? "per bulan" : "per tahun";
  const maks = a.maks != null ? rpRingkas(a.maks / bagi) : null;
  const min = a.min != null ? rpRingkas(a.min / bagi) : null;
  const rentang = min && maks ? `${min} – ${maks}` : maks ? `Sampai ${maks}` : min ? `Di atas ${min}` : "Belum ditentukan";
  return `${rentang} ${per}${a.fleksibel ? ", fleksibel" : ""}`;
}

/** Alamat SPBU untuk ditampilkan. Alamat di sumber sering sudah memuat kotanya, jadi kota tidak diulang. */
export function alamatSpbu(s: { alamat: string | null; kota: string | null; provinsi: string }): string {
  const wilayah = [s.kota, s.provinsi].filter(Boolean).join(", ");
  if (!s.alamat) return wilayah;
  const a = s.alamat.toLowerCase();
  return a.includes(s.provinsi.toLowerCase()) || (s.kota !== null && a.includes(s.kota.toLowerCase())) ? s.alamat : `${s.alamat}, ${wilayah}`;
}

/** Letak dan lantai ruang dalam ejaan yang rapi. Nilai sumbernya "Didalam Bangunan", "Diluar Bangunan", "Lantai 1". */
export function letakRuang(r: { posisi: string | null; lantai: string | null }): string[] {
  const posisi = r.posisi === "Didalam Bangunan" ? "Di dalam bangunan" : r.posisi === "Diluar Bangunan" ? "Di luar bangunan" : r.posisi;
  const lantai = r.lantai ? (/^lantai/i.test(r.lantai) ? r.lantai : `Lantai ${r.lantai}`) : null;
  return [posisi, lantai].filter((x): x is string => Boolean(x));
}

export type ButirRingkas = {
  id: string;
  ringkas: string;
  sifat: Sifat;
  inti: boolean;
  /** Isi jawaban dalam kalimat pendek; kosong bila dilewati atau belum dijawab. */
  butir: string[];
  dilewati: boolean;
};

function butirPertanyaan(p: Pertanyaan, v: unknown, semua: Jawaban): string[] {
  switch (p.jenis) {
    case "pilih": {
      const nilai = v as string[];
      const nama = nilai.map((x) => p.pilihan.find((o) => o.nilai === x)?.nama ?? x);
      return p.urut ? nama.map((x, i) => `${i + 1}. ${x}`) : nama;
    }
    case "wilayah": {
      const w = v as JawabWilayah;
      if (w.terbuka) return ["Terbuka di berbagai wilayah"];
      return [...w.daftar.map(namaWilayah), ...(w.lain ? ["Wilayah lain boleh disarankan"] : [])];
    }
    case "anggaran":
      return [teksAnggaran(v as JawabAnggaran)];
    case "isian": {
      const isi = v as JawabIsian;
      const hasil: string[] = [];
      for (const c of kolomAktif(p, semua, isi)) {
        const x = isi[c.id];
        if (x === undefined) continue;
        if (c.jenis === "angka") hasil.push(`${c.nama}: ${angka.format(x as number)} ${c.satuan}`);
        else if (c.jenis === "pilih") hasil.push(`${c.nama}: ${c.pilihan.find((o) => o.nilai === x)?.nama ?? String(x)}`);
        else if (c.jenis === "centang") hasil.push(`${c.nama}: ${(x as string[]).map((y) => c.pilihan.find((o) => o.nilai === y)?.nama ?? y).join(", ")}`);
        else hasil.push(`${c.nama}: ${x as string}`);
      }
      return hasil.length > 0 ? hasil : ["Belum ada kebutuhan khusus"];
    }
    case "spbu": {
      const s = v as JawabSpbu;
      if (s.terdaftar) return [`SPBU ${s.nomor}`, [s.kota, s.provinsi].filter(Boolean).join(", ")];
      return [`${s.nomor ? `SPBU ${s.nomor}` : "SPBU"} di ${s.kota}`, "Belum terdaftar; penambahan perlu diperiksa tim Non Fuel Retail"];
    }
    case "ruang": {
      const r = v as JawabRuang;
      return [
        ...(r.semua ? ["Semua ruang kosong yang tercatat"] : r.lahan.map((l) => l.kode)),
        ...(r.usul ? [`Usulan ruang baru: ${r.usul}`] : []),
      ];
    }
  }
}

/** Ringkasan untuk kartu preferensi: satu baris per pertanyaan yang tampil. */
export function ringkasan(k: Kuesioner, jawaban: Jawaban, dilewati: string[] = []): ButirRingkas[] {
  return langkahAktif(k, jawaban).map((p) => {
    const v = jawaban[p.id];
    return {
      id: p.id,
      ringkas: p.ringkas,
      sifat: p.sifat,
      inti: p.inti,
      butir: v === undefined ? [] : butirPertanyaan(p, v, jawaban),
      dilewati: v === undefined && dilewati.includes(p.id),
    };
  });
}

/**
 * Segmen mesin kecocokan dari jawaban tenant. Kartu dengan dua segmen dipersempit oleh pertanyaan
 * lanjutannya; bila lanjutan itu dilewati, kedua segmen tetap dipakai.
 */
export function segmenDari(jawaban: Jawaban): string[] {
  const kartu = Array.isArray(jawaban.usaha) ? jawaban.usaha[0] : undefined;
  const semua = kartu ? (SEGMEN_KARTU[kartu] ?? []) : [];
  const rinci = jawaban[`rinci_${kartu}`];
  const pilih = Array.isArray(rinci) ? rinci.filter((x) => semua.includes(x)) : [];
  return pilih.length > 0 ? pilih : semua;
}

/** Isian awal formulir "Jadi Bright Partner" dari jawaban tenant. Hanya kolom yang memang dijawab. */
export function keCalon(k: Kuesioner, jawaban: Jawaban): Record<string, string | string[]> {
  const hasil: Record<string, string | string[]> = {};
  const segmen = segmenDari(jawaban);
  if (segmen.length === 1) hasil.segmen = segmen[0];
  const ruang = jawaban.ruang as JawabIsian | undefined;
  if (ruang) {
    if (typeof ruang.luas_min === "number") hasil.luas_min = String(ruang.luas_min);
    if (typeof ruang.luas_maks === "number") hasil.luas_maks = String(ruang.luas_maks);
    if (typeof ruang.daya_min === "number") hasil.daya_min = String(ruang.daya_min);
    if (ruang.posisi === "dalam" || ruang.posisi === "luar") hasil.posisi = ruang.posisi;
  }
  const anggaran = jawaban.anggaran as JawabAnggaran | undefined;
  if (anggaran?.maks != null) hasil.anggaran_tahunan = String(anggaran.maks);
  const wilayah = jawaban.wilayah as JawabWilayah | undefined;
  if (wilayah && !wilayah.terbuka) hasil.provinsi_minat = [...new Set(wilayah.daftar.map((w) => w.provinsi))];
  const pelanggan = k.pertanyaan.find((p) => p.id === "pelanggan");
  if (pelanggan?.jenis === "pilih" && Array.isArray(jawaban.pelanggan)) {
    hasil.target_pasar = (jawaban.pelanggan as string[]).map((x) => pelanggan.pilihan.find((o) => o.nilai === x)?.nama ?? x).join(", ");
  }
  return hasil;
}
