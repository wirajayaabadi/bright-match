// Uji lapis preferensi Temukan peluang: profil mesin, rumus kesesuaian, alasan, urutan, dan saringan. Jalankan: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { kuesioner } from "../src/lib/temukan/kuesioner.ts";
import { bersihkan } from "../src/lib/temukan/periksa.ts";
import { alasanUtama, barisBanding, catatanLokasi, kesesuaian, konteksDaftar, pelonggaran, potretLokasi, profilLokasi, saring, syaratBelumPasti, urutkan } from "../src/lib/temukan/rekomendasi.ts";
import { alasanKategori, kesesuaianKategori, keteranganCalon, permintaanSpbu, segmenDiinginkan, urutkanKategori } from "../src/lib/temukan/rekomendasi-spbu.ts";

const T = kuesioner("tenant");
const D = kuesioner("dealer");
const jawab = (k, j) => bersihkan(k, j).jawaban;

const lokasi = (ubah = {}) => ({
  lahan_id: "L1", kode: "3415138-IN-001", spbu_nomor: "3415138", alamat: "Jl. Uji", kota: "Kodya Tangerang", provinsi: "Banten", lat: -6.2, lng: 106.6, fasilitas: ["Toilet"],
  luas_m2: 12, daya_w: 2200, tarif_tahunan: 18_000_000, posisi: "Diluar Bangunan", lantai: "Lantai 1", segmen: "F&B / Kuliner",
  tingkat: "kota", n_segmen: 12, n_pembanding: 40, segmen_sudah_ada: false, luas_ok: true, daya_ok: true, tarif_ok: true,
  tipe_lokasi: "perkantoran", lift_tipe: 1.4, pct_di_tipe: 40, pct_semua: 28.6, penduduk_3km: 251_400, poi_1km: 320, sejenis_500m: 2,
  poin_jaringan: 14, poin_pelengkap: 15, poin_harga: 10, poin_kesiapan: 8, poin_tipe: 25, poin_permintaan: 16, skor: 88,
  terverifikasi: false, kesiapan: "belum_diketahui", di_wilayah: true, ...ubah,
});

const dasar = {
  usaha: ["fnb"],
  wilayah: { terbuka: false, lain: false, daftar: [{ provinsi: "Banten", kota: "Kodya Tangerang" }] },
  anggaran: { pilihan: "sendiri", maks: 36_000_000, fleksibel: false },
  ruang: { luas_min: 8, daya_min: 1300, posisi: "luar", luas_maks: 20 },
  prioritas: ["biaya", "pelanggan", "akses"],
};

test("profil mesin: hanya syarat wajib, preferensi tidak ikut menyaring", () => {
  const p = profilLokasi(jawab(T, { ...dasar, pelanggan: ["kantor"], waktu: ["segera"] }));
  assert.deepEqual(p, {
    segmen: ["F&B / Kuliner"], wilayah: [{ provinsi: "Banten", kota: "Kodya Tangerang" }], lain: false,
    luas_min: "8", daya_min: "1300", anggaran: "36000000", anggaran_fleksibel: false, posisi: "luar",
  });
  assert.equal("luas_maks" in p, false, "luas maksimum adalah preferensi");
  assert.equal(profilLokasi({}), null, "tanpa jenis usaha tidak ada profil");
  const terbuka = profilLokasi(jawab(T, { usaha: ["otomotif"], wilayah: { terbuka: true }, anggaran: { pilihan: "belum" }, ruang: {} }));
  assert.deepEqual(terbuka, { segmen: ["Pelumas & Oli", "Nitrogen & Perawatan"], wilayah: [], lain: false, luas_min: undefined, daya_min: undefined, anggaran: undefined, anggaran_fleksibel: false, posisi: "bebas" });
  assert.equal(profilLokasi(jawab(T, { usaha: ["fnb"], anggaran: { pilihan: "r50plus", fleksibel: true } })).anggaran, undefined, "rentang tanpa batas atas tidak menjadi batas");
  assert.equal(profilLokasi(jawab(T, { ...dasar, anggaran: { pilihan: "r25", fleksibel: true } })).anggaran_fleksibel, true);
});

