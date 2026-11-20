// Uji penyajian analitik Temukan peluang dan penyempurnaan percabangan fase D. Jalankan: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { corong, namaNilai, persen, pilihanTeratas, teksLama, teksPersen } from "../src/lib/temukan/analitik.ts";
import { intiDiperkirakan, kolomAktif, langkahAktif } from "../src/lib/temukan/cabang.ts";
import { kuesioner } from "../src/lib/temukan/kuesioner.ts";
import { bersihkan, periksa } from "../src/lib/temukan/periksa.ts";

const T = kuesioner("tenant");
const D = kuesioner("dealer");
const id = (daftar) => daftar.map((p) => p.id);
const kosong = { mulai: 0, selesai: 0, detik_median: null, pertanyaan: [], berhenti: [], pilihan: [], rekomendasi: { dibuat: 0, kosong: 0, sesi_melihat: 0, sesi_klik: 0, sesi_minat: 0, sesi_ubah: 0 }, umpan: { sesuai: 0, kurang: 0, skor_sesuai: null, skor_kurang: null, alasan: [] } };

test("persen dan lama: pembagi nol tidak menjadi angka", () => {
  assert.equal(persen(1, 0), null);
  assert.equal(persen(1, 3), 33.3);
  assert.equal(persen(40, 40), 100);
  assert.equal(teksPersen(null), "–");
  assert.equal(teksPersen(33.3), "33,3%");
  assert.equal(teksLama(null), "–");
  assert.equal(teksLama(45), "45 detik");
  assert.equal(teksLama(200), "3 menit 20 detik");
  assert.equal(teksLama(180), "3 menit");
});

test("corong: mengikuti urutan kuesioner, pertanyaan versi lama tetap terlihat", () => {
  const a = {
    ...kosong,
    mulai: 40,
    selesai: 10,
    pertanyaan: [{ langkah: "wilayah", dijawab: 30, dilewati: 0 }, { langkah: "usaha", dijawab: 40, dilewati: 0 }, { langkah: "pelanggan", dijawab: 5, dilewati: 8 }, { langkah: "sudah_dihapus", dijawab: 2, dilewati: 0 }],
    berhenti: [{ langkah: "usaha", sesi: 10 }, { langkah: "wilayah", sesi: 20 }],
  };
  const c = corong(T, a);
  assert.deepEqual(c.slice(0, 2).map((x) => [x.id, x.dijawab, x.berhenti, x.pct]), [["usaha", 40, 10, 100], ["rinci_otomotif", 0, 0, 0]]);
  const w = c.find((x) => x.id === "wilayah");
  assert.deepEqual([w.nama, w.inti, w.dijawab, w.berhenti, w.pct], ["Wilayah", true, 30, 20, 75]);
  assert.deepEqual([c.find((x) => x.id === "pelanggan").dilewati, c.find((x) => x.id === "pelanggan").inti], [8, false]);
  assert.equal(c.at(-1).nama, "sudah_dihapus (versi lama)");
  assert.equal(c.length, T.pertanyaan.length + 1);
  assert.ok(corong(T, kosong).every((x) => x.pct === null && x.dijawab === 0), "tanpa sesi, tidak ada persentase");
});

test("pilihan teratas: memakai nama yang dilihat pengguna, persen terhadap yang menjawab", () => {
  const a = {
    ...kosong,
    mulai: 20,
    pertanyaan: [{ langkah: "usaha", dijawab: 20, dilewati: 0 }, { langkah: "anggaran", dijawab: 10, dilewati: 0 }, { langkah: "wilayah", dijawab: 10, dilewati: 0 }],
    pilihan: [
      { langkah: "usaha", nilai: "fnb", sesi: 12 }, { langkah: "usaha", nilai: "ev", sesi: 5 }, { langkah: "usaha", nilai: "kartu_lama", sesi: 1 },
      { langkah: "anggaran", nilai: "r25", sesi: 6 }, { langkah: "anggaran", nilai: "belum", sesi: 4 },
      { langkah: "wilayah", nilai: "Banten", sesi: 7 }, { langkah: "wilayah", nilai: "terbuka", sesi: 3 },
    ],
  };
  const p = pilihanTeratas(T, a, 2);
  assert.deepEqual(p.map((x) => x.id), ["usaha", "wilayah", "anggaran"], "urut kuesioner");
  assert.deepEqual(p[0].butir, [{ nama: "F&B / kuliner", sesi: 12, pct: 60 }, { nama: "EV charging / energi baru", sesi: 5, pct: 25 }]);
  assert.deepEqual(p[1].butir.map((x) => x.nama), ["Banten", "Terbuka di berbagai wilayah"]);
  assert.deepEqual(p[2].butir.map((x) => x.nama), ["Rp 10 juta – Rp 25 juta", "Belum menentukan"]);
  assert.equal(namaNilai(T, "usaha", "kartu_lama"), "kartu_lama", "nilai yang tidak dikenal tampil apa adanya");
});

