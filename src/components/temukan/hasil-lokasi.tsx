"use client";

import { ArrowRight, List, Map as IkonPeta, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { catatPeristiwa, muatKeyakinan, tandaiLokasi } from "@/app/aksi-temukan";
import BandingLokasi from "@/components/temukan/banding-lokasi";
import KartuLokasi from "@/components/temukan/kartu-lokasi";
import { NyatakanMinat, TandaiLokasi } from "@/components/temukan/minat-lokasi";
import UmpanBalik from "@/components/temukan/umpan-balik";
import type { Keyakinan } from "@/lib/data-kecocokan";
import { n, tanggal } from "@/lib/format";
import {
  CARA_URUT,
  type CaraUrut,
  type HasilLokasi as Hasil,
  kesesuaian,
  konteksDaftar,
  type LokasiDinilai,
  MAKS_BANDING,
  potretLokasi,
  saring,
  syaratBelumPasti,
  urutkan,
  VERSI_PREFERENSI,
} from "@/lib/temukan/rekomendasi";
import type { Diminati, Jawaban } from "@/lib/temukan/tipe";

const PetaHasil = dynamic(() => import("@/components/temukan/peta-hasil"), {
  ssr: false,
  loading: () => <div role="status" aria-label="Memuat peta" className="h-[420px] animate-pulse rounded-xl bg-line/60 sm:h-[520px]" />,
});

const PER_HALAMAN = 12;
const kendali = "block min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink focus:border-brand-blue";

/**
 * Hasil rekomendasi lokasi (PersonalizedResults). Daftarnya sudah lolos syarat wajib di basis data;
 * di sini lokasi dinilai terhadap preferensi, lalu dicari, disaring, diurutkan, dan dibagi per halaman.
 */
export default function HasilLokasi({
  hasil,
  jawaban,
  mode,
  minatAwal,
  diminatiAwal,
  preferensiRingkas,
  umpanAwal,
}: {
  hasil: Hasil;
  jawaban: Jawaban;
  /** tamu: pengunjung tanpa akun tenant, menandai lokasi lalu mendaftar. tenant: akun tenant, menyatakan minat. lain: tanpa tindakan minat. */
  mode: "tamu" | "tenant" | "lain";
  /** Minat organisasi ini yang masih berjalan: lahan_id ke tanggalnya. */
  minatAwal: Record<string, string>;
  diminatiAwal: Diminati[];
  /** Ringkasan preferensi yang ikut disimpan di potret saat minat dinyatakan. */
  preferensiRingkas: string[];
  /** Penilaian yang sudah diberikan sesi ini: lahan_id ke penilaiannya. */
  umpanAwal: Record<string, { nilai: "sesuai" | "kurang"; alasan: string | null }>;
}) {
  const id = useId();
  const [banding, setBanding] = useState<string[]>([]);
  const [minat, setMinat] = useState<Record<string, string>>(minatAwal);
  const [diminati, setDiminati] = useState<Diminati[]>(diminatiAwal);
  const [pesanTanda, setPesanTanda] = useState<string | null>(null);
  // Jumlah simpanan tanda yang masih berjalan: tombol mendaftar baru aktif setelah semuanya selesai.
  const [menyimpanTanda, setMenyimpanTanda] = useState(0);
  const [cari, setCari] = useState("");
  const [kota, setKota] = useState("");
  const [terverifikasi, setTerverifikasi] = useState(false);
  const [urut, setUrut] = useState<CaraUrut>("sesuai");
  const [halaman, setHalaman] = useState(1);
  const [tampilan, setTampilan] = useState<"daftar" | "peta" | "banding">("daftar");
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [keyakinan, setKeyakinan] = useState<Record<string, Keyakinan | null>>({});

  const dinilai = useMemo(() => {
    const k = konteksDaftar(hasil.lokasi);
    return hasil.lokasi.map((lokasi) => ({
      lokasi,
      sesuai: kesesuaian(lokasi, jawaban, k),
    }));
  }, [hasil.lokasi, jawaban]);

  const pilihanKota = useMemo(() => {
    const per = new Map<string, { nama: string; jumlah: number }>();
    for (const { lokasi: l } of dinilai) {
      const kunci = `${l.provinsi}|${l.kota ?? ""}`;
      const ada = per.get(kunci);
      if (ada) ada.jumlah += 1;
      else
        per.set(kunci, {
          nama: l.kota ? `${l.kota}, ${l.provinsi}` : l.provinsi,
          jumlah: 1,
        });
    }
    return [...per.entries()].sort((a, b) => a[1].nama.localeCompare(b[1].nama));
  }, [dinilai]);

  const tersaring = useMemo(() => urutkan(saring(dinilai, { cari, kota, terverifikasi }), urut), [dinilai, cari, kota, terverifikasi, urut]);
  // Lokasi di wilayah pilihan selalu lebih dulu; di luar wilayah tampil di bagian tersendiri.
  const diWilayah = tersaring.filter((x) => x.lokasi.di_wilayah);
  const diLuar = tersaring.filter((x) => !x.lokasi.di_wilayah);
  const semua = [...diWilayah, ...diLuar];
  const jumlahHalaman = Math.max(1, Math.ceil(semua.length / PER_HALAMAN));
  const hal = Math.min(halaman, jumlahHalaman);
  const tampil = semua.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN);
  // Keyakinan data juga dibutuhkan lokasi yang dibandingkan, walau sedang tidak tampil di halaman ini.
  const idTampil = [...new Set([...tampil.map((x) => x.lokasi.lahan_id), ...banding])].join(",");
  const dibandingkan = banding.map((b) => dinilai.find((x) => x.lokasi.lahan_id === b)).filter((x): x is LokasiDinilai => x !== undefined);

  // Analitik tanpa identitas: rekomendasi dilihat (sekali per kunjungan) dan diklik (sekali per lokasi per jenis klik).
  const jumlah = hasil.jumlah;
  const jumlahLain = hasil.jumlah_lain;
  useEffect(() => {
    void catatPeristiwa("tenant", "recommendation_viewed", { jumlah, jumlah_lain: jumlahLain }).catch(() => {});
  }, [jumlah, jumlahLain]);
  const sudahKlik = useRef(new Set<string>());
  function catatKlik(aksi: "rinci" | "banding" | "tandai" | "peta" | "minat", x?: LokasiDinilai) {
    const kunci = `${aksi}|${x?.lokasi.lahan_id ?? ""}`;
    if (sudahKlik.current.has(kunci)) return;
    sudahKlik.current.add(kunci);
    const urutKe = x ? semua.findIndex((y) => y.lokasi.lahan_id === x.lokasi.lahan_id) + 1 : 0;
    void catatPeristiwa("tenant", "recommendation_clicked", { aksi, ...(x ? { urut: urutKe, skor: x.lokasi.skor } : {}) }).catch(() => {});
  }

  function ubahBanding(lahanId: string) {
    setBanding((lama) => (lama.includes(lahanId) ? lama.filter((x) => x !== lahanId) : lama.length >= MAKS_BANDING ? lama : [...lama, lahanId]));
  }

  /** Menandai atau melepas tanda. Layar diubah dulu; bila simpanan gagal, dikembalikan dan pengguna diberi tahu. */
  function ubahTanda(x: LokasiDinilai) {
    const l = x.lokasi;
    const sebelum = diminati;
    const ada = sebelum.some((d) => d.lahan_id === l.lahan_id);
    if (!ada && sebelum.length >= 10) {
      setPesanTanda("Paling banyak sepuluh lokasi bisa ditandai. Lepas satu tanda dulu.");
      return;
    }
    const baru = ada
      ? sebelum.filter((d) => d.lahan_id !== l.lahan_id)
      : [
          ...sebelum,
          {
            lahan_id: l.lahan_id,
            kode: l.kode,
            spbu_nomor: l.spbu_nomor,
            potret: potretLokasi(x, hasil.versi_model, preferensiRingkas),
          },
        ];
    setDiminati(baru);
    setPesanTanda(null);
    setMenyimpanTanda((v) => v + 1);
    tandaiLokasi(baru)
      .then((h) => {
        if (!h.ok) {
          setDiminati(sebelum);
          setPesanTanda(h.pesan || "Tanda belum tersimpan. Coba lagi.");
        }
      })
      .catch(() => {
        setDiminati(sebelum);
        setPesanTanda("Tanda belum tersimpan. Periksa sambungan Anda, lalu coba lagi.");
      })
      .finally(() => setMenyimpanTanda((v) => v - 1));
  }

  // Keyakinan data hanya dimuat untuk lokasi yang sedang tampil, dan hanya sekali per lokasi.
  useEffect(() => {
    const belum = idTampil.split(",").filter((x) => x !== "" && !(x in keyakinan));
    if (belum.length === 0) return;
    let batal = false;
    muatKeyakinan(belum)
      .then(
        (h) =>
          !batal &&
          setKeyakinan((lama) => ({
            ...lama,
            ...Object.fromEntries(belum.map((x) => [x, h[x] ?? null])),
          })),
      )
      .catch(
        () =>
          !batal &&
          setKeyakinan((lama) => ({
            ...lama,
            ...Object.fromEntries(belum.map((x) => [x, null])),
          })),
      );
    return () => {
      batal = true;
    };
  }, [idTampil, keyakinan]);

  const ubah =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setHalaman(1);
    };
  const adaSaring = cari.trim() !== "" || kota !== "" || terverifikasi;
  const terpotong = hasil.jumlah + hasil.jumlah_lain > hasil.lokasi.length;
  const pertamaLuar = tampil.findIndex((x) => !x.lokasi.di_wilayah);
  // Data kosong lolos syarat di mesin (belum terbukti melanggar), tetapi tidak boleh terlihat seperti sudah terpenuhi.
  const belumPasti = hasil.lokasi.filter((l) => syaratBelumPasti(l, jawaban).length > 0).length;

  return (
    <div>
      <p className="text-[15px] leading-relaxed text-muted">
        <span className="angka font-semibold text-ink">{n(hasil.jumlah)} lokasi</span> memenuhi semua syarat wajib Anda
        {hasil.jumlah_lain > 0 ? `, ditambah ${n(hasil.jumlah_lain)} di luar wilayah pilihan Anda` : ""}.
        {hasil.tertahan > 0
          ? ` ${n(hasil.tertahan)} lainnya memenuhi syarat tetapi belum bisa ditawarkan: ditahan, datanya sedang diperiksa, atau sedang menuju kontrak.`
          : ""}
        {belumPasti > 0
          ? ` ${n(belumPasti)} di daftar ini punya data yang belum tercatat untuk syarat yang Anda minta, jadi syarat itu belum bisa dipastikan; kartunya diberi tanda.`
          : ""}
        {terpotong ? ` Daftar ini memuat ${n(hasil.lokasi.length)} teratas menurut skor kecocokan; persempit wilayah untuk melihat sisanya.` : ""}
      </p>

      {tampilan !== "banding" && (
        <>
          <div className="mt-6 rounded-xl border border-line bg-white p-4 shadow-card">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <label htmlFor={`${id}-cari`} className="block text-sm font-semibold text-ink">
                  Cari SPBU, kode ruang, atau alamat
                </label>
                <div className="relative mt-1.5">
                  <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-subtle" />
                  <input id={`${id}-cari`} type="search" autoComplete="off" value={cari} onChange={(e) => ubah(setCari)(e.target.value)} className={`${kendali} pl-10`} />
                </div>
              </div>
              <div>
                <label htmlFor={`${id}-kota`} className="block text-sm font-semibold text-ink">
                  Kota
                </label>
                <select id={`${id}-kota`} value={kota} onChange={(e) => ubah(setKota)(e.target.value)} className={`${kendali} mt-1.5`}>
                  <option value="">Semua kota ({pilihanKota.length})</option>
                  {pilihanKota.map(([kunci, k]) => (
                    <option key={kunci} value={kunci}>
                      {k.nama} ({k.jumlah})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-urut`} className="block text-sm font-semibold text-ink">
                  Urutkan
                </label>
                <select id={`${id}-urut`} value={urut} onChange={(e) => ubah(setUrut)(e.target.value as CaraUrut)} className={`${kendali} mt-1.5`}>
                  {CARA_URUT.map((c) => (
                    <option key={c.nilai} value={c.nilai}>
                      {c.nama}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
                <input
                  type="checkbox"
                  checked={terverifikasi}
                  onChange={(e) => ubah(setTerverifikasi)(e.target.checked)}
                  className="size-5 shrink-0 accent-[var(--color-brand-blue)]"
                />
                Hanya yang sudah diverifikasi di lokasi
              </label>
              <div role="group" aria-label="Tampilan hasil" className="inline-flex rounded-lg border border-line bg-white p-1 text-sm">
                {(
                  [
                    ["daftar", "Daftar", List],
                    ["peta", "Peta", IkonPeta],
                  ] as const
                ).map(([nilai, nama, Ikon]) => (
                  <button
                    key={nilai}
                    type="button"
                    onClick={() => {
                      setTampilan(nilai);
                      if (nilai === "peta") catatKlik("peta");
                    }}
                    aria-pressed={tampilan === nilai}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3.5 font-semibold transition-colors duration-150 ${tampilan === nilai ? "bg-brand-blue text-white" : "text-muted hover:text-ink"}`}
                  >
                    <Ikon aria-hidden="true" className="size-4" />
                    {nama}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p role="status" className="mt-4 text-sm text-muted">
            {semua.length === 0
              ? "Tidak ada lokasi yang cocok dengan pencarian ini."
              : `${n(semua.length)} lokasi${adaSaring ? " cocok dengan pencarian ini" : ""}. ${urut === "sesuai" ? "Urutan: rata-rata skor kecocokan dan kesesuaian preferensi." : ""}`}
          </p>
        </>
      )}

      {semua.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-white p-6 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">Tidak ada lokasi yang cocok dengan pencarian ini</p>
          <p className="mt-1 text-sm text-muted">Syarat wajib Anda tidak berubah. Kosongkan pencarian untuk melihat semua lokasi lagi.</p>
          <button
            type="button"
            onClick={() => {
              setCari("");
              setKota("");
              setTerverifikasi(false);
              setHalaman(1);
            }}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:border-brand-blue/60"
          >
            Kosongkan pencarian
          </button>
        </div>
      ) : tampilan === "banding" && dibandingkan.length > 0 ? (
        <BandingLokasi daftar={dibandingkan} keyakinan={keyakinan} onHapus={ubahBanding} onKembali={() => setTampilan("daftar")} />
      ) : tampilan === "peta" ? (
        <div className="mt-4">
          <PetaHasil
            daftar={semua}
            onPilih={(nomor) => {
              ubah(setCari)(nomor);
              setTampilan("daftar");
            }}
          />
        </div>
      ) : (
        <>
          <ol className="mt-4 space-y-4">
            {tampil.map((x, i) => (
              <li key={x.lokasi.lahan_id}>
                {i === pertamaLuar && (
                  <h2 className="mt-8 mb-3 border-t border-line pt-6 text-lg font-bold text-ink">
                    Di luar wilayah pilihan Anda
                    <span className="mt-1 block text-sm font-normal text-muted">
                      Ditampilkan karena Anda mengizinkan saran wilayah lain. Syarat lainnya tetap terpenuhi.
                    </span>
                  </h2>
                )}
                <KartuLokasi
                  item={x}
                  jawaban={jawaban}
                  keyakinan={keyakinan[x.lokasi.lahan_id]}
                  terbuka={terbuka === x.lokasi.lahan_id}
                  onBuka={() => {
                    setTerbuka(terbuka === x.lokasi.lahan_id ? null : x.lokasi.lahan_id);
                    catatKlik("rinci", x);
                  }}
                  dibandingkan={banding.includes(x.lokasi.lahan_id)}
                  bandingPenuh={banding.length >= MAKS_BANDING}
                  onBanding={() => {
                    ubahBanding(x.lokasi.lahan_id);
                    catatKlik("banding", x);
                  }}
                  umpan={
                    mode === "lain" ? null : (
                      <UmpanBalik
                        peran="tenant"
                        lahanId={x.lokasi.lahan_id}
                        subjek={`ruang ${x.lokasi.kode}`}
                        awal={umpanAwal[x.lokasi.lahan_id] ?? null}
                        potret={{ ...potretLokasi(x, hasil.versi_model, []), urut: semua.findIndex((y) => y.lokasi.lahan_id === x.lokasi.lahan_id) + 1 }}
                      />
                    )
                  }
                  aksi={
                    mode === "tenant" ? (
                      <NyatakanMinat
                        lahanId={x.lokasi.lahan_id}
                        kode={x.lokasi.kode}
                        tercatat={minat[x.lokasi.lahan_id] ?? null}
                        potret={() => potretLokasi(x, hasil.versi_model, preferensiRingkas)}
                        onTercatat={() => {
                          setMinat((lama) => ({ ...lama, [x.lokasi.lahan_id]: "baru" }));
                          catatKlik("minat", x);
                        }}
                      />
                    ) : mode === "tamu" ? (
                      <TandaiLokasi
                        ditandai={diminati.some((d) => d.lahan_id === x.lokasi.lahan_id)}
                        penuh={diminati.length >= 10}
                        kode={x.lokasi.kode}
                        onUbah={() => {
                          ubahTanda(x);
                          catatKlik("tandai", x);
                        }}
                      />
                    ) : null
                  }
                />
              </li>
            ))}
          </ol>
          {jumlahHalaman > 1 && (
            <nav aria-label="Halaman hasil" className="mt-6 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => hal > 1 && (setHalaman(hal - 1), window.scrollTo({ top: 0 }))}
                aria-disabled={hal === 1}
                className={`inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-[15px] font-semibold ${hal === 1 ? "text-subtle" : "text-ink hover:border-brand-blue/60"}`}
              >
                Sebelumnya
              </button>
              <p className="angka text-sm text-muted">
                Halaman {hal} dari {jumlahHalaman}
              </p>
              <button
                type="button"
                onClick={() => hal < jumlahHalaman && (setHalaman(hal + 1), window.scrollTo({ top: 0 }))}
                aria-disabled={hal === jumlahHalaman}
                className={`inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-[15px] font-semibold ${hal === jumlahHalaman ? "text-subtle" : "text-ink hover:border-brand-blue/60"}`}
              >
                Berikutnya
              </button>
            </nav>
          )}
        </>
      )}

      {mode !== "lain" && (
        <section aria-labelledby={`${id}-lanjut`} className="mt-10 rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
          <h2 id={`${id}-lanjut`} className="text-lg font-bold text-ink">
            {mode === "tenant" ? "Setelah Anda menyatakan minat" : "Tertarik pada salah satu lokasi?"}
          </h2>
          {mode === "tenant" ? (
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">
              Minat masuk ke tim Non Fuel Retail Pertamina, yang lalu menghubungi organisasi Anda. Minat tidak mengikat dan belum menjadi penawaran: penawaran resmi baru
              terbit setelah ruang diverifikasi dan wewenang SPBU dipastikan, dan tampil di ruang kerja Anda.
            </p>
          ) : (
            <>
              <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">
                Tandai lokasi yang Anda minati, lalu daftar sebagai Bright Partner. Lokasi yang ditandai ikut diteruskan ke tim Non Fuel Retail Pertamina bersama data
                kontak Anda. Rekomendasi ini bukan penawaran: tarif acuan berasal dari Brightspace, dan penawaran resmi baru terbit setelah ruang diverifikasi dan
                wewenang SPBU dipastikan.
              </p>
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                <Link
                  href="/daftar"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong"
                >
                  Daftar sebagai Bright Partner
                  <ArrowRight aria-hidden="true" className="size-4.5" />
                </Link>
                <Link
                  href="/login?lanjut=/temukan/tenant/hasil"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line bg-white px-5 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-brand-blue/60"
                >
                  Sudah punya akun tenant? Masuk
                </Link>
              </div>
            </>
          )}
        </section>
      )}

      {(banding.length > 0 || (mode === "tamu" && diminati.length > 0) || pesanTanda) && tampilan !== "banding" && (
        <div
          role="region"
          aria-label="Lokasi yang dipilih"
          className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-line bg-white px-4 py-3 shadow-[0_-2px_8px_rgb(16_24_40/0.06)] sm:mx-0 sm:rounded-xl sm:border sm:px-5"
        >
          {pesanTanda && (
            <p role="alert" className="mb-2 text-sm font-medium text-brand-red-strong">
              {pesanTanda}
            </p>
          )}
          {banding.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p role="status" className="angka text-sm text-ink">
                <span className="font-semibold">
                  {banding.length} dari {MAKS_BANDING}
                </span>{" "}
                lokasi dipilih untuk dibandingkan
                {banding.length < 2 ? ". Pilih satu lagi." : "."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBanding([])}
                  className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted hover:text-ink hover:underline"
                >
                  Kosongkan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (banding.length >= 2) {
                      setTampilan("banding");
                      window.scrollTo({ top: 0 });
                    }
                  }}
                  aria-disabled={banding.length < 2}
                  className={`inline-flex min-h-11 items-center rounded-lg px-4 text-[15px] font-semibold ${banding.length < 2 ? "border border-line bg-white text-subtle" : "bg-brand-blue text-white hover:bg-brand-blue-strong"}`}
                >
                  Bandingkan
                </button>
              </div>
            </div>
          )}
          {mode === "tamu" && diminati.length > 0 && (
            <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${banding.length > 0 ? "mt-2 border-t border-line pt-2" : ""}`}>
              <p role="status" className="angka text-sm text-ink">
                <span className="font-semibold">{diminati.length} lokasi ditandai.</span> Diteruskan ke tim Non Fuel Retail saat Anda mendaftar.
              </p>
              {menyimpanTanda > 0 ? (
                <span role="status" className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white opacity-70">
                  Menyimpan tanda…
                </span>
              ) : (
                <Link
                  href="/daftar"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white hover:bg-brand-blue-strong"
                >
                  Lanjut mendaftar
                  <ArrowRight aria-hidden="true" className="size-4.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-subtle">
        Skor kecocokan menunjukkan kemiripan dengan pola yang sudah ada di jaringan SPBU, bukan peluang berhasil. Model kecocokan versi {hasil.versi_model}, rumus
        preferensi versi {VERSI_PREFERENSI}. Sumber: {hasil.sumber.map((s) => `${s.nama} per ${tanggal(s.per_tanggal)}`).join("; ")}.
      </p>
    </div>
  );
}