test("pelonggaran: satu syarat dilepas per butir, profil asli tidak berubah", () => {
  const p = profilLokasi(jawab(T, dasar));
  const salinan = JSON.stringify(p);
  const l = pelonggaran(p);
  assert.deepEqual(l.map((x) => x.kunci), ["anggaran", "luas", "daya", "posisi", "wilayah"]);
  assert.equal(l[0].profil.anggaran, undefined);
  assert.equal(l[0].profil.luas_min, "8", "syarat lain tetap");
  assert.equal(l[3].profil.posisi, "bebas");
  assert.deepEqual(l[4].profil.wilayah, []);
  assert.equal(JSON.stringify(p), salinan);
  assert.deepEqual(pelonggaran(profilLokasi(jawab(T, { usaha: ["ritel"], wilayah: { terbuka: true } }))), [], "tanpa syarat, tidak ada yang bisa dilonggarkan");
});

test("kesesuaian: bobot 3, 2, 1 menurut urutan prioritas; faktor tanpa data tidak dihitung", () => {
  const j = jawab(T, dasar);
  const l = lokasi();
  const s = kesesuaian(l, j, konteksDaftar([l]));
  const f = Object.fromEntries(s.faktor.map((x) => [x.kunci, x]));
  assert.deepEqual(s.faktor.slice(0, 3).map((x) => [x.kunci, x.bobot]), [["biaya", 3], ["pelanggan", 2], ["akses", 1]]);
  assert.equal(f.biaya.nilai, 1, "tarif separuh anggaran: nilai penuh");
  assert.equal(f.pelanggan.nilai, 0.8);
  assert.equal(f.akses.nilai, null, "akses belum ada datanya");
  assert.equal(f.luas.nilai, 1);
  // (3*1 + 2*0,8 + 1*1) / (3 + 2 + 1) = 0,9333
  assert.equal(s.skor, 93);
  assert.match(f.pelanggan.alasan, /bukan jumlah pembeli/);
});

test("kesesuaian biaya: turun lurus sampai nol di 1,25 kali anggaran; tanpa anggaran memakai urutan tarif di daftar", () => {
  const j = jawab(T, dasar);
  const nilai = (tarif) => kesesuaian(lokasi({ tarif_tahunan: tarif }), j, konteksDaftar([])).faktor[0].nilai;
  assert.equal(nilai(18_000_000), 1);
  assert.ok(Math.abs(nilai(36_000_000) - 1 / 3) < 1e-9, "tepat di anggaran: sepertiga");
  assert.equal(nilai(45_000_000), 0);
  assert.equal(nilai(null), null);
  const tanpa = jawab(T, { ...dasar, anggaran: { pilihan: "belum" } });
  const daftar = [10, 20, 30, 40, 50].map((t, i) => lokasi({ lahan_id: `L${i}`, tarif_tahunan: t * 1_000_000 }));
  const k = konteksDaftar(daftar);
  assert.deepEqual(daftar.map((l) => kesesuaian(l, tanpa, k).faktor[0].nilai), [1, 0.75, 0.5, 0.25, 0]);
});

