import { namaTipe } from "../tipe-lokasi.ts";
import { letakRuang, rpRingkas, segmenDari } from "./ringkas.ts";
import type { JawabAnggaran, JawabIsian, JawabWilayah, Jawaban, Potret, Wilayah } from "./tipe.ts";

/**
 * Rekomendasi lokasi untuk calon tenant: pengolahan jawaban menjadi profil mesin, dan lapis ketiga
 * (kesesuaian preferensi). Lapis pertama dan kedua, yaitu syarat wajib dan skor kecocokan, dihitung
 * mesin kecocokan di basis data dan tidak diubah di sini.
 *
 * Kesesuaian preferensi adalah angka tersendiri: seberapa dekat satu lokasi dengan hal yang pengguna
 * sebut penting. Ia bukan skor kecocokan dan bukan perkiraan hasil usaha.
 */

/** Versi rumus kesesuaian preferensi. Naikkan bila bobot atau faktor berubah. */
export const VERSI_PREFERENSI = "p1";

const angka = new Intl.NumberFormat("id-ID");
const jepit = (v: number) => Math.min(1, Math.max(0, v));

// ------------------------------------------------------------------ profil untuk mesin

/** Masukan fungsi basis data temukan_lokasi. Hanya syarat wajib; preferensi tidak ikut menyaring. */
export type ProfilLokasi = {
  segmen: string[];
  wilayah: Wilayah[];
  lain: boolean;
  luas_min?: string;
  daya_min?: string;
  anggaran?: string;
  anggaran_fleksibel: boolean;
  posisi: "dalam" | "luar" | "bebas";
};

/** Profil mesin dari jawaban tenant. null bila jenis usaha belum dijawab. */
export function profilLokasi(jawaban: Jawaban): ProfilLokasi | null {
  const segmen = segmenDari(jawaban);
  if (segmen.length === 0) return null;
  const wilayah = jawaban.wilayah as JawabWilayah | undefined;
  const ruang = (jawaban.ruang as JawabIsian | undefined) ?? {};
  const anggaran = jawaban.anggaran as JawabAnggaran | undefined;
  return {
    segmen,
    wilayah: wilayah && !wilayah.terbuka ? wilayah.daftar : [],
    lain: wilayah?.lain === true && !wilayah.terbuka,
    luas_min: typeof ruang.luas_min === "number" ? String(ruang.luas_min) : undefined,
    daya_min: typeof ruang.daya_min === "number" ? String(ruang.daya_min) : undefined,
    anggaran: anggaran?.maks != null ? String(anggaran.maks) : undefined,
    anggaran_fleksibel: anggaran?.maks != null && anggaran.fleksibel,
    posisi: ruang.posisi === "dalam" || ruang.posisi === "luar" ? ruang.posisi : "bebas",
  };
}

/**
 * Syarat yang bisa dilonggarkan, untuk tampilan kosong. Tiap butir adalah profil yang sama dengan satu
 * syarat dilepas. Hanya dipakai untuk menghitung "berapa lokasi bila syarat ini dilepas"; profil pengguna
 * tidak pernah diubah otomatis.
 */
export function pelonggaran(p: ProfilLokasi): { kunci: string; nama: string; ubah: string; profil: ProfilLokasi }[] {
  const hasil: { kunci: string; nama: string; ubah: string; profil: ProfilLokasi }[] = [];
  if (p.anggaran) hasil.push({ kunci: "anggaran", nama: "Tanpa batas anggaran sewa", ubah: "anggaran", profil: { ...p, anggaran: undefined, anggaran_fleksibel: false } });
  if (p.luas_min) hasil.push({ kunci: "luas", nama: "Tanpa luas minimum", ubah: "ruang", profil: { ...p, luas_min: undefined } });
  if (p.daya_min) hasil.push({ kunci: "daya", nama: "Tanpa daya listrik minimum", ubah: "ruang", profil: { ...p, daya_min: undefined } });
  if (p.posisi !== "bebas") hasil.push({ kunci: "posisi", nama: "Letak di dalam atau di luar bangunan", ubah: "ruang", profil: { ...p, posisi: "bebas" } });
  if (p.wilayah.length > 0) hasil.push({ kunci: "wilayah", nama: "Di seluruh Indonesia", ubah: "wilayah", profil: { ...p, wilayah: [], lain: false } });
  return hasil;
}

