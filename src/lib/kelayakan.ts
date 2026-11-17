/**
 * Mesin hitung studio kelayakan. Murni rumus: tidak ada angka bawaan tentang usaha apa pun.
 * Semua masukan berasal dari dua tempat, dan selalu diberi label di antarmuka:
 *   - syarat sewa dari versi penawaran yang berlaku (data yang diimpor), dan
 *   - asumsi yang diisi pengguna sendiri.
 * Keluarannya adalah hitungan model, bukan perkiraan Pertamina dan bukan jaminan hasil.
 *
 * Berkas ini sengaja tanpa impor apa pun, agar bisa diuji langsung dengan `node --test`.
 */

export type ModelUsaha = "ritel" | "ev" | "atm" | "umum";

/** Asumsi pengguna. Semua angka per bulan kecuali disebut lain. Kosong = belum diisi. */
export type Asumsi = {
  model: ModelUsaha;
  // ritel dan F&B
  kunjungan_per_hari?: number; // orang yang datang ke SPBU atau melewati gerai per hari
  konversi_pct?: number; // persen pengunjung yang membeli
  nilai_transaksi?: number; // rupiah per transaksi
  hari_buka?: number; // hari buka per bulan
  // pengisian daya kendaraan listrik
  jumlah_charger?: number;
  daya_kw?: number; // kW per charger
  jam_pakai_per_hari?: number; // jam terpakai per charger per hari
  harga_per_kwh?: number; // harga jual
  biaya_listrik_per_kwh?: number; // harga beli
  // ATM dan layanan perbankan
  transaksi_per_hari?: number;
  pendapatan_per_transaksi?: number;
  // umum
  pendapatan_bulanan?: number;
  // berlaku untuk semua model
  margin_kotor_pct?: number; // persen pendapatan yang tersisa setelah harga pokok; tidak dipakai model ev
  gaji?: number;
  utilitas?: number;
  biaya_lain?: number;
  investasi_awal?: number;
  diskonto_pct?: number; // per tahun, untuk NPV; kosong = NPV tidak dihitung
  deposit_kembali?: boolean; // deposit dikembalikan di akhir masa sewa
};

/** Syarat sewa dari versi penawaran. */
export type Sewa = {
  sewa_tahunan: number;
  lama_sewa_bulan: number;
  bebas_sewa_bulan: number;
  deposit: number;
  bagi_hasil_pct: number; // persen omzet; 0 bila sewa tetap
};

export type Hasil = {
  /** false bila ada masukan wajib yang belum diisi; `kurang` menyebut yang mana. */
  lengkap: boolean;
  kurang: string[];
  pendapatan: number;
  harga_pokok: number;
  laba_kotor: number;
  sewa_bulanan: number;
  bagi_hasil: number;
  biaya_operasi: number; // sewa + bagi hasil + gaji + utilitas + lain
  laba_operasi: number; // per bulan, saat sewa sudah dibayar penuh
  investasi_awal: number; // termasuk deposit
  /** Pendapatan per bulan agar laba operasi nol. null bila margin setelah bagi hasil tidak positif. */
  titik_impas: number | null;
  /** Bulan ke berapa arus kas kumulatif kembali nol atau lebih. null bila tidak tercapai dalam masa sewa. */
  balik_modal_bulan: number | null;
  /** Arus kas kumulatif di akhir masa sewa, termasuk investasi awal. */
  kumulatif_akhir: number;
  npv: number | null;
  /** IRR per tahun dalam persen. null bila arus kas tidak berganti tanda atau tidak ada akar di rentang wajar. */
  irr_pct: number | null;
  /** Arus kas: indeks 0 = investasi awal, lalu satu angka per bulan. */
  arus_kas: number[];
};

const ada = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const HARI_PER_BULAN = 30;