test("kesesuaian: pelanggan, rencana buka, luas maksimum, dan lokasi tanpa data", () => {
  const j = jawab(T, { ...dasar, prioritas: ["infrastruktur"], pelanggan: ["kantor", "motor"], waktu: ["segera"] });
  const k = konteksDaftar([]);
  const a = Object.fromEntries(kesesuaian(lokasi(), j, k).faktor.map((x) => [x.kunci, x.nilai]));
  assert.deepEqual(a, { infrastruktur: 0.48, karakter: 1, waktu: 0.3, luas: 1 });
  const b = Object.fromEntries(kesesuaian(lokasi({ terverifikasi: true, kesiapan: "siap", tipe_lokasi: "industri", luas_m2: 30 }), j, k).faktor.map((x) => [x.kunci, x.nilai]));
  assert.deepEqual(b, { infrastruktur: 0.88, karakter: 0.3, waktu: 1, luas: 0.5 });
  const hanyaPengendara = jawab(T, { ...dasar, pelanggan: ["motor", "mobil"] });
  assert.ok(!kesesuaian(lokasi(), hanyaPengendara, k).faktor.some((x) => x.kunci === "karakter"), "pengendara tidak dipetakan ke tipe lokasi");
  const gelap = kesesuaian(lokasi({ tarif_tahunan: null, penduduk_3km: null, poi_1km: null }), jawab(T, { ...dasar, ruang: {}, prioritas: ["biaya", "pelanggan", "jaringan"] }), k);
  assert.equal(gelap.skor, null, "tidak satu pun faktor bisa dinilai: tanpa angka, bukan nol");
  assert.equal(gelap.faktor.length, 3);
});

test("alasan dan catatan: tiga alasan terkuat, tarif di atas anggaran dan data kosong disebut", () => {
  const j = jawab(T, { ...dasar, anggaran: { pilihan: "sendiri", maks: 36_000_000, fleksibel: true } });
  const l = lokasi();
  const s = kesesuaian(l, j, konteksDaftar([l]));
  const a = alasanUtama(l, s);
  assert.equal(a.length, 3);
  assert.ok(a.some((x) => /Tarif acuan Rp 18 juta per tahun, 50% dari anggaran/.test(x)), a.join(" | "));
  assert.ok(a.every((x) => !/peluang|pasti|dijamin/i.test(x)), "alasan tidak menjanjikan hasil");
  assert.deepEqual(catatanLokasi(l, j), []);
  const c = catatanLokasi(lokasi({ tarif_tahunan: 40_000_000, daya_w: null, di_wilayah: false }), j);
  assert.equal(c.length, 3);
  assert.match(c[0], /Belum tercatat: daya listrik/);
  assert.match(c[1], /di atas anggaran Anda \(Rp 36 juta per tahun\)/);
  assert.match(c[2], /Di luar wilayah/);
  // data kosong hanya menjadi tanda bila pengguna memang meminta syaratnya
  assert.deepEqual(syaratBelumPasti(lokasi({ luas_m2: null, daya_w: null, tarif_tahunan: null }), j), ["luas", "daya listrik", "tarif acuan"]);
  const tanpaSyarat = jawab(T, { usaha: ["fnb"], wilayah: { terbuka: true }, anggaran: { pilihan: "belum" }, ruang: {}, prioritas: ["biaya"] });
  assert.deepEqual(syaratBelumPasti(lokasi({ luas_m2: null, daya_w: null, tarif_tahunan: null }), tanpaSyarat), []);
  assert.deepEqual(catatanLokasi(lokasi({ luas_m2: null, daya_w: null, tarif_tahunan: null }), tanpaSyarat), []);
});