// ------------------------------------------------------------------ hasil mesin

export type Lokasi = {
  lahan_id: string;
  kode: string;
  spbu_nomor: string;
  alamat: string | null;
  kota: string | null;
  provinsi: string;
  lat: number | null;
  lng: number | null;
  fasilitas: string[];
  luas_m2: number | null;
  daya_w: number | null;
  /** Tarif acuan Brightspace per tahun. Bukan penawaran. */
  tarif_tahunan: number | null;
  posisi: string | null;
  lantai: string | null;
  segmen: string;
  tingkat: "kota" | "provinsi";
  n_segmen: number;
  n_pembanding: number;
  segmen_sudah_ada: boolean;
  luas_ok: boolean | null;
  daya_ok: boolean | null;
  tarif_ok: boolean | null;
  tipe_lokasi: string | null;
  lift_tipe: number | null;
  pct_di_tipe: number | null;
  pct_semua: number | null;
  penduduk_3km: number | null;
  poi_1km: number | null;
  sejenis_500m: number | null;
  poin_jaringan: number;
  poin_pelengkap: number;
  poin_harga: number;
  poin_kesiapan: number;
  poin_tipe: number;
  poin_permintaan: number;
  skor: number;
  terverifikasi: boolean;
  kesiapan: string | null;
  di_wilayah: boolean;
};

export type SumberData = { kunci: string; nama: string; per_tanggal: string | null };

export type HasilLokasi = {
  versi_model: string;
  sumber: SumberData[];
  /** Semua lokasi yang lolos syarat di wilayah pilihan (bisa lebih banyak dari daftar yang dikirim). */
  jumlah: number;
  jumlah_lain: number;
  /** Lolos syarat tetapi tidak ditampilkan: ditahan, datanya disengketakan, atau sedang menuju kontrak. */
  tertahan: number;
  lokasi: Lokasi[];
};

/** Enam komponen skor mesin dengan poin maksimumnya (total 100). Sama dengan src/lib/kecocokan.ts. */
export const KOMPONEN_SKOR = [
  { kunci: "poin_tipe", nama: "Tipe lokasi", maks: 25 },
  { kunci: "poin_jaringan", nama: "Bukti jaringan", maks: 20 },
  { kunci: "poin_permintaan", nama: "Permintaan", maks: 20 },
  { kunci: "poin_pelengkap", nama: "Melengkapi jenis usaha yang ada", maks: 15 },
  { kunci: "poin_harga", nama: "Kecocokan harga", maks: 10 },
  { kunci: "poin_kesiapan", nama: "Kelengkapan data lahan", maks: 10 },
] as const;

// ------------------------------------------------------------------ lapis 3: kesesuaian preferensi

export type Faktor = {
  kunci: string;
  nama: string;
  bobot: number;
  /** 0 sampai 1. null = belum ada datanya, jadi faktor ini tidak ikut dihitung. */
  nilai: number | null;
  alasan: string;
};

export type Kesesuaian = {
  /** 0 sampai 100, rata-rata berbobot faktor yang ada datanya. null bila tidak satu pun bisa dinilai. */
  skor: number | null;
  faktor: Faktor[];
};

/** Urutan prioritas menjadi bobot: pertama 3, kedua 2, ketiga 1. Faktor di luar prioritas berbobot 1. */
const BOBOT_PRIORITAS = [3, 2, 1];

/** Pelanggan utama ke tipe lokasi yang biasa dekat dengannya. Pengendara tidak dipetakan: semua SPBU melayani mereka. */
const TIPE_PELANGGAN: Record<string, string[]> = {
  kantor: ["perkantoran", "pusat_kota", "komersial"],
  industri: ["industri"],
  warga: ["perumahan"],
};
const NAMA_PELANGGAN: Record<string, string> = { kantor: "pekerja perkantoran", industri: "pekerja industri dan logistik", warga: "warga sekitar" };