/** Masukan wajib tiap model, dengan nama yang dipakai di pesan "lengkapi dulu". */
export const WAJIB: Record<ModelUsaha, [keyof Asumsi, string][]> = {
  ritel: [
    ["kunjungan_per_hari", "kunjungan per hari"],
    ["konversi_pct", "persen yang membeli"],
    ["nilai_transaksi", "nilai transaksi rata-rata"],
    ["hari_buka", "hari buka per bulan"],
    ["margin_kotor_pct", "margin kotor"],
  ],
  ev: [
    ["jumlah_charger", "jumlah charger"],
    ["daya_kw", "daya per charger"],
    ["jam_pakai_per_hari", "jam terpakai per hari"],
    ["harga_per_kwh", "harga jual per kWh"],
    ["biaya_listrik_per_kwh", "biaya listrik per kWh"],
  ],
  atm: [
    ["transaksi_per_hari", "transaksi per hari"],
    ["pendapatan_per_transaksi", "pendapatan per transaksi"],
  ],
  umum: [
    ["pendapatan_bulanan", "pendapatan per bulan"],
    ["margin_kotor_pct", "margin kotor"],
  ],
};

/** Pendapatan dan harga pokok per bulan menurut model. `kali` menggeser sisi permintaan untuk skenario. */
export function pendapatanDanPokok(a: Asumsi, kali = 1): { pendapatan: number; harga_pokok: number } {
  const margin = (a.margin_kotor_pct ?? 100) / 100;
  if (a.model === "ritel") {
    const pendapatan = (a.kunjungan_per_hari ?? 0) * kali * ((a.konversi_pct ?? 0) / 100) * (a.nilai_transaksi ?? 0) * (a.hari_buka ?? 0);
    return { pendapatan, harga_pokok: pendapatan * (1 - margin) };
  }
  if (a.model === "ev") {
    const kwh = (a.jumlah_charger ?? 0) * (a.daya_kw ?? 0) * (a.jam_pakai_per_hari ?? 0) * kali * HARI_PER_BULAN;
    return { pendapatan: kwh * (a.harga_per_kwh ?? 0), harga_pokok: kwh * (a.biaya_listrik_per_kwh ?? 0) };
  }
  if (a.model === "atm") {
    const pendapatan = (a.transaksi_per_hari ?? 0) * kali * (a.pendapatan_per_transaksi ?? 0) * HARI_PER_BULAN;
    return { pendapatan, harga_pokok: pendapatan * (1 - margin) };
  }
  const pendapatan = (a.pendapatan_bulanan ?? 0) * kali;
  return { pendapatan, harga_pokok: pendapatan * (1 - margin) };
}

/** Nilai kini bersih. `diskontoTahunanPct` dikonversi ke suku bunga bulanan yang setara. */
export function npv(arusKas: number[], diskontoTahunanPct: number): number {
  const r = Math.pow(1 + diskontoTahunanPct / 100, 1 / 12) - 1;
  return arusKas.reduce((total, kas, t) => total + kas / Math.pow(1 + r, t), 0);
}

/**
 * IRR bulanan lewat bagi dua, dikembalikan sebagai persen per tahun.
 * Hanya dihitung bila arus kas berganti tanda tepat sekali (investasi lalu penerimaan, atau sebaliknya):
 * dengan lebih dari satu pergantian tanda, IRR bisa lebih dari satu dan menyesatkan.
 */
export function irrTahunanPct(arusKas: number[]): number | null {
  const tanda = arusKas.filter((k) => k !== 0).map((k) => Math.sign(k));
  const ganti = tanda.slice(1).filter((s, i) => s !== tanda[i]).length;
  if (ganti !== 1) return null;
  const f = (r: number) => arusKas.reduce((total, kas, t) => total + kas / Math.pow(1 + r, t), 0);
  let bawah = -0.99;
  let atas = 10; // 1.000% per bulan: di atas ini bukan angka yang berguna
  let fBawah = f(bawah);
  const fAtas = f(atas);
  if (!Number.isFinite(fBawah) || !Number.isFinite(fAtas) || fBawah * fAtas > 0) return null;
  for (let i = 0; i < 200; i++) {
    const tengah = (bawah + atas) / 2;
    const fTengah = f(tengah);
    if (Math.abs(fTengah) < 1e-7) {
      bawah = atas = tengah;
      break;
    }
    if (fBawah * fTengah < 0) atas = tengah;
    else {
      bawah = tengah;
      fBawah = fTengah;
    }
  }
  const bulanan = (bawah + atas) / 2;
  return (Math.pow(1 + bulanan, 12) - 1) * 100;
}

