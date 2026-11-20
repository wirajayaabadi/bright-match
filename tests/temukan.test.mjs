// Uji kuesioner Temukan peluang: percabangan, pemeriksaan jawaban, pembersihan, dan ringkasan. Jalankan: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { berlaku, intiLengkap, kolomAktif, langkahAktif, langkahBerikut } from "../src/lib/temukan/cabang.ts";
import { kuesioner } from "../src/lib/temukan/kuesioner.ts";
import { bersihkan, periksa } from "../src/lib/temukan/periksa.ts";
import { alamatSpbu, keCalon, letakRuang, ringkasan, segmenDari, teksAnggaran } from "../src/lib/temukan/ringkas.ts";
import { SEGMEN_KARTU } from "../src/lib/temukan/tenant-v1.ts";
import { JENIS_USAHA } from "../src/lib/istilah.ts";

const T = kuesioner("tenant");
const D = kuesioner("dealer");
const tanya = (k, id) => k.pertanyaan.find((p) => p.id === id);
const id = (daftar) => daftar.map((p) => p.id);

test("konfigurasi: id unik, kondisi hanya menunjuk pertanyaan sebelumnya, lima pertanyaan inti", () => {
  for (const k of [T, D]) {
    const semua = id(k.pertanyaan);
    assert.equal(new Set(semua).size, semua.length, "id pertanyaan harus unik");
    assert.match(k.versi, /^[0-9a-z.-]{1,24}$/);
    k.pertanyaan.forEach((p, i) => {
      assert.match(p.id, /^[a-z0-9_]{1,40}$/);
      const rujukan = JSON.stringify(p.tampil ?? {}).match(/"id":"([a-z0-9_]+)/g) ?? [];
      for (const r of rujukan) {
        const asal = r.replace('"id":"', "");
        assert.ok(semua.indexOf(asal) < i, `${p.id} menunjuk ${asal} yang belum ditanyakan`);
      }
      if (p.jenis === "isian") assert.equal(new Set(id(p.kolom)).size, p.kolom.length, `kolom ${p.id} harus unik`);
    });
  }
  assert.deepEqual(id(langkahAktif(T, { usaha: ["fnb"] }).filter((p) => p.inti)), ["usaha", "wilayah", "anggaran", "ruang", "prioritas"]);
  assert.deepEqual(id(D.pertanyaan.filter((p) => p.inti)), ["spbu", "ruang", "tujuan", "usaha", "prioritas"]);
});

test("konfigurasi: tiap kartu usaha dipetakan ke segmen yang dikenal mesin kecocokan", () => {
  const segmen = JENIS_USAHA.map((j) => j.nilai);
  const kartu = tanya(T, "usaha").pilihan.map((o) => o.nilai);
  assert.deepEqual(Object.keys(SEGMEN_KARTU).sort(), [...kartu].sort());
  const terpakai = Object.values(SEGMEN_KARTU).flat();
  for (const s of terpakai) assert.ok(segmen.includes(s), `${s} bukan segmen lahan`);
  assert.deepEqual([...terpakai].sort(), [...segmen].sort(), "semua segmen lahan harus terjangkau, masing-masing sekali");
});

test("percabangan: pertanyaan lanjutan mengikuti jenis usaha", () => {
  const dasar = ["usaha", "wilayah", "anggaran", "ruang", "prioritas", "pelanggan", "waktu"];
  assert.deepEqual(id(langkahAktif(T, {})), dasar);
  assert.deepEqual(id(langkahAktif(T, { usaha: ["ev"] })), [...dasar, "rinci_ev"]);
  assert.deepEqual(id(langkahAktif(T, { usaha: ["fnb"] })), [...dasar, "rinci_fnb"]);
  assert.deepEqual(id(langkahAktif(T, { usaha: ["bank"] })), [...dasar, "rinci_bank"]);
  assert.deepEqual(id(langkahAktif(T, { usaha: ["otomotif"] })), ["usaha", "rinci_otomotif", ...dasar.slice(1)]);
  assert.deepEqual(id(langkahAktif(T, { usaha: ["ritel"] })), dasar);
});

test("percabangan: kolom teknis mengikuti jenis usaha dan kolom lain", () => {
  const ruang = tanya(T, "ruang");
  assert.ok(!id(kolomAktif(ruang, { usaha: ["bank"] })).includes("air"));
  assert.ok(id(kolomAktif(ruang, { usaha: ["fnb"] })).includes("air"));
  const fnb = tanya(T, "rinci_fnb");
  assert.ok(!id(kolomAktif(fnb, { usaha: ["fnb"] }, { format: "kios" })).includes("kursi"));
  assert.ok(id(kolomAktif(fnb, { usaha: ["fnb"] }, { format: "restoran" })).includes("kursi"));
  assert.equal(berlaku({ bukan: { id: "usaha", sama: ["ev", "fnb"] } }, { usaha: ["lpg"] }), true);
  assert.equal(berlaku({ semua: [{ id: "usaha", sama: "ev" }, { id: "ruang.posisi", sama: "luar" }] }, { usaha: ["ev"], ruang: { posisi: "luar" } }), true);
});

test("percabangan dealer: SPBU yang belum terdaftar tidak ditanya ruangnya", () => {
  const terdaftar = { spbu: { terdaftar: true, id: "123", nomor: "3415138", alamat: null, kota: "Kota Tangerang", provinsi: "Banten" } };
  const belum = { spbu: { terdaftar: false, nomor: "", kota: "Kota Tangerang", catatan: "" } };
  assert.ok(id(langkahAktif(D, terdaftar)).includes("ruang"));
  assert.ok(!id(langkahAktif(D, belum)).includes("ruang"));
  assert.ok(id(langkahAktif(D, { ...belum, usaha: ["terbuka"] })).includes("prioritas"));
});

test("pilihan: wajib, batas jumlah, urutan dipertahankan, pilihan eksklusif menang sendirian", () => {
  assert.equal(periksa(tanya(T, "usaha"), []).ok, false);
  assert.equal(periksa(tanya(T, "usaha"), ["fnb", "ritel"]).ok, false, "jenis usaha hanya satu");
  assert.deepEqual(periksa(tanya(T, "usaha"), ["fnb", "tidak-ada"]), { ok: true, nilai: ["fnb"] });
  assert.deepEqual(periksa(tanya(T, "prioritas"), ["akses", "biaya", "akses"]), { ok: true, nilai: ["akses", "biaya"] });
  assert.equal(periksa(tanya(T, "prioritas"), ["akses", "biaya", "pelanggan", "jaringan"]).ok, false, "prioritas paling banyak tiga");
  assert.deepEqual(periksa(tanya(T, "pelanggan"), ["motor", "semua", "mobil"]), { ok: true, nilai: ["semua"] });
  assert.deepEqual(periksa(tanya(D, "usaha"), ["fnb", "terbuka"]), { ok: true, nilai: ["terbuka"] });
  assert.equal(periksa(tanya(D, "usaha"), ["lain"]).ok, false, "pengelola SPBU tidak ditawari kartu Lainnya");
});

test("wilayah: provinsi harus dikenal, terbuka mengosongkan daftar, tanpa pilihan ditolak", () => {
  const w = tanya(T, "wilayah");
  assert.equal(periksa(w, { terbuka: false, daftar: [] }).ok, false);
  assert.equal(periksa(w, { terbuka: false, daftar: [{ provinsi: "Atlantis", kota: null }] }).ok, false);
  assert.deepEqual(periksa(w, { terbuka: true, lain: true, daftar: [{ provinsi: "Banten", kota: "Kota Tangerang" }] }), {
    ok: true,
    nilai: { terbuka: true, lain: false, daftar: [] },
  });
  const h = periksa(w, { terbuka: false, lain: true, daftar: [{ provinsi: "Banten", kota: " Kota Tangerang " }, { provinsi: "Banten", kota: "Kota Tangerang" }, { provinsi: "Jawa Tengah" }] });
  assert.deepEqual(h, { ok: true, nilai: { terbuka: false, lain: true, daftar: [{ provinsi: "Banten", kota: "Kota Tangerang" }, { provinsi: "Jawa Tengah", kota: null }] } });
  const banyak = Array.from({ length: 11 }, (_, i) => ({ provinsi: "Banten", kota: `Kota ${i}` }));
  assert.equal(periksa(w, { terbuka: false, daftar: banyak }).ok, false);
});

test("anggaran: batas rentang dari kuesioner, isi sendiri diperiksa, selalu rupiah per tahun", () => {
  const a = tanya(T, "anggaran");
  assert.equal(periksa(a, {}).ok, false);
  assert.deepEqual(periksa(a, { pilihan: "r25", min: 1, maks: 999, fleksibel: true, satuan: "bulan" }), {
    ok: true,
    nilai: { pilihan: "r25", min: 10_000_000, maks: 25_000_000, fleksibel: true, satuan: "bulan" },
  });
  assert.deepEqual(periksa(a, { pilihan: "belum" }).nilai, { pilihan: "belum", min: null, maks: null, fleksibel: true, satuan: "tahun" });
  assert.equal(periksa(a, { pilihan: "sendiri", maks: "" }).kolom.maks.length > 0, true);
  assert.equal(periksa(a, { pilihan: "sendiri", maks: 50 }).ok, false);
  assert.equal(periksa(a, { pilihan: "sendiri", min: 40_000_000, maks: 30_000_000 }).ok, false);
  assert.deepEqual(periksa(a, { pilihan: "sendiri", min: "", maks: "36.000.000" }).nilai, { pilihan: "sendiri", min: null, maks: 36_000_000, fleksibel: false, satuan: "tahun" });
  assert.equal(teksAnggaran({ pilihan: "sendiri", min: null, maks: 36_000_000, fleksibel: false, satuan: "bulan" }), "Sampai Rp 3 juta per bulan");
  assert.equal(teksAnggaran({ pilihan: "r50plus", min: 50_000_000, maks: null, fleksibel: true, satuan: "tahun" }), "Di atas Rp 50 juta per tahun, fleksibel");
});

test("isian: angka di luar batas ditolak per kolom, kolom yang tidak tampil dibuang", () => {
  const ruang = tanya(T, "ruang");
  const usaha = { usaha: ["bank"] };
  assert.deepEqual(periksa(ruang, {}, usaha), { ok: true, nilai: {} });
  assert.deepEqual(periksa(ruang, { luas_min: "12", posisi: "dalam", air: "perlu", akses: ["jam24", "x"], parkir: "?" }, usaha), {
    ok: true,
    nilai: { luas_min: 12, posisi: "dalam", akses: ["jam24"] },
  });
  assert.equal(periksa(ruang, { luas_min: "abc" }, usaha).kolom.luas_min, "Isi dengan angka saja.");
  assert.ok(periksa(ruang, { luas_min: 0 }, usaha).kolom.luas_min);
  assert.ok(periksa(ruang, { luas_min: 50, luas_maks: 20 }, usaha).kolom.luas_min.includes("luas maksimum"));
  const fnb = tanya(T, "rinci_fnb");
  assert.deepEqual(periksa(fnb, { format: "kios", kursi: 20 }, { usaha: ["fnb"] }).nilai, { format: "kios" });
  assert.deepEqual(periksa(fnb, { format: "restoran", kursi: 20 }, { usaha: ["fnb"] }).nilai, { format: "restoran", kursi: 20 });
});

test("SPBU dan ruang: bentuk diperiksa, SPBU belum terdaftar butuh kota", () => {
  const s = tanya(D, "spbu");
  assert.equal(periksa(s, null).ok, false);
  assert.equal(periksa(s, { terdaftar: true, id: "", nomor: "3415138", provinsi: "Banten" }).ok, false);
  assert.equal(periksa(s, { terdaftar: true, id: "9", nomor: "3415138", provinsi: "Banten", kota: "" }).nilai.kota, null);
  assert.ok(periksa(s, { terdaftar: false, nomor: "abc", kota: "" }).kolom.kota);
  assert.ok(periksa(s, { terdaftar: false, nomor: "abc", kota: "Kota Semarang" }).kolom.nomor);
  assert.equal(periksa(s, { terdaftar: false, nomor: "", kota: "Kota Semarang", catatan: " baru " }).nilai.catatan, "baru");
  const r = tanya(D, "ruang");
  assert.equal(periksa(r, { semua: false, lahan: [], usul: "" }).ok, false);
  assert.deepEqual(periksa(r, { semua: true, lahan: [{ lahan_id: "1", kode: "A" }], usul: "" }).nilai, { semua: true, lahan: [], usul: "" });
  assert.deepEqual(periksa(r, { lahan: [{ lahan_id: "1", kode: "A" }, { lahan_id: "1", kode: "A" }, { kode: "B" }] }).nilai, { semua: false, lahan: [{ lahan_id: "1", kode: "A" }], usul: "" });
  assert.equal(periksa(r, { usul: "Bekas gudang di sisi timur" }).ok, true);
});

test("pembersihan: jawaban asing, tidak sah, dan cabang yang sudah tidak berlaku dibuang", () => {
  const kotor = {
    usaha: ["fnb"],
    rinci_ev: { layanan: "dc" },
    rinci_fnb: { format: "restoran", kursi: 30 },
    wilayah: { terbuka: false, daftar: [] },
    prioritas: ["biaya", "akses"],
    "<script>": "x",
    waktu: ["besok"],
  };
  const b = bersihkan(T, kotor, ["pelanggan", "usaha", "rinci_ev", "tidak-ada"]);
  assert.deepEqual(b.jawaban, { usaha: ["fnb"], prioritas: ["biaya", "akses"], rinci_fnb: { format: "restoran", kursi: 30 } });
  assert.deepEqual(b.ditolak.sort(), ["waktu", "wilayah"]);
  assert.deepEqual(b.dilewati, ["pelanggan"], "hanya pertanyaan tambahan yang tampil dan belum dijawab");
  assert.deepEqual(bersihkan(T, "bukan objek").jawaban, {});
  assert.deepEqual(bersihkan(T, null, "x").dilewati, []);
});

test("urutan langkah: inti dulu, tambahan boleh dilewati, lalu selesai", () => {
  let j = {};
  assert.equal(langkahBerikut(T, j, []), "usaha");
  j = bersihkan(T, { usaha: ["ritel"], wilayah: { terbuka: true }, anggaran: { pilihan: "belum" }, ruang: {} }).jawaban;
  assert.equal(langkahBerikut(T, j, []), "prioritas");
  assert.equal(intiLengkap(T, j), false);
  j = { ...j, prioritas: ["biaya"] };
  assert.equal(intiLengkap(T, j), true);
  assert.equal(langkahBerikut(T, j, []), "pelanggan");
  assert.equal(langkahBerikut(T, j, ["pelanggan"]), "waktu");
  assert.equal(langkahBerikut(T, j, ["pelanggan", "waktu"]), null);
});

test("ringkasan dan segmen: mengikuti jawaban, urutan prioritas terlihat", () => {
  const j = bersihkan(T, {
    usaha: ["otomotif"],
    rinci_otomotif: ["Pelumas & Oli"],
    wilayah: { terbuka: false, lain: true, daftar: [{ provinsi: "Banten", kota: "Kota Tangerang" }, { provinsi: "Jawa Tengah" }] },
    anggaran: { pilihan: "r25", fleksibel: false },
    ruang: { luas_min: 12, posisi: "luar", daya_min: 2200 },
    prioritas: ["pelanggan", "biaya"],
    pelanggan: ["motor", "mobil"],
  }).jawaban;
  const r = Object.fromEntries(ringkasan(T, j, ["waktu"]).map((b) => [b.id, b]));
  assert.deepEqual(r.usaha.butir, ["Pelumas & otomotif"]);
  assert.deepEqual(r.wilayah.butir, ["Kota Tangerang, Banten", "Seluruh Jawa Tengah", "Wilayah lain boleh disarankan"]);
  assert.deepEqual(r.anggaran.butir, ["Rp 10 juta – Rp 25 juta per tahun"]);
  assert.deepEqual(r.ruang.butir, ["Luas minimum: 12 m²", "Letak ruang: Di luar bangunan", "Daya listrik minimum: 2.200 watt"]);
  assert.deepEqual(r.prioritas.butir, ["1. Potensi pelanggan", "2. Biaya sewa terjangkau"]);
  assert.equal(r.waktu.dilewati, true);
  assert.equal(r.prioritas.sifat, "preferensi");
  assert.equal(r.ruang.sifat, "syarat");
  assert.deepEqual(segmenDari(j), ["Pelumas & Oli"]);
  assert.deepEqual(segmenDari({ usaha: ["otomotif"] }), ["Pelumas & Oli", "Nitrogen & Perawatan"]);
  assert.deepEqual(segmenDari({}), []);
  assert.deepEqual(keCalon(T, j), {
    segmen: "Pelumas & Oli",
    luas_min: "12",
    daya_min: "2200",
    posisi: "luar",
    anggaran_tahunan: "25000000",
    provinsi_minat: ["Banten", "Jawa Tengah"],
    target_pasar: "Pengendara motor, Pengendara mobil",
  });
  assert.equal(keCalon(T, { usaha: ["jasa"] }).segmen, undefined, "dua segmen: jenis usaha tidak diisi otomatis");
});

test("tampilan data sumber: alamat tidak mengulang kota, letak dan lantai dirapikan", () => {
  assert.equal(alamatSpbu({ alamat: "JL. AMPERA. Kodya Jakarta Selatan, DKI Jakarta", kota: "Kodya Jakarta Selatan", provinsi: "DKI Jakarta" }), "JL. AMPERA. Kodya Jakarta Selatan, DKI Jakarta");
  assert.equal(alamatSpbu({ alamat: "Jl. Siliwangi", kota: "Kota Semarang", provinsi: "Jawa Tengah" }), "Jl. Siliwangi, Kota Semarang, Jawa Tengah");
  assert.equal(alamatSpbu({ alamat: null, kota: null, provinsi: "Banten" }), "Banten");
  assert.equal(alamatSpbu({ alamat: "JL. BINTARO. Kodya Jakarta Selata, DKI Jakarta", kota: "Kodya Jakarta Selatan", provinsi: "DKI Jakarta" }), "JL. BINTARO. Kodya Jakarta Selata, DKI Jakarta", "salah ketik kota di sumber tidak membuat wilayah terulang");
  assert.deepEqual(letakRuang({ posisi: "Didalam Bangunan", lantai: "Lantai 1" }), ["Di dalam bangunan", "Lantai 1"]);
  assert.deepEqual(letakRuang({ posisi: "Diluar Bangunan", lantai: "2" }), ["Di luar bangunan", "Lantai 2"]);
  assert.deepEqual(letakRuang({ posisi: null, lantai: null }), []);
});