export type KonteksDaftar = {
  /** Tarif semua lokasi di daftar, urut naik. Dipakai bila pengguna tidak menyebut anggaran. */
  tarifUrut: number[];
};

export const konteksDaftar = (daftar: Lokasi[]): KonteksDaftar => ({
  tarifUrut: daftar.map((l) => l.tarif_tahunan).filter((t): t is number => t != null).sort((a, b) => a - b),
});

function faktorPrioritas(kunci: string, l: Lokasi, jawaban: Jawaban, k: KonteksDaftar): Omit<Faktor, "bobot"> {
  switch (kunci) {
    case "biaya": {
      const maks = (jawaban.anggaran as JawabAnggaran | undefined)?.maks ?? null;
      if (l.tarif_tahunan == null) return { kunci, nama: "Biaya sewa terjangkau", nilai: null, alasan: "Tarif acuan ruang ini belum tercatat." };
      if (maks != null) {
        const rasio = l.tarif_tahunan / maks;
        return {
          kunci,
          nama: "Biaya sewa terjangkau",
          nilai: jepit((1.25 - rasio) / 0.75),
          alasan: `Tarif acuan ${rpRingkas(l.tarif_tahunan)} per tahun, ${angka.format(Math.round(rasio * 100))}% dari anggaran tertinggi Anda.`,
        };
      }
      const lebihMahal = k.tarifUrut.filter((t) => t > l.tarif_tahunan!).length;
      const nilai = k.tarifUrut.length > 1 ? lebihMahal / (k.tarifUrut.length - 1) : 0.5;
      return {
        kunci,
        nama: "Biaya sewa terjangkau",
        nilai: jepit(nilai),
        alasan: `Tarif acuan ${rpRingkas(l.tarif_tahunan)} per tahun, lebih rendah dari ${angka.format(Math.round(jepit(nilai) * 100))}% lokasi lain di daftar ini.`,
      };
    }
    case "pelanggan":
      if (l.penduduk_3km == null || l.poi_1km == null) return { kunci, nama: "Potensi pelanggan", nilai: null, alasan: "Lingkungan SPBU ini belum terhitung." };
      return {
        kunci,
        nama: "Potensi pelanggan",
        nilai: jepit(l.poin_permintaan / 20),
        alasan: `Sekitar ${angka.format(Math.round(l.penduduk_3km / 1000) * 1000)} penduduk dalam 3 km dan ${angka.format(l.poi_1km)} tempat usaha dalam 1 km. Ini keramaian sekitar, bukan jumlah pembeli.`,
      };
    case "infrastruktur": {
      const siap = l.terverifikasi ? (l.kesiapan === "siap" ? 1 : 0.5) : 0;
      return {
        kunci,
        nama: "Infrastruktur siap pakai",
        nilai: jepit(0.6 * (l.poin_kesiapan / 10) + 0.4 * siap),
        alasan: l.terverifikasi
          ? l.kesiapan === "siap"
            ? "Ruang sudah diperiksa di lokasi dan dinyatakan siap dipakai."
            : "Ruang sudah diperiksa di lokasi; kesiapannya belum dinyatakan siap."
          : "Kelengkapan data dinilai dari Brightspace; ruang belum diperiksa di lokasi.",
      };
    }
    case "persaingan": {
      const s = l.sejenis_500m;
      if (s == null) return { kunci, nama: "Persaingan yang sesuai", nilai: null, alasan: "Belum ada data usaha sejenis di sekitar SPBU ini." };
      return {
        kunci,
        nama: "Persaingan yang sesuai",
        nilai: s === 0 ? 1 : s <= 2 ? 0.7 : s <= 5 ? 0.4 : 0.15,
        alasan: s === 0 ? "Tidak ada usaha sejenis dalam 500 m." : `Ada ${angka.format(s)} usaha sejenis dalam 500 m.`,
      };
    }
    case "akses":
      return { kunci, nama: "Akses dan visibilitas", nilai: null, alasan: "Belum ada data akses dan visibilitas; baru bisa dinilai saat survei lokasi." };
    default:
      return { kunci: "jaringan", nama: "Dekat dengan jaringan usaha saat ini", nilai: null, alasan: "Kami belum punya data lokasi usaha Anda saat ini." };
  }
}

