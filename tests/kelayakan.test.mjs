// Uji rumus studio kelayakan. Jalankan: npm test
// Nilai pembanding dihitung terpisah (Python) dari rumus yang sama, bukan dari keluaran kode ini.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hitung, irrTahunanPct, modelDariSegmen, npv, pendapatanDanPokok, tigaSkenario } from "../src/lib/kelayakan.ts";

const dekat = (nyata, harap, toleransi = 1e-6) =>
  assert.ok(Math.abs(nyata - harap) <= toleransi * Math.max(1, Math.abs(harap)), `${nyata} seharusnya ${harap}`);

const sewa = { sewa_tahunan: 60_000_000, lama_sewa_bulan: 24, bebas_sewa_bulan: 2, deposit: 5_000_000, bagi_hasil_pct: 0 };
const ritel = {
  model: "ritel",
  kunjungan_per_hari: 400,
  konversi_pct: 10,
  nilai_transaksi: 25_000,
  hari_buka: 30,
  margin_kotor_pct: 60,
  gaji: 6_000_000,
  utilitas: 1_500_000,
  biaya_lain: 500_000,
  investasi_awal: 80_000_000,
  diskonto_pct: 12,
  deposit_kembali: true,
};

test("ritel: pendapatan, laba, titik impas, balik modal, NPV, dan IRR", () => {
  const h = hitung(ritel, sewa);
  assert.equal(h.lengkap, true);
  dekat(h.pendapatan, 30_000_000);
  dekat(h.harga_pokok, 12_000_000);
  dekat(h.laba_kotor, 18_000_000);
  dekat(h.sewa_bulanan, 5_000_000);
  dekat(h.biaya_operasi, 13_000_000);
  dekat(h.laba_operasi, 5_000_000);
  dekat(h.investasi_awal, 85_000_000); // investasi 80 jt + deposit 5 jt
  dekat(h.titik_impas, 21_666_666.666666668);
  dekat(h.balik_modal_bulan, 15);
  dekat(h.kumulatif_akhir, 50_000_000);
  dekat(h.npv, 35_711_550.59250415);
  dekat(h.irr_pct, 66.10774776223668, 1e-5);
  assert.equal(h.arus_kas.length, 25);
});

test("masa bebas sewa: sewa tidak dibayar di bulan-bulan awal", () => {
  const h = hitung(ritel, sewa);
  dekat(h.arus_kas[1], 10_000_000); // laba kotor 18 jt - biaya tetap 8 jt, tanpa sewa
  dekat(h.arus_kas[2], 10_000_000);
  dekat(h.arus_kas[3], 5_000_000); // mulai bulan ke-3 sewa 5 jt dibayar
});

test("deposit dikembalikan di bulan terakhir hanya bila dicentang", () => {
  dekat(hitung(ritel, sewa).arus_kas[24], 10_000_000); // 5 jt laba + 5 jt deposit
  dekat(hitung({ ...ritel, deposit_kembali: false }, sewa).arus_kas[24], 5_000_000);
  dekat(hitung({ ...ritel, deposit_kembali: false }, sewa).kumulatif_akhir, 45_000_000);
});

test("bagi hasil mengurangi laba dan menaikkan titik impas", () => {
  const h = hitung(ritel, { ...sewa, bagi_hasil_pct: 5 });
  dekat(h.bagi_hasil, 1_500_000);
  dekat(h.laba_operasi, 3_500_000);
  dekat(h.titik_impas, 13_000_000 / 0.55); // (sewa + biaya tetap) / (margin 60% - bagi hasil 5%)
});

test("titik impas kosong bila margin setelah bagi hasil tidak positif", () => {
  assert.equal(hitung({ ...ritel, margin_kotor_pct: 5 }, { ...sewa, bagi_hasil_pct: 5 }).titik_impas, null);
});