/**
 * Menghitung satu skenario. `kali` menggeser sisi permintaan (kunjungan, jam pakai, transaksi, atau pendapatan):
 * 1 = skenario dasar, 0,8 = turun 20%, dan seterusnya.
 */
export function hitung(a: Asumsi, s: Sewa, kali = 1): Hasil {
  const kurang = WAJIB[a.model].filter(([k]) => !ada(a[k] as number | undefined)).map(([, nama]) => nama);
  const { pendapatan, harga_pokok } = pendapatanDanPokok(a, kali);
  const laba_kotor = pendapatan - harga_pokok;
  const sewa_bulanan = s.sewa_tahunan / 12;
  const bagi_hasil = pendapatan * (s.bagi_hasil_pct / 100);
  const tetap = (a.gaji ?? 0) + (a.utilitas ?? 0) + (a.biaya_lain ?? 0);
  const biaya_operasi = sewa_bulanan + bagi_hasil + tetap;
  const laba_operasi = laba_kotor - biaya_operasi;
  const investasi_awal = (a.investasi_awal ?? 0) + s.deposit;

  // Titik impas: pendapatan P agar P x (margin kotor - bagi hasil) = sewa + biaya tetap.
  const marginBersih = pendapatan > 0 ? (laba_kotor - bagi_hasil) / pendapatan : null;
  const titik_impas = marginBersih != null && marginBersih > 0 ? (sewa_bulanan + tetap) / marginBersih : null;

  const bulan = Math.max(0, Math.round(s.lama_sewa_bulan));
  const arus_kas = [-investasi_awal];
  for (let t = 1; t <= bulan; t++) {
    const sewaBulanIni = t <= s.bebas_sewa_bulan ? 0 : sewa_bulanan;
    let kas = laba_kotor - bagi_hasil - tetap - sewaBulanIni;
    if (t === bulan && a.deposit_kembali) kas += s.deposit;
    arus_kas.push(kas);
  }

  // Balik modal: bulan saat arus kas kumulatif pertama kali kembali nol atau lebih, dengan pecahan bulan.
  let kumulatif = arus_kas[0];
  let balik_modal_bulan: number | null = kumulatif >= 0 ? 0 : null;
  for (let t = 1; t < arus_kas.length && balik_modal_bulan == null; t++) {
    const sebelum = kumulatif;
    kumulatif += arus_kas[t];
    if (kumulatif >= 0 && arus_kas[t] > 0) balik_modal_bulan = t - 1 + -sebelum / arus_kas[t];
  }
  const kumulatif_akhir = arus_kas.reduce((x, y) => x + y, 0);

  return {
    lengkap: kurang.length === 0,
    kurang,
    pendapatan,
    harga_pokok,
    laba_kotor,
    sewa_bulanan,
    bagi_hasil,
    biaya_operasi,
    laba_operasi,
    investasi_awal,
    titik_impas,
    balik_modal_bulan,
    kumulatif_akhir,
    npv: ada(a.diskonto_pct) ? npv(arus_kas, a.diskonto_pct) : null,
    irr_pct: irrTahunanPct(arus_kas),
    arus_kas,
  };
}

/** Tiga skenario dari satu set asumsi: sisi permintaan digeser turun, tetap, dan naik. */
export function tigaSkenario(a: Asumsi, s: Sewa, turunPct: number, naikPct: number) {
  return {
    konservatif: hitung(a, s, 1 - Math.min(Math.max(turunPct, 0), 100) / 100),
    dasar: hitung(a, s, 1),
    optimistis: hitung(a, s, 1 + Math.max(naikPct, 0) / 100),
  };
}

/** Model yang paling mendekati jenis usaha di data Bright Match; pengguna tetap bisa menggantinya. */
export function modelDariSegmen(segmen: string | null | undefined): ModelUsaha {
  const s = (segmen ?? "").toLowerCase();
  if (s.includes("ev") || s.includes("energi")) return "ev";
  if (s.includes("bank") || s.includes("atm")) return "atm";
  if (s.includes("f&b") || s.includes("kuliner") || s.includes("minimarket") || s.includes("ritel")) return "ritel";
  return "umum";
}