/** Kesesuaian satu lokasi dengan preferensi pengguna. Rumusnya lengkap di sini dan diuji di tests/. */
export function kesesuaian(l: Lokasi, jawaban: Jawaban, k: KonteksDaftar): Kesesuaian {
  const faktor: Faktor[] = [];

  const prioritas = Array.isArray(jawaban.prioritas) ? (jawaban.prioritas as string[]) : [];
  prioritas.slice(0, 3).forEach((p, i) => faktor.push({ ...faktorPrioritas(p, l, jawaban, k), bobot: BOBOT_PRIORITAS[i] }));

  const pelanggan = Array.isArray(jawaban.pelanggan) ? (jawaban.pelanggan as string[]).filter((x) => x in TIPE_PELANGGAN) : [];
  if (pelanggan.length > 0) {
    const cocok = pelanggan.filter((x) => l.tipe_lokasi != null && TIPE_PELANGGAN[x].includes(l.tipe_lokasi));
    const nama = pelanggan.map((x) => NAMA_PELANGGAN[x]).join(", ");
    faktor.push({
      kunci: "karakter",
      nama: "Karakter lokasi sesuai pelanggan",
      bobot: 1,
      nilai: l.tipe_lokasi == null ? null : cocok.length > 0 ? 1 : 0.3,
      alasan:
        l.tipe_lokasi == null
          ? "Tipe lokasi SPBU ini belum terhitung."
          : cocok.length > 0
            ? `Lokasi bertipe ${namaTipe(l.tipe_lokasi).toLowerCase()}, yang biasa dekat dengan ${cocok.map((x) => NAMA_PELANGGAN[x]).join(", ")}.`
            : `Lokasi bertipe ${namaTipe(l.tipe_lokasi).toLowerCase()}, bukan tipe yang biasa dekat dengan ${nama}.`,
    });
  }

  const waktu = Array.isArray(jawaban.waktu) ? jawaban.waktu[0] : undefined;
  if (waktu === "segera" || waktu === "b1_3") {
    faktor.push({
      kunci: "waktu",
      nama: "Siap untuk rencana buka Anda",
      bobot: 1,
      nilai: l.terverifikasi ? (l.kesiapan === "siap" ? 1 : 0.7) : 0.3,
      alasan: l.terverifikasi ? "Ruang sudah diperiksa di lokasi, jadi lebih cepat diproses." : "Ruang belum diperiksa di lokasi; inspeksi perlu waktu sebelum penawaran resmi.",
    });
  }

  const luasMaks = (jawaban.ruang as JawabIsian | undefined)?.luas_maks;
  if (typeof luasMaks === "number") {
    faktor.push({
      kunci: "luas",
      nama: "Tidak melebihi luas maksimum",
      bobot: 1,
      nilai: l.luas_m2 == null ? null : l.luas_m2 <= luasMaks ? 1 : jepit(2 - l.luas_m2 / luasMaks),
      alasan:
        l.luas_m2 == null
          ? "Luas ruang ini belum tercatat."
          : l.luas_m2 <= luasMaks
            ? `Luas ${angka.format(l.luas_m2)} m², dalam batas ${angka.format(luasMaks)} m² yang Anda inginkan.`
            : `Luas ${angka.format(l.luas_m2)} m², di atas ${angka.format(luasMaks)} m² yang Anda inginkan.`,
    });
  }

  const ada = faktor.filter((f) => f.nilai != null);
  const bobot = ada.reduce((a, f) => a + f.bobot, 0);
  return { skor: bobot > 0 ? Math.round((100 * ada.reduce((a, f) => a + f.bobot * (f.nilai as number), 0)) / bobot) : null, faktor };
}

// ------------------------------------------------------------------ alasan dan tanda