test("tiga skenario menggeser sisi permintaan, bukan biaya", () => {
  const s = tigaSkenario(ritel, sewa, 20, 25);
  dekat(s.konservatif.pendapatan, 24_000_000);
  dekat(s.dasar.pendapatan, 30_000_000);
  dekat(s.optimistis.pendapatan, 37_500_000);
  dekat(s.konservatif.sewa_bulanan, s.optimistis.sewa_bulanan);
  dekat(s.konservatif.laba_operasi, 24_000_000 * 0.6 - 13_000_000);
});

test("usaha yang rugi: tidak balik modal, IRR tidak dihitung", () => {
  const h = hitung({ ...ritel, kunjungan_per_hari: 100 }, sewa);
  assert.ok(h.laba_operasi < 0);
  assert.equal(h.balik_modal_bulan, null);
  assert.ok(h.kumulatif_akhir < 0);
  // bulan bebas sewa pun rugi, jadi arus kas tidak pernah positif dan IRR tidak ada
  assert.equal(h.irr_pct, null);
});

test("model pengisian daya: energi terjual dan biaya listrik", () => {
  const { pendapatan, harga_pokok } = pendapatanDanPokok({
    model: "ev",
    jumlah_charger: 2,
    daya_kw: 50,
    jam_pakai_per_hari: 3,
    harga_per_kwh: 2_500,
    biaya_listrik_per_kwh: 1_500,
  });
  dekat(pendapatan, 2 * 50 * 3 * 30 * 2_500); // 9.000 kWh x Rp 2.500
  dekat(harga_pokok, 2 * 50 * 3 * 30 * 1_500);
});

test("model ATM dan model umum", () => {
  dekat(pendapatanDanPokok({ model: "atm", transaksi_per_hari: 200, pendapatan_per_transaksi: 1_500 }).pendapatan, 9_000_000);
  const umum = pendapatanDanPokok({ model: "umum", pendapatan_bulanan: 40_000_000, margin_kotor_pct: 35 });
  dekat(umum.pendapatan, 40_000_000);
  dekat(umum.harga_pokok, 26_000_000);
});

test("masukan wajib yang kosong disebut satu per satu", () => {
  const h = hitung({ model: "ritel", kunjungan_per_hari: 400 }, sewa);
  assert.equal(h.lengkap, false);
  assert.deepEqual(h.kurang, ["persen yang membeli", "nilai transaksi rata-rata", "hari buka per bulan", "margin kotor"]);
  assert.equal(hitung({ model: "atm", transaksi_per_hari: 10, pendapatan_per_transaksi: 1_000 }, sewa).lengkap, true);
});

test("NPV tidak dihitung tanpa tingkat diskonto", () => {
  assert.equal(hitung({ ...ritel, diskonto_pct: undefined }, sewa).npv, null);
});

test("NPV dan IRR pada arus kas sederhana", () => {
  const kas = [-1000, ...Array(12).fill(100)];
  dekat(npv(kas, 10), 140.0487829330687);
  dekat(npv(kas, 0), 200);
  dekat(irrTahunanPct(kas), 41.299898414961575, 1e-5);
});

test("IRR tidak dihitung bila arus kas tidak berganti tanda tepat sekali", () => {
  assert.equal(irrTahunanPct([100, 100, 100]), null); // tidak ada investasi
  assert.equal(irrTahunanPct([-100, -50, -10]), null); // tidak pernah menerima
  assert.equal(irrTahunanPct([-100, 300, -250]), null); // dua kali berganti tanda: IRR bisa lebih dari satu
});

test("model dipilih dari jenis usaha, dan jatuh ke umum bila tidak dikenal", () => {
  assert.equal(modelDariSegmen("Energi Baru (EV/PLTS)"), "ev");
  assert.equal(modelDariSegmen("Perbankan & ATM"), "atm");
  assert.equal(modelDariSegmen("F&B / Kuliner"), "ritel");
  assert.equal(modelDariSegmen("Minimarket & Ritel"), "ritel");
  assert.equal(modelDariSegmen("Nitrogen & Perawatan"), "umum");
  assert.equal(modelDariSegmen(null), "umum");
});