test("jumlah langkah inti tidak bertambah di tengah jalan", () => {
  // Pengelola SPBU: sebelum SPBU dipilih, pertanyaan ruang ikut dihitung karena masih mungkin tampil.
  assert.deepEqual(id(intiDiperkirakan(D, {})), ["spbu", "ruang", "tujuan", "usaha", "prioritas"]);
  assert.equal(langkahAktif(D, {}).filter((p) => p.inti).length, 4, "yang benar-benar tampil saat itu baru empat");
  const terdaftar = { spbu: { terdaftar: true, id: "1", nomor: "3415138", alamat: null, kota: null, provinsi: "Banten" } };
  assert.equal(intiDiperkirakan(D, terdaftar).length, 5);
  const belum = { spbu: { terdaftar: false, nomor: "", kota: "Kota Semarang", catatan: "" } };
  assert.deepEqual(id(intiDiperkirakan(D, belum)), ["spbu", "tujuan", "usaha", "prioritas"], "setelah cabangnya tertutup, jumlahnya berkurang, tidak pernah bertambah");
  assert.equal(intiDiperkirakan(T, {}).length, 5);
  assert.equal(intiDiperkirakan(T, { usaha: ["otomotif"] }).length, 5, "pertanyaan lanjutan bukan pertanyaan inti");
});

test("penyempurnaan percabangan: parkir langsung untuk F&B, daya tersedia mengikuti listrik", () => {
  const ruang = T.pertanyaan.find((p) => p.id === "ruang");
  const fnb = kolomAktif(ruang, { usaha: ["fnb"] });
  assert.ok(fnb.some((c) => c.id === "parkir_fnb" && !c.lanjutan) && !fnb.some((c) => c.id === "parkir"), "F&B: parkir tampil langsung");
  const ritel = kolomAktif(ruang, { usaha: ["ritel"] });
  assert.ok(ritel.some((c) => c.id === "parkir" && c.lanjutan) && !ritel.some((c) => c.id === "parkir_fnb"), "lainnya: parkir tetap di detail tambahan");
  assert.deepEqual(periksa(ruang, { parkir_fnb: "perlu", parkir: "perlu" }, { usaha: ["fnb"] }).nilai, { parkir_fnb: "perlu" });

  const kesiapan = D.pertanyaan.find((p) => p.id === "kesiapan");
  assert.ok(!id(kolomAktif(kesiapan, {}, {})).includes("daya_tersedia"));
  assert.ok(id(kolomAktif(kesiapan, {}, { listrik: "perlu_tambah" })).includes("daya_tersedia"));
  assert.ok(!id(kolomAktif(kesiapan, {}, { listrik: "tidak_ada" })).includes("daya_tersedia"));
  assert.deepEqual(periksa(kesiapan, { listrik: "tidak_ada", daya_tersedia: 5000 }, {}).nilai, { listrik: "tidak_ada" }, "daya tidak disimpan bila listrik tidak ada");
  assert.deepEqual(periksa(kesiapan, { listrik: "tersedia", daya_tersedia: "7700" }, {}).nilai, { listrik: "tersedia", daya_tersedia: 7700 });
  // jawaban versi sebelumnya tetap terbaca: kolom parkir lama untuk F&B dibuang tanpa merusak sisanya
  assert.deepEqual(bersihkan(T, { usaha: ["fnb"], ruang: { luas_min: 12, parkir: "perlu" } }).jawaban, { usaha: ["fnb"], ruang: { luas_min: 12 } });
  assert.match(T.versi, /^[0-9a-z.-]{1,24}$/);
  assert.notEqual(T.versi, "2026.11");
});