/** Alasan dari skor mesin, dengan kekuatannya (bagian poin yang diraih). */
function alasanMesin(l: Lokasi): { kuat: number; teks: string }[] {
  const hasil: { kuat: number; teks: string }[] = [];
  const usaha = l.segmen;
  if (l.tipe_lokasi != null && l.lift_tipe != null && l.pct_di_tipe != null && l.pct_semua != null) {
    const arah = l.lift_tipe >= 1.15 ? "lebih sering" : l.lift_tipe <= 0.85 ? "lebih jarang" : "sama seringnya";
    hasil.push({
      kuat: l.poin_tipe / 25,
      teks: `Lokasi bertipe ${namaTipe(l.tipe_lokasi).toLowerCase()}: usaha ${usaha} ada di ${angka.format(l.pct_di_tipe)}% SPBU bertipe ini, ${arah} dibanding ${angka.format(l.pct_semua)}% di seluruh jaringan.`,
    });
  }
  if (l.n_pembanding > 0) {
    const wilayah = l.tingkat === "kota" ? (l.kota ?? "kota ini") : l.provinsi;
    hasil.push({
      kuat: l.poin_jaringan / 20,
      teks: `${angka.format(l.n_segmen)} dari ${angka.format(l.n_pembanding)} ruang sejenis di ${wilayah} disewa usaha ${usaha}.`,
    });
  }
  if (l.penduduk_3km != null && l.poi_1km != null) {
    hasil.push({
      kuat: l.poin_permintaan / 20,
      teks: `Sekitar ${angka.format(Math.round(l.penduduk_3km / 1000) * 1000)} penduduk dalam 3 km dan ${angka.format(l.poi_1km)} tempat usaha dalam 1 km.`,
    });
  }
  hasil.push({
    kuat: l.poin_pelengkap / 15,
    teks: l.segmen_sudah_ada ? `SPBU ini sudah punya usaha ${usaha}; Anda menambah pilihan, bukan jenis usaha baru.` : `SPBU ini belum punya usaha ${usaha}.`,
  });
  return hasil;
}

/** Tiga alasan terkuat: gabungan alasan mesin dan faktor preferensi yang nilainya tinggi. */
export function alasanUtama(l: Lokasi, s: Kesesuaian, jumlah = 3): string[] {
  const calon = [
    ...alasanMesin(l),
    // Faktor preferensi didahulukan sedikit bila sama kuat: itulah yang pengguna sebut penting.
    ...s.faktor.filter((f) => f.nilai != null && f.nilai >= 0.6).map((f) => ({ kuat: (f.nilai as number) + 0.05 * f.bobot, teks: f.alasan })),
  ];
  const unik = calon.filter((c, i) => calon.findIndex((x) => x.teks.slice(0, 40) === c.teks.slice(0, 40)) === i);
  return unik.sort((a, b) => b.kuat - a.kuat).slice(0, jumlah).map((c) => c.teks);
}

/** Semua alasan mesin, untuk rincian. */
export const alasanLengkap = (l: Lokasi): string[] => alasanMesin(l).map((a) => a.teks);

/**
 * Syarat wajib yang belum bisa dipastikan untuk satu lokasi: pengguna menyebut syaratnya, tetapi datanya
 * kosong di sumber. Mesin meloloskan lokasi seperti ini (belum terbukti melanggar); di layar ia harus bertanda.
 */
export function syaratBelumPasti(l: Lokasi, jawaban: Jawaban): string[] {
  const ruang = (jawaban.ruang as JawabIsian | undefined) ?? {};
  const maks = (jawaban.anggaran as JawabAnggaran | undefined)?.maks ?? null;
  return [
    typeof ruang.luas_min === "number" && l.luas_m2 == null ? "luas" : null,
    typeof ruang.daya_min === "number" && l.daya_w == null ? "daya listrik" : null,
    maks != null && l.tarif_tahunan == null ? "tarif acuan" : null,
  ].filter((x): x is string => x !== null);
}