test("urutan dan saringan", () => {
  const j = jawab(T, dasar);
  const daftar = [
    lokasi({ lahan_id: "A", kode: "A", skor: 90, tarif_tahunan: 40_000_000, luas_m2: 30 }),
    lokasi({ lahan_id: "B", kode: "B", skor: 70, tarif_tahunan: 9_000_000, luas_m2: 10, terverifikasi: true, kota: "Kabupaten Tangerang" }),
    lokasi({ lahan_id: "C", kode: "C", skor: 80, tarif_tahunan: null, luas_m2: null, spbu_nomor: "3112402" }),
  ];
  const k = konteksDaftar(daftar);
  const dinilai = daftar.map((l) => ({ lokasi: l, sesuai: kesesuaian(l, j, k) }));
  const kode = (cara) => urutkan(dinilai, cara).map((x) => x.lokasi.kode).join("");
  assert.equal(kode("skor"), "ACB");
  assert.equal(kode("tarif"), "BAC", "tarif kosong di akhir");
  assert.equal(kode("luas"), "ABC", "luas kosong di akhir");
  assert.equal(kode("preferensi"), "BCA");
  assert.equal(kode("sesuai"), "BCA", "rata-rata skor dan preferensi");
  assert.equal(urutkan(dinilai, "sesuai").length, 3);
  assert.deepEqual(saring(dinilai, { cari: "3112", kota: "", terverifikasi: false }).map((x) => x.lokasi.kode), ["C"]);
  assert.deepEqual(saring(dinilai, { cari: "", kota: "Banten|Kabupaten Tangerang", terverifikasi: false }).map((x) => x.lokasi.kode), ["B"]);
  assert.deepEqual(saring(dinilai, { cari: "", kota: "", terverifikasi: true }).map((x) => x.lokasi.kode), ["B"]);
  assert.equal(saring(dinilai, { cari: "tidak ada", kota: "", terverifikasi: false }).length, 0);
});

const kategori = (ubah = {}) => ({
  segmen: "F&B / Kuliner", skor: 80, jumlah_calon: 7, tingkat: "kota", n_segmen: 12, n_pembanding: 40, segmen_sudah_ada: false,
  tipe_lokasi: "pusat_kota", lift_tipe: 1.3, pct_di_tipe: 40, pct_semua: 30, penduduk_3km: 400_000, poi_1km: 700, sejenis_500m: 4,
  poin_tipe: 20, poin_permintaan: 18, poin_pelengkap: 15, calon: null, ...ubah,
});
const spbu = { terdaftar: true, id: "S1", nomor: "3412504", alamat: null, kota: "Kodya Jakarta Selatan", provinsi: "DKI Jakarta" };

test("pengelola SPBU: permintaan, jenis usaha yang diinginkan, dan kesesuaian", () => {
  assert.equal(permintaanSpbu({ spbu: { terdaftar: false, nomor: "", kota: "Kota Semarang", catatan: "" } }), null, "SPBU belum terdaftar: tidak ada rekomendasi");
  assert.deepEqual(permintaanSpbu({ spbu, ruang: { semua: true, lahan: [], usul: "" } }), { spbuId: "S1", lahanIds: null });
  assert.deepEqual(permintaanSpbu({ spbu, ruang: { semua: false, lahan: [{ lahan_id: "L1", kode: "A" }], usul: "" } }), { spbuId: "S1", lahanIds: ["L1"] });
  assert.equal(segmenDiinginkan({ usaha: ["terbuka"] }), null);
  assert.deepEqual(segmenDiinginkan({ usaha: ["fnb", "otomotif"] }), ["F&B / Kuliner", "Pelumas & Oli", "Nitrogen & Perawatan"]);

  const j = jawab(D, { spbu, ruang: { semua: true }, tujuan: ["pelengkap", "kosong", "sewa"], usaha: ["fnb"], prioritas: ["rekam_jejak"] });
  const s = kesesuaianKategori(kategori(), j);
  assert.deepEqual(s.faktor.map((f) => [f.kunci, f.bobot, f.nilai]), [["usaha", 2, 1], ["pelengkap", 1, 1], ["kosong", 1, 1], ["sewa", 1, null]]);
  assert.equal(s.skor, 100);
  const lain = kesesuaianKategori(kategori({ segmen: "Perbankan & ATM", segmen_sudah_ada: true, jumlah_calon: 2 }), j);
  // (2*0 + 1*0,2 + 1*0,4) / 4 = 0,15
  assert.equal(lain.skor, 15);
  assert.equal(kesesuaianKategori(kategori(), jawab(D, { spbu, ruang: { semua: true }, tujuan: ["sewa"], usaha: ["terbuka"], prioritas: ["ekonomi"] })).skor, null, "tanpa faktor yang bisa dinilai: tanpa angka");
});

