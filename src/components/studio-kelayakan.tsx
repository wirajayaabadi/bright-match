"use client";

import { useActionState, useMemo, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { simpanSkenario } from "@/app/aksi-portal";
import type { SkenarioTersimpan } from "@/lib/data-portal";
import { n, rp, tanggal } from "@/lib/format";
import { type Asumsi, type Hasil, type ModelUsaha, type Sewa, tigaSkenario } from "@/lib/kelayakan";

type Kolom = { kunci: keyof Asumsi; label: string; satuan: string; bantu?: string };

/** Isian tiap model. Tidak ada nilai bawaan: semua angka usaha diisi pengguna dari pengalamannya sendiri. */
const MODEL: Record<ModelUsaha, { nama: string; arti: string; kolom: Kolom[] }> = {
  ritel: {
    nama: "Makanan, minuman, dan ritel",
    arti: "Pendapatan = pengunjung per hari × persen yang membeli × nilai transaksi × hari buka.",
    kolom: [
      { kunci: "kunjungan_per_hari", label: "Pengunjung yang melewati gerai", satuan: "orang per hari" },
      { kunci: "konversi_pct", label: "Yang akhirnya membeli", satuan: "% dari pengunjung" },
      { kunci: "nilai_transaksi", label: "Nilai transaksi rata-rata", satuan: "Rp per pembelian" },
      { kunci: "hari_buka", label: "Hari buka", satuan: "hari per bulan" },
      { kunci: "margin_kotor_pct", label: "Margin kotor", satuan: "% dari pendapatan", bantu: "Yang tersisa setelah harga pokok barang atau bahan." },
    ],
  },
  ev: {
    nama: "Pengisian daya kendaraan listrik",
    arti: "Energi terjual = jumlah charger × daya × jam terpakai × 30 hari. Laba kotor = energi × (harga jual − biaya listrik).",
    kolom: [
      { kunci: "jumlah_charger", label: "Jumlah charger", satuan: "unit" },
      { kunci: "daya_kw", label: "Daya per charger", satuan: "kW" },
      { kunci: "jam_pakai_per_hari", label: "Terpakai", satuan: "jam per charger per hari" },
      { kunci: "harga_per_kwh", label: "Harga jual", satuan: "Rp per kWh" },
      { kunci: "biaya_listrik_per_kwh", label: "Biaya listrik", satuan: "Rp per kWh" },
    ],
  },
  atm: {
    nama: "ATM dan layanan perbankan",
    arti: "Pendapatan = transaksi per hari × pendapatan per transaksi × 30 hari.",
    kolom: [
      { kunci: "transaksi_per_hari", label: "Transaksi", satuan: "per hari" },
      { kunci: "pendapatan_per_transaksi", label: "Pendapatan per transaksi", satuan: "Rp", bantu: "Bila nilainya tidak dihitung per transaksi, pakai model umum." },
    ],
  },
  umum: {
    nama: "Usaha lain",
    arti: "Isi pendapatan per bulan dan margin kotornya langsung.",
    kolom: [
      { kunci: "pendapatan_bulanan", label: "Pendapatan", satuan: "Rp per bulan" },
      { kunci: "margin_kotor_pct", label: "Margin kotor", satuan: "% dari pendapatan" },
    ],
  },
};

const BIAYA: Kolom[] = [
  { kunci: "gaji", label: "Gaji karyawan", satuan: "Rp per bulan" },
  { kunci: "utilitas", label: "Listrik, air, internet", satuan: "Rp per bulan" },
  { kunci: "biaya_lain", label: "Biaya lain", satuan: "Rp per bulan" },
  { kunci: "investasi_awal", label: "Investasi awal", satuan: "Rp", bantu: "Renovasi, peralatan, dan stok pertama. Deposit sewa dihitung terpisah." },
  { kunci: "diskonto_pct", label: "Tingkat diskonto", satuan: "% per tahun", bantu: "Untuk nilai kini bersih (NPV). Kosongkan bila tidak dipakai." },
];

/** "25.000" → 25000, "2,5" → 2.5. Titik dibaca sebagai pemisah ribuan, koma sebagai pecahan. */
function angka(teks: string): number | undefined {
  const bersih = teks.trim().replace(/\./g, "").replace(",", ".");
  if (bersih === "" || !/^\d+(\.\d+)?$/.test(bersih)) return undefined;
  return Number(bersih);
}

const kolom = "mt-1.5 block min-h-11 w-full rounded-lg border bg-white px-3.5 text-base text-ink focus:border-brand-blue";

/**
 * Studio kelayakan. Tiga sumber angka selalu dibedakan:
 * syarat sewa dari penawaran, asumsi yang diisi pengguna, dan hasil hitungan model.
 */
export default function StudioKelayakan({
  peluangId,
  sewa,
  versiPenawaran,
  modelAwal,
  tersimpan,
}: {
  peluangId: string;
  sewa: Sewa;
  versiPenawaran: number;
  modelAwal: ModelUsaha;
  tersimpan: SkenarioTersimpan[];
}) {
  const [model, setModel] = useState<ModelUsaha>(modelAwal);
  const [isi, setIsi] = useState<Record<string, string>>({ turun_pct: "20", naik_pct: "20" });
  const [depositKembali, setDepositKembali] = useState(true);
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [nama, setNama] = useState("");
  // di layar sempit hanya satu skenario yang tampil di tabel; layar lebar menampilkan ketiganya
  const [tampil, setTampil] = useState(1);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(simpanSkenario, null);

  const asumsi = useMemo(() => {
    const a: Asumsi = { model, deposit_kembali: depositKembali };
    for (const k of [...MODEL[model].kolom, ...BIAYA]) {
      const v = angka(isi[k.kunci] ?? "");
      if (v !== undefined) (a as Record<string, unknown>)[k.kunci] = v;
    }
    return a;
  }, [model, isi, depositKembali]);
  const turun = angka(isi.turun_pct ?? "") ?? 20;
  const naik = angka(isi.naik_pct ?? "") ?? 20;
  const hasil = useMemo(() => tigaSkenario(asumsi, sewa, turun, naik), [asumsi, sewa, turun, naik]);

  const ubah = (k: string, v: string) => {
    setIsi((x) => ({ ...x, [k]: v }));
    if (galat[k]) setGalat((g) => ({ ...g, [k]: "" }));
  };
  // nilainya diambil dari kolomnya sendiri, bukan dari state, supaya tidak tertinggal satu ketikan
  const periksa = (k: string, nilai: string) => {
    const v = nilai.trim();
    setGalat((g) => ({ ...g, [k]: v !== "" && angka(v) === undefined ? "Tulis angka saja. Pakai koma untuk pecahan, misalnya 2,5." : "" }));
  };
  const muat = (s: SkenarioTersimpan) => {
    setModel(s.model);
    const baru: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.asumsi)) if (typeof v === "number") baru[k] = String(v).replace(".", ",");
    setIsi(baru);
    setDepositKembali(s.asumsi.deposit_kembali === true);
    setNama("");
    setGalat({});
  };

  const Isian = (k: Kolom) => (
    <label key={k.kunci} className="block text-sm font-semibold text-ink">
      {k.label} <span className="font-normal text-muted">({k.satuan})</span>
      <input
        type="text"
        inputMode="decimal"
        value={isi[k.kunci] ?? ""}
        onChange={(e) => ubah(k.kunci, e.target.value)}
        onBlur={(e) => periksa(k.kunci, e.target.value)}
        aria-invalid={galat[k.kunci] ? true : undefined}
        className={`${kolom} ${galat[k.kunci] ? "border-brand-red" : "border-line"}`}
      />
      {(galat[k.kunci] || k.bantu) && (
        <span className={`mt-1 block text-xs font-normal ${galat[k.kunci] ? "font-medium text-brand-red-strong" : "text-subtle"}`}>{galat[k.kunci] || k.bantu}</span>
      )}
    </label>
  );

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:items-start">
      <div className="grid grid-cols-1 gap-8">
        <section>
          <Sumber label={`Dari penawaran versi ${versiPenawaran}`} />
          <h2 className="mt-2 text-lg font-bold text-ink">Syarat sewa</h2>
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            <Baris nama="Sewa per bulan" nilai={rp(sewa.sewa_tahunan / 12)} />
            <Baris nama="Lama sewa" nilai={`${n(sewa.lama_sewa_bulan)} bulan`} />
            <Baris nama="Masa bebas sewa" nilai={sewa.bebas_sewa_bulan > 0 ? `${n(sewa.bebas_sewa_bulan)} bulan pertama` : "Tidak ada"} />
            <Baris nama="Deposit" nilai={sewa.deposit > 0 ? rp(sewa.deposit) : "Tidak ada"} />
            <Baris nama="Bagi hasil" nilai={sewa.bagi_hasil_pct > 0 ? `${String(sewa.bagi_hasil_pct).replace(".", ",")}% dari omzet` : "Tidak ada"} />
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-subtle">Angka ini tidak bisa diubah di sini. Bila syaratnya berubah, tim Non Fuel Retail menerbitkan versi baru.</p>
        </section>

        <section>
          <Sumber label="Asumsi Anda" />
          <h2 className="mt-2 text-lg font-bold text-ink">Usaha Anda di lokasi ini</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Bright Match belum punya data kunjungan atau omzet di lokasi ini, jadi tidak ada angka yang terisi sendiri. Isi dari pengalaman gerai Anda yang
            lain. Pakai koma untuk pecahan.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="block text-sm font-semibold text-ink">
              Jenis usaha
              <select value={model} onChange={(e) => setModel(e.target.value as ModelUsaha)} className={`${kolom} border-line`}>
                {(Object.keys(MODEL) as ModelUsaha[]).map((m) => (
                  <option key={m} value={m}>
                    {MODEL[m].nama}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-subtle">{MODEL[model].arti}</span>
            </label>
            {MODEL[model].kolom.map(Isian)}
          </div>
          <h3 className="mt-6 text-base font-bold text-ink">Biaya dan investasi</h3>
          <div className="mt-3 grid gap-4">
            {BIAYA.map(Isian)}
            {sewa.deposit > 0 && (
              <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink">
                <input type="checkbox" checked={depositKembali} onChange={(e) => setDepositKembali(e.target.checked)} className="mt-1" />
                <span>
                  <span className="font-semibold">Deposit dikembalikan di akhir masa sewa</span>
                  <span className="block text-muted">Sesuaikan dengan isi kontrak nanti.</span>
                </span>
              </label>
            )}
          </div>
          <h3 className="mt-6 text-base font-bold text-ink">Seberapa jauh skenario lain dari skenario dasar</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Skenario konservatif dan optimistis menggeser sisi permintaan saja, biaya tetap sama. Angka 20% hanya titik awal; ubah sesuai keyakinan Anda.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            {Isian({ kunci: "turun_pct" as keyof Asumsi, label: "Konservatif turun", satuan: "%" })}
            {Isian({ kunci: "naik_pct" as keyof Asumsi, label: "Optimistis naik", satuan: "%" })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:sticky xl:top-6">
        <section>
          <Sumber label="Hitungan model" />
          <h2 className="mt-2 text-lg font-bold text-ink">Hasil tiga skenario</h2>
          {hasil.dasar.lengkap ? (
            <>
              <div role="group" aria-label="Skenario yang ditampilkan" className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-line bg-white p-1 sm:hidden">
                {["Konservatif", "Dasar", "Optimistis"].map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tampil === i}
                    onClick={() => setTampil(i)}
                    className={`min-h-11 rounded-md text-sm font-semibold ${tampil === i ? "bg-brand-blue text-white" : "text-ink"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white shadow-card">
                <table className="w-full border-collapse text-sm sm:min-w-[500px]">
                  <thead>
                    <tr className="border-b border-line text-right text-xs font-semibold tracking-wide text-subtle uppercase">
                      <th scope="col" className="px-4 py-3 text-left">
                        Per bulan
                      </th>
                      <th scope="col" className={`px-3 py-3 sm:table-cell ${tampil === 0 ? "" : "hidden"}`}>
                        Konservatif
                        <span className="block font-normal normal-case">permintaan −{String(turun).replace(".", ",")}%</span>
                      </th>
                      <th scope="col" className={`px-3 py-3 sm:table-cell ${tampil === 1 ? "" : "hidden"}`}>
                        Dasar
                        <span className="block font-normal normal-case">asumsi Anda</span>
                      </th>
                      <th scope="col" className={`px-3 py-3 sm:table-cell ${tampil === 2 ? "" : "hidden"}`}>
                        Optimistis
                        <span className="block font-normal normal-case">permintaan +{String(naik).replace(".", ",")}%</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <BarisHasil tampil={tampil} nama="Pendapatan" h={hasil} ambil={(x) => rp(x.pendapatan)} />
                    <BarisHasil tampil={tampil} nama="Laba kotor" h={hasil} ambil={(x) => rp(x.laba_kotor)} />
                    <BarisHasil tampil={tampil} nama="Biaya operasi, termasuk sewa" h={hasil} ambil={(x) => rp(x.biaya_operasi)} />
                    <BarisHasil tampil={tampil} nama="Laba operasi" h={hasil} tebal ambil={(x) => uang(x.laba_operasi)} />
                    <tr className="border-b border-line bg-canvas/60">
                      <th scope="colgroup" colSpan={4} className="px-4 py-2 text-left text-xs font-semibold tracking-wide text-subtle uppercase">
                        Selama masa sewa {n(sewa.lama_sewa_bulan)} bulan
                      </th>
                    </tr>
                    <BarisHasil tampil={tampil} nama="Investasi awal, termasuk deposit" h={hasil} ambil={(x) => rp(x.investasi_awal)} />
                    <BarisHasil tampil={tampil} nama="Titik impas (pendapatan per bulan)" h={hasil} ambil={(x) => (x.titik_impas != null ? rp(x.titik_impas) : "Tidak tercapai")} />
                    <BarisHasil
                      tampil={tampil}
                      nama="Balik modal"
                      h={hasil}
                      ambil={(x) => (x.balik_modal_bulan != null ? `${String(Math.round(x.balik_modal_bulan * 10) / 10).replace(".", ",")} bulan` : "Tidak dalam masa sewa")}
                    />
                    <BarisHasil tampil={tampil} nama="Arus kas bersih di akhir masa sewa" h={hasil} tebal ambil={(x) => uang(x.kumulatif_akhir)} />
                    <BarisHasil tampil={tampil} nama="Nilai kini bersih (NPV)" h={hasil} ambil={(x) => (x.npv != null ? uang(x.npv) : "Isi tingkat diskonto")} />
                    <BarisHasil
                      tampil={tampil}
                      nama="IRR per tahun"
                      h={hasil}
                      ambil={(x) => (x.irr_pct != null ? `${String(Math.round(x.irr_pct * 10) / 10).replace(".", ",")}%` : "Tidak bisa dihitung")}
                    />
                  </tbody>
                </table>
              </div>
              <Banding hasil={hasil} />
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                Semua angka di atas dihitung dari asumsi Anda sendiri dan syarat sewa di penawaran. Ini bukan perkiraan Pertamina dan bukan jaminan hasil.
                IRR hanya dihitung bila arus kas berganti tanda satu kali.
              </p>
            </>
          ) : (
            <p className="mt-3 rounded-xl border border-line bg-white px-4 py-6 text-sm leading-relaxed text-muted shadow-card">
              Hasil muncul setelah isian ini terisi: <strong className="text-ink">{hasil.dasar.kurang.join(", ")}</strong>.
            </p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">Simpan skenario ini</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Tersimpan sebagai versi baru. Hanya organisasi Anda yang bisa melihatnya; tim Pertamina tidak bisa membaca asumsi Anda.
          </p>
          <form action={kirim} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={peluangId} />
            <input type="hidden" name="model" value={model} />
            <input type="hidden" name="asumsi" value={JSON.stringify({ ...asumsi, turun_pct: turun, naik_pct: naik })} />
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold text-ink sm:max-w-xs">
              Nama skenario
              <input type="text" name="nama" maxLength={80} value={nama} onChange={(e) => setNama(e.target.value)} className={`${kolom} mt-0 border-line`} />
            </label>
            <button type="submit" disabled={menunggu} className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60">
              {menunggu ? "Menyimpan…" : "Simpan sebagai versi baru"}
            </button>
          </form>
          {status && (
            <p
              role={status.ok ? "status" : "alert"}
              className={`mt-3 inline-block rounded-md px-3 py-2 text-sm font-medium ${status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"}`}
            >
              {status.pesan}
            </p>
          )}
          {tersimpan.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
              {tersimpan.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">
                      Versi {s.versi}: {s.nama}
                    </span>
                    <span className="block text-xs text-muted">
                      {MODEL[s.model].nama} · laba operasi dasar {uang(s.hasil.dasar.laba_operasi)} per bulan · penawaran versi {s.penawaran_versi}
                      {s.penawaran_versi !== versiPenawaran ? " (syarat sewanya sudah berganti)" : ""} · {tanggal(s.dibuat)} oleh {s.dibuat_oleh ?? "–"}
                    </span>
                  </span>
                  <button type="button" onClick={() => muat(s)} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-subtle">
                    Muat asumsi ini
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Rupiah dengan tanda rugi yang dieja, supaya tidak hanya dibedakan lewat warna. */
const uang = (v: number) => (v < 0 ? `rugi ${rp(-v)}` : rp(v));

function Sumber({ label }: { label: string }) {
  return <p className="inline-block rounded-md border border-line bg-white px-2 py-0.5 text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>;
}

function Baris({ nama, nilai }: { nama: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted">{nama}</dt>
      <dd className="angka text-right font-semibold text-ink">{nilai}</dd>
    </div>
  );
}

type Tiga = { konservatif: Hasil; dasar: Hasil; optimistis: Hasil };

function BarisHasil({ nama, h, ambil, tampil, tebal = false }: { nama: string; h: Tiga; ambil: (x: Hasil) => string; tampil: number; tebal?: boolean }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <th scope="row" className={`px-4 py-2.5 text-left ${tebal ? "font-bold text-ink" : "font-normal text-muted"}`}>
        {nama}
      </th>
      {([h.konservatif, h.dasar, h.optimistis] as const).map((x, i) => (
        <td key={i} className={`angka px-3 py-2.5 text-right whitespace-nowrap sm:table-cell ${tampil === i ? "" : "hidden"} ${tebal ? "font-bold text-ink" : "text-ink"}`}>
          {ambil(x)}
        </td>
      ))}
    </tr>
  );
}

/** Banding arus kas bersih tiga skenario. Panjang batang sebanding nilainya; untung dan rugi dieja di labelnya. */
function Banding({ hasil }: { hasil: Tiga }) {
  const butir = [
    { nama: "Konservatif", v: hasil.konservatif.kumulatif_akhir },
    { nama: "Dasar", v: hasil.dasar.kumulatif_akhir },
    { nama: "Optimistis", v: hasil.optimistis.kumulatif_akhir },
  ];
  const maks = Math.max(1, ...butir.map((b) => Math.abs(b.v)));
  return (
    <figure className="mt-4 rounded-xl border border-line bg-white px-4 py-3.5 shadow-card">
      <figcaption className="text-sm font-bold text-ink">Arus kas bersih di akhir masa sewa</figcaption>
      <ul className="mt-3 grid gap-2.5">
        {butir.map((b) => (
          <li key={b.nama} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
            <span className="text-muted">{b.nama}</span>
            <span className="grid gap-1">
              <span className="block h-2.5 rounded-full bg-canvas">
                <span
                  className={`block h-2.5 rounded-full ${b.v < 0 ? "bg-brand-red" : "bg-brand-blue"}`}
                  style={{ width: `${Math.max(1.5, (100 * Math.abs(b.v)) / maks)}%` }}
                />
              </span>
              <span className="angka text-xs font-semibold text-ink">{b.v < 0 ? `Rugi ${rp(-b.v)}` : `Untung ${rp(b.v)}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