/** Hal yang perlu diketahui sebelum menilai lokasi ini: syarat yang belum pasti, tarif di atas anggaran, dan wilayah. */
export function catatanLokasi(l: Lokasi, jawaban: Jawaban): string[] {
  const hasil: string[] = [];
  const kosong = syaratBelumPasti(l, jawaban);
  if (kosong.length > 0) hasil.push(`Belum tercatat: ${kosong.join(", ")}. Syarat Anda untuk hal itu belum bisa dipastikan sampai ruang diperiksa.`);
  const maks = (jawaban.anggaran as JawabAnggaran | undefined)?.maks ?? null;
  if (maks != null && l.tarif_tahunan != null && l.tarif_tahunan > maks) {
    hasil.push(`Tarif acuan di atas anggaran Anda (${rpRingkas(maks)} per tahun). Ditampilkan karena anggaran Anda fleksibel.`);
  }
  if (!l.di_wilayah) hasil.push("Di luar wilayah yang Anda pilih. Ditampilkan karena Anda mengizinkan saran wilayah lain.");
  return hasil;
}

// ------------------------------------------------------------------ urutan dan saringan

export type CaraUrut = "sesuai" | "skor" | "preferensi" | "tarif" | "luas";

export const CARA_URUT: { nilai: CaraUrut; nama: string }[] = [
  { nilai: "sesuai", nama: "Paling sesuai" },
  { nilai: "skor", nama: "Skor kecocokan tertinggi" },
  { nilai: "preferensi", nama: "Kesesuaian preferensi tertinggi" },
  { nilai: "tarif", nama: "Tarif acuan terendah" },
  { nilai: "luas", nama: "Luas terbesar" },
];

export type LokasiDinilai = { lokasi: Lokasi; sesuai: Kesesuaian };

/**
 * "Paling sesuai" = rata-rata skor kecocokan dan kesesuaian preferensi. Lokasi yang preferensinya
 * belum bisa dinilai memakai skor kecocokannya saja. Nilai kosong selalu di urutan akhir.
 */
export function urutkan(daftar: LokasiDinilai[], cara: CaraUrut): LokasiDinilai[] {
  const gabung = (x: LokasiDinilai) => (x.sesuai.skor == null ? x.lokasi.skor : (x.lokasi.skor + x.sesuai.skor) / 2);
  const kunci: Record<CaraUrut, (x: LokasiDinilai) => number | null> = {
    sesuai: gabung,
    skor: (x) => x.lokasi.skor,
    preferensi: (x) => x.sesuai.skor,
    tarif: (x) => (x.lokasi.tarif_tahunan == null ? null : -x.lokasi.tarif_tahunan),
    luas: (x) => x.lokasi.luas_m2,
  };
  const ambil = kunci[cara];
  return [...daftar].sort((a, b) => {
    const [x, y] = [ambil(a), ambil(b)];
    if (x == null || y == null) return x == null && y == null ? b.lokasi.skor - a.lokasi.skor : x == null ? 1 : -1;
    return y - x || b.lokasi.skor - a.lokasi.skor || a.lokasi.kode.localeCompare(b.lokasi.kode);
  });
}

export type Saring = { cari: string; kota: string; terverifikasi: boolean };

export function saring(daftar: LokasiDinilai[], s: Saring): LokasiDinilai[] {
  const k = s.cari.trim().toLowerCase();
  return daftar.filter(({ lokasi: l }) => {
    if (s.kota && `${l.provinsi}|${l.kota ?? ""}` !== s.kota) return false;
    if (s.terverifikasi && !l.terverifikasi) return false;
    return k === "" || [l.kode, l.spbu_nomor, l.alamat ?? "", l.kota ?? "", l.provinsi].some((x) => x.toLowerCase().includes(k));
  });
}

// ------------------------------------------------------------------ tindakan: potret dan perbandingan

/** Paling banyak tiga lokasi dibandingkan sekaligus: lebih dari itu tabelnya tidak terbaca di ponsel. */
export const MAKS_BANDING = 3;

/** Potret rekomendasi yang ikut dikirim saat minat dinyatakan: apa yang dilihat pengguna saat itu. */
export function potretLokasi(x: LokasiDinilai, versiModel: string, preferensiRingkas: string[]): Potret {
  return {
    skor: x.lokasi.skor,
    preferensi: x.sesuai.skor ?? undefined,
    versi_model: versiModel,
    versi_preferensi: VERSI_PREFERENSI,
    alasan: alasanUtama(x.lokasi, x.sesuai),
    preferensi_ringkas: preferensiRingkas.slice(0, 12),
  };
}