test("pengelola SPBU: urutan jenis usaha, alasan, dan calon tanpa nama", () => {
  const j = jawab(D, { spbu, ruang: { semua: true }, tujuan: ["ev"], usaha: ["terbuka"], prioritas: ["rekam_jejak"] });
  const urut = urutkanKategori([kategori({ segmen: "Lainnya", skor: 95 }), kategori({ skor: 85 }), kategori({ segmen: "Energi Baru (EV/PLTS)", skor: 70 })], j);
  assert.deepEqual(urut.map((x) => x.kategori.segmen), ["Energi Baru (EV/PLTS)", "F&B / Kuliner"], "Lainnya tidak disarankan; tujuan EV menaikkan EV");
  const a = alasanKategori(kategori(), "Kodya Jakarta Selatan", "DKI Jakarta");
  assert.equal(a.length, 4);
  assert.match(a[1], /12 dari 40 ruang sejenis di Kodya Jakarta Selatan/);
  const c = keteranganCalon({ skor: 80, skala: "menengah", di_kota: false, di_provinsi: true, luas_ok: true, daya_ok: null, tarif_ok: true, poin_jaringan: 10, poin_harga: 5 }, "Kodya Jakarta Selatan", "DKI Jakarta");
  assert.deepEqual(c, ["Jaringan menengah: 10 sampai 49 SPBU", "Belum ada di Kodya Jakarta Selatan, sudah ada di DKI Jakarta", "Perlu dicek: daya"]);
});

test("perbandingan dan potret: tanda unggul hanya untuk skor, preferensi, dan tarif terendah", () => {
  const j = jawab(T, dasar);
  const daftar = [
    lokasi({ lahan_id: "A", kode: "A", skor: 90, tarif_tahunan: 40_000_000 }),
    lokasi({ lahan_id: "B", kode: "B", skor: 70, tarif_tahunan: 9_000_000, terverifikasi: true }),
    lokasi({ lahan_id: "C", kode: "C", skor: 90, tarif_tahunan: null, luas_m2: null }),
  ];
  const k = konteksDaftar(daftar);
  const dinilai = daftar.map((l) => ({ lokasi: l, sesuai: kesesuaian(l, j, k) }));
  const b = Object.fromEntries(barisBanding(dinilai, { A: { tingkat: "sedang", terpenuhi: 5, total: 7 }, B: null }).map((x) => [x.nama, x]));
  assert.deepEqual(b["Skor kecocokan"].unggul, [0, 2], "dua lokasi dengan skor tertinggi sama-sama ditandai");
  assert.deepEqual(b["Tarif acuan per tahun"].unggul, [1], "tarif terendah, yang kosong tidak ikut");
  assert.deepEqual(b["Tarif acuan per tahun"].nilai, ["Rp 40 juta", "Rp 9 juta", "Belum tercatat"]);
  assert.deepEqual(b["Keyakinan data"].nilai, ["Sedang, 5 dari 7 butir", "Belum tersedia", "Memuat…"]);
  assert.deepEqual(b["Luas"].unggul, [], "luas adalah fakta, bukan penilaian");
  assert.deepEqual(b["Verifikasi di lokasi"].nilai, ["Belum", "Sudah", "Belum"]);
  assert.deepEqual(barisBanding(dinilai.slice(0, 1), {})[0].unggul, [], "satu lokasi tidak punya pembanding");
  const p = potretLokasi(dinilai[1], "2", ["Jenis usaha: F&B / kuliner"]);
  assert.equal(p.skor, 70);
  assert.equal(p.versi_model, "2");
  assert.equal(p.versi_preferensi, "p1");
  assert.equal(p.alasan.length, 3);
  assert.deepEqual(p.preferensi_ringkas, ["Jenis usaha: F&B / kuliner"]);
});