export type BarisBanding = {
  nama: string;
  nilai: string[];
  /** Indeks lokasi yang unggul di baris ini. Kosong bila baris ini tidak punya arah "lebih baik" atau semuanya sama. */
  unggul: number[];
};

const unggul = (angka: (number | null)[], arah: "tinggi" | "rendah"): number[] => {
  const ada = angka.filter((v): v is number => v != null);
  if (ada.length < 2 || ada.every((v) => v === ada[0])) return [];
  const terbaik = arah === "tinggi" ? Math.max(...ada) : Math.min(...ada);
  return angka.flatMap((v, i) => (v === terbaik ? [i] : []));
};

/**
 * Baris tabel perbandingan. Hanya tiga baris yang diberi tanda unggul: skor kecocokan, kesesuaian preferensi,
 * dan tarif acuan terendah. Baris lain adalah fakta, tanpa penilaian mana yang lebih baik.
 */
export function barisBanding(daftar: LokasiDinilai[], keyakinan: Record<string, { tingkat: string; terpenuhi: number; total: number } | null | undefined>): BarisBanding[] {
  const l = daftar.map((x) => x.lokasi);
  const teks = (f: (x: Lokasi) => string) => l.map(f);
  const NAMA_YAKIN: Record<string, string> = { tinggi: "Tinggi", sedang: "Sedang", rendah: "Rendah" };
  return [
    { nama: "Skor kecocokan", nilai: teks((x) => `${x.skor} dari 100`), unggul: unggul(l.map((x) => x.skor), "tinggi") },
    {
      nama: "Kesesuaian preferensi",
      nilai: daftar.map((x) => (x.sesuai.skor == null ? "Belum bisa dinilai" : `${x.sesuai.skor} dari 100`)),
      unggul: unggul(daftar.map((x) => x.sesuai.skor), "tinggi"),
    },
    {
      nama: "Keyakinan data",
      nilai: l.map((x) => {
        const k = keyakinan[x.lahan_id];
        return k ? `${NAMA_YAKIN[k.tingkat] ?? k.tingkat}, ${k.terpenuhi} dari ${k.total} butir` : k === null ? "Belum tersedia" : "Memuat…";
      }),
      unggul: [],
    },
    { nama: "Tarif acuan per tahun", nilai: teks((x) => (x.tarif_tahunan == null ? "Belum tercatat" : rpRingkas(x.tarif_tahunan))), unggul: unggul(l.map((x) => x.tarif_tahunan), "rendah") },
    { nama: "Luas", nilai: teks((x) => (x.luas_m2 == null ? "Belum tercatat" : `${angka.format(x.luas_m2)} m²`)), unggul: [] },
    { nama: "Letak", nilai: teks((x) => letakRuang(x).join(", ") || "Belum tercatat"), unggul: [] },
    { nama: "Daya listrik", nilai: teks((x) => (x.daya_w == null ? "Belum tercatat" : `${angka.format(x.daya_w)} W`)), unggul: [] },
    { nama: "Kota", nilai: teks((x) => x.kota ?? x.provinsi), unggul: [] },
    { nama: "Tipe lokasi", nilai: teks((x) => namaTipe(x.tipe_lokasi)), unggul: [] },
    { nama: "Penduduk dalam 3 km", nilai: teks((x) => (x.penduduk_3km == null ? "Belum terhitung" : angka.format(Math.round(x.penduduk_3km / 1000) * 1000))), unggul: [] },
    { nama: "Usaha sejenis dalam 500 m", nilai: teks((x) => (x.sejenis_500m == null ? "Belum ada data" : angka.format(x.sejenis_500m))), unggul: [] },
    { nama: "Jenis usaha ini di SPBU", nilai: teks((x) => (x.segmen_sudah_ada ? "Sudah ada" : "Belum ada")), unggul: [] },
    { nama: "Verifikasi di lokasi", nilai: teks((x) => (x.terverifikasi ? "Sudah" : "Belum")), unggul: [] },
  ];
}
