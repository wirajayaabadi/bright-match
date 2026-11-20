"use client";

import { ArrowLeft, ArrowRight, Check, CloudOff, Info, LoaderCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { muatSpbu, simpanTemukan } from "@/app/aksi-temukan";
import MulaiUlang from "@/components/temukan/mulai-ulang";
import type { MuatanSpbu } from "@/components/temukan/pilih-ruang";
import TampilPertanyaan from "@/components/temukan/pertanyaan";
import RingkasanPreferensi from "@/components/temukan/ringkasan-preferensi";
import { intiDiperkirakan, intiLengkap, langkahAktif, langkahBerikut, langkahTujuan, RINGKASAN, terjawab } from "@/lib/temukan/cabang";
import { kuesioner, NAMA_PERAN } from "@/lib/temukan/kuesioner";
import { bersihkan, periksa } from "@/lib/temukan/periksa";
import { ringkasan } from "@/lib/temukan/ringkas";
import type { JawabSpbu, Jawaban, NilaiJawab, Peran, SpbuRinci, SpbuUmum, Wilayah } from "@/lib/temukan/tipe";

type Galat = { pesan: string | null; kolom: Record<string, string> };
const TANPA_GALAT: Galat = { pesan: null, kolom: {} };
type Muatan = { peran: Peran; langkah: string | null; jawaban: Jawaban; dilewati: string[]; selesai: boolean };

const utama = "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong";
const sekunder = "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-brand-blue/60";

/** Kunci yang nilainya berubah di antara dua isian, untuk menghapus pesan galat kolom yang sedang diperbaiki. */
function kunciBerubah(a: unknown, b: unknown): string[] {
  const x = (a && typeof a === "object" && !Array.isArray(a) ? a : {}) as Record<string, unknown>;
  const y = (b && typeof b === "object" && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
}

/**
 * Wizard Temukan peluang (DiscoveryWizard): satu pertanyaan per langkah, jawaban diperiksa saat
 * melanjutkan, lalu disimpan ke sesi di latar belakang. Pertanyaan dan percabangannya dibaca dari
 * kuesioner berversi; komponen ini hanya mengurus langkah, simpanan, dan fokus.
 */
export default function Wizard({
  peran,
  awal,
  wilayah,
  spbuSaya,
  ruangAkun,
  ubah: modeUbah = false,
}: {
  peran: Peran;
  awal: { jawaban: Jawaban; dilewati: string[]; langkah: string; tersimpan: boolean };
  wilayah: Wilayah[];
  spbuSaya: SpbuUmum[];
  /** Ruang kerja akun yang sedang masuk, bila ada. Hanya menentukan tautan langkah berikutnya. */
  ruangAkun: "nfr" | "tenant" | "dealer" | null;
  /** Dibuka untuk mengubah satu jawaban (dari ringkasan atau halaman hasil): setelah disimpan, kembali ke ringkasan. */
  ubah?: boolean;
}) {
  const k = kuesioner(peran);
  const router = useRouter();
  const idJudul = useId();
  const judul = useRef<HTMLHeadingElement>(null);
  const terakhir = useRef<Muatan | null>(null);
  const sudahPindah = useRef(false);

  const [jawaban, setJawaban] = useState<Jawaban>(awal.jawaban);
  const [dilewati, setDilewati] = useState<string[]>(awal.dilewati);
  const [langkah, setLangkah] = useState(awal.langkah);
  const [draf, setDraf] = useState<Record<string, unknown>>({});
  const [galat, setGalat] = useState<Galat>(TANPA_GALAT);
  const [simpan, setSimpan] = useState<{ status: "diam" | "menyimpan" | "tersimpan" | "gagal"; pesan?: string }>({ status: awal.tersimpan ? "tersimpan" : "diam" });
  const [dariRingkasan, setDariRingkasan] = useState(modeUbah && awal.langkah !== RINGKASAN);
  const [rinci, setRinci] = useState<{ id: string; urut: number; data: SpbuRinci | null | "gagal" } | null>(null);
  const [urutMuat, setUrutMuat] = useState(0);

  const aktif = langkahAktif(k, jawaban);
  const p = aktif.find((x) => x.id === langkah);
  const diRingkasan = langkah === RINGKASAN || !p;
  const nilai = p ? (p.id in draf ? draf[p.id] : jawaban[p.id]) : undefined;
  const adaDraf = Object.keys(draf).length > 0;

  // ---------------------------------------------------------------- rincian SPBU (pengelola SPBU)
  const spbu = jawaban.spbu as JawabSpbu | undefined;
  const idSpbu = spbu?.terdaftar ? spbu.id : null;
  useEffect(() => {
    if (!idSpbu) return;
    let batal = false;
    muatSpbu(idSpbu)
      .then((data) => !batal && setRinci({ id: idSpbu, urut: urutMuat, data }))
      .catch(() => !batal && setRinci({ id: idSpbu, urut: urutMuat, data: "gagal" }));
    return () => {
      batal = true;
    };
  }, [idSpbu, urutMuat]);
  const muatan: MuatanSpbu =
    !idSpbu || rinci?.id !== idSpbu || rinci.urut !== urutMuat ? { status: "memuat" } : rinci.data === "gagal" ? { status: "gagal" } : { status: "ada", spbu: rinci.data };

  // ---------------------------------------------------------------- langkah, riwayat peramban, fokus
  function pindah(tujuan: string) {
    setLangkah(tujuan);
    setGalat(TANPA_GALAT);
    sudahPindah.current = true;
    window.history.pushState(null, "", `?langkah=${tujuan}`);
  }

  const dariRiwayat = useEffectEvent(() => {
    const diminta = new URLSearchParams(window.location.search).get("langkah");
    sudahPindah.current = true;
    setLangkah(langkahTujuan(k, jawaban, dilewati, diminta));
    setGalat(TANPA_GALAT);
  });
  useEffect(() => {
    const dengar = () => dariRiwayat();
    window.addEventListener("popstate", dengar);
    return () => window.removeEventListener("popstate", dengar);
  }, []);

  // Pertanyaan baru diumumkan ke pembaca layar dan halaman kembali ke atas. Tidak saat pertama dimuat.
  useEffect(() => {
    if (!sudahPindah.current) return;
    judul.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [langkah]);

  // Peringatan sebelum meninggalkan halaman bila ada isian yang belum tersimpan.
  const perluPeringatan = adaDraf || simpan.status === "gagal";
  useEffect(() => {
    if (!perluPeringatan) return;
    const tahan = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [perluPeringatan]);

  // ---------------------------------------------------------------- simpanan
  function kirim(m: Muatan) {
    terakhir.current = m;
    setSimpan({ status: "menyimpan" });
    simpanTemukan(m)
      .then((h) => {
        if (terakhir.current !== m) return;
        setSimpan(h.ok ? { status: "tersimpan" } : { status: "gagal", pesan: h.pesan });
      })
      .catch(() => {
        if (terakhir.current === m) setSimpan({ status: "gagal", pesan: "Jawaban belum tersimpan. Periksa sambungan Anda." });
      });
  }

  function terapkan(j: Jawaban, d: string[], tujuan: string, buang?: string) {
    setJawaban(j);
    setDilewati(d);
    if (buang) setDraf((lama) => Object.fromEntries(Object.entries(lama).filter(([id]) => id !== buang)));
    if (tujuan === RINGKASAN) setDariRingkasan(false);
    kirim({ peran, langkah: tujuan === RINGKASAN ? null : tujuan, jawaban: j, dilewati: d, selesai: tujuan === RINGKASAN && intiLengkap(k, j) });
    pindah(tujuan);
  }

  /** Setelah satu langkah: berurutan pada alur biasa; dari ringkasan, langsung ke yang masih kosong atau kembali ke ringkasan. */
  function tujuanSetelah(id: string, j: Jawaban, d: string[]) {
    if (dariRingkasan) return langkahBerikut(k, j, d) ?? RINGKASAN;
    const urutan = langkahAktif(k, j);
    return urutan[urutan.findIndex((x) => x.id === id) + 1]?.id ?? RINGKASAN;
  }

  function lanjut() {
    if (!p) return;
    const h = periksa(p, nilai, jawaban);
    if (!h.ok) {
      setGalat({ pesan: h.pesan, kolom: h.kolom ?? {} });
      const pertama = h.kolom ? Object.keys(h.kolom)[0] : null;
      requestAnimationFrame(() => {
        const sasaran = pertama ? document.querySelector<HTMLElement>(`[data-kolom="${pertama}"]`) : null;
        (sasaran ?? document.getElementById(`${idJudul}-galat`))?.focus();
      });
      return;
    }
    // Dibersihkan lagi seluruhnya: jawaban cabang yang tidak lagi berlaku ikut dibuang.
    const b = bersihkan(k, { ...jawaban, [p.id]: h.nilai }, dilewati);
    terapkan(b.jawaban, b.dilewati, tujuanSetelah(p.id, b.jawaban, b.dilewati), p.id);
  }

  function lewati() {
    if (!p || p.inti) return;
    const sisa = Object.fromEntries(Object.entries(jawaban).filter(([id]) => id !== p.id)) as Jawaban;
    const b = bersihkan(k, sisa, [...dilewati, p.id]);
    terapkan(b.jawaban, b.dilewati, tujuanSetelah(p.id, b.jawaban, b.dilewati), p.id);
  }

  function lewatiSisanya() {
    const kosong = aktif.filter((x) => !x.inti && !terjawab(jawaban, x.id)).map((x) => x.id);
    const b = bersihkan(k, jawaban, [...dilewati, ...kosong]);
    setDraf({});
    terapkan(b.jawaban, b.dilewati, langkahTujuan(k, b.jawaban, b.dilewati, RINGKASAN));
  }

  function kembali() {
    const i = aktif.findIndex((x) => x.id === langkah);
    if (dariRingkasan) {
      setDariRingkasan(false);
      pindah(langkahTujuan(k, jawaban, dilewati, RINGKASAN));
    } else if (i > 0) pindah(aktif[i - 1].id);
    else router.push("/temukan");
  }

  function ubah(baru: NilaiJawab | undefined) {
    if (!p) return;
    const berubah = kunciBerubah(nilai, baru);
    setDraf((lama) => ({ ...lama, [p.id]: baru }));
    setGalat((lama) =>
      lama.pesan === null && Object.keys(lama.kolom).length === 0
        ? lama
        : { pesan: null, kolom: Object.fromEntries(Object.entries(lama.kolom).filter(([c]) => !berubah.includes(c))) },
    );
  }

  /** Pemeriksaan saat kolom ditinggalkan: hanya kolom itu, dan hanya bila memang sudah diisi salah. */
  function sentuh(kolom: string) {
    if (!p) return;
    const h = periksa(p, nilai, jawaban);
    const pesan = h.ok ? undefined : h.kolom?.[kolom];
    setGalat((lama) => {
      const sisa = Object.fromEntries(Object.entries(lama.kolom).filter(([c]) => c !== kolom));
      return { pesan: lama.pesan, kolom: pesan ? { ...sisa, [kolom]: pesan } : sisa };
    });
  }

  function mulaiLagi() {
    setJawaban({});
    setDilewati([]);
    setDraf({});
    setDariRingkasan(false);
    setSimpan({ status: "diam" });
    terakhir.current = null;
    pindah(k.pertanyaan[0].id);
  }

  // ---------------------------------------------------------------- tampilan
  // Jumlah langkah inti memakai perkiraan: pertanyaan bercabang yang belum pasti ikut dihitung sejak awal.
  const inti = intiDiperkirakan(k, jawaban);
  const tambahan = aktif.filter((x) => !x.inti);
  const lengkap = intiLengkap(k, jawaban);
  // Bilah kemajuan mengikuti pertanyaan inti, sama dengan tulisan "Langkah n dari m"; pertanyaan tambahan tidak memundurkannya.
  const intiTerjawab = inti.filter((x) => terjawab(jawaban, x.id)).length;
  const kemajuan = diRingkasan ? 1 : p?.inti ? inti.indexOf(p) / inti.length : intiTerjawab / inti.length;
  const teksLangkah = !p
    ? "Ringkasan"
    : p.inti
      ? `Langkah ${inti.indexOf(p) + 1} dari ${inti.length}`
      : `Pertanyaan tambahan ${tambahan.indexOf(p) + 1} dari ${tambahan.length}`;
  const berikutRingkasan = p ? tujuanSetelah(p.id, jawaban, dilewati) === RINGKASAN || (dariRingkasan && terjawab(jawaban, p.id)) : false;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/temukan" className="flex min-h-11 items-center gap-3 rounded-lg" aria-label="Bright Match, kembali ke halaman Temukan peluang">
            <Image src="/brand/logo-pertamina.png" alt="" width={467} height={118} className="h-4 w-auto" />
            <span className="hidden text-sm font-extrabold tracking-[-0.01em] text-ink sm:inline">Bright Match</span>
          </Link>
          <div role="status" className="flex items-center gap-2 text-sm text-muted">
            {simpan.status === "menyimpan" && (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Menyimpan…
              </>
            )}
            {simpan.status === "tersimpan" && (
              <>
                <Check aria-hidden="true" className="size-4 text-brand-green-strong" /> Tersimpan
              </>
            )}
            {simpan.status === "gagal" && (
              <>
                <CloudOff aria-hidden="true" className="size-4 text-warn" />
                <span className="text-warn">Belum tersimpan</span>
                <button
                  type="button"
                  onClick={() => terakhir.current && kirim(terakhir.current)}
                  className="-my-2 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-brand-blue-strong hover:underline"
                >
                  Simpan lagi
                </button>
              </>
            )}
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={`Kemajuan ${NAMA_PERAN[peran].singkat.toLowerCase()}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(kemajuan * 100)}
          aria-valuetext={teksLangkah}
          className="h-1 overflow-hidden bg-line"
        >
          <div className="temukan-kemajuan h-full bg-brand-blue" style={{ transform: `scaleX(${Math.max(kemajuan, 0.02)})` }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 sm:px-6 sm:pt-12">
        {simpan.status === "gagal" && simpan.pesan && (
          <p className="mb-6 rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm leading-relaxed text-warn">{simpan.pesan}</p>
        )}

        {p && !diRingkasan ? (
          <form
            key={p.id}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              lanjut();
            }}
            className="temukan-masuk flex min-h-full flex-col"
          >
            <p className="text-sm font-semibold text-brand-blue-strong">
              {teksLangkah}
              {!p.inti && <span className="font-normal text-subtle"> · boleh dilewati</span>}
            </p>
            <div role="group" aria-labelledby={idJudul} aria-describedby={p.bantu ? `${idJudul}-bantu` : undefined} className="mt-2">
              <h1 id={idJudul} ref={judul} tabIndex={-1} className="text-2xl leading-tight font-extrabold tracking-[-0.02em] temukan-judul text-ink sm:text-[2rem]">
                {p.judul}
              </h1>
              {p.bantu && (
                <p id={`${idJudul}-bantu`} className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
                  {p.bantu}
                </p>
              )}
              <div className="mt-7">
                <TampilPertanyaan
                  p={p}
                  nilai={nilai}
                  jawaban={jawaban}
                  galat={galat.kolom}
                  konteks={{ wilayah, spbuSaya, muatan, onMuatLagi: () => setUrutMuat((n) => n + 1) }}
                  onUbah={ubah}
                  onSentuh={sentuh}
                />
              </div>
            </div>

            {p.catatan && (
              <p className="mt-6 flex items-start gap-2.5 text-sm leading-relaxed text-muted">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-subtle" />
                {p.catatan}
              </p>
            )}

            {galat.pesan && (
              <p id={`${idJudul}-galat`} role="alert" tabIndex={-1} className="mt-6 rounded-lg bg-brand-red-soft px-3.5 py-2.5 text-sm font-medium text-brand-red-strong">
                {galat.pesan}
              </p>
            )}

            <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-line bg-white px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={kembali} className={sekunder}>
                  <ArrowLeft aria-hidden="true" className="size-4.5" />
                  Kembali
                </button>
                <div className="ml-auto flex items-center gap-2.5">
                  {!p.inti && (
                    <button type="button" onClick={lewati} className="inline-flex min-h-12 items-center rounded-lg px-3 text-[15px] font-semibold text-muted hover:text-ink">
                      Lewati
                    </button>
                  )}
                  <button type="submit" className={utama}>
                    {dariRingkasan ? "Simpan perubahan" : berikutRingkasan ? "Lihat ringkasan" : "Lanjut"}
                    <ArrowRight aria-hidden="true" className="size-4.5" />
                  </button>
                </div>
              </div>
            </div>
            {!p.inti && lengkap && !dariRingkasan && !berikutRingkasan && (
              <p className="mt-4 pb-6 text-sm text-muted sm:pb-0">
                Jawaban inti Anda sudah lengkap.{" "}
                <button type="button" onClick={lewatiSisanya} className="inline-flex min-h-11 items-center font-semibold text-brand-blue-strong hover:underline">
                  Lewati pertanyaan tambahan dan lihat ringkasan
                </button>
              </p>
            )}
          </form>
        ) : (
          <div key={RINGKASAN} className="temukan-masuk pb-12">
            <p className="text-sm font-semibold text-brand-blue-strong">{NAMA_PERAN[peran].singkat}</p>
            <h1 ref={judul} tabIndex={-1} className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] temukan-judul text-ink sm:text-[2rem]">
              Preferensi Anda sudah kami catat
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
              Periksa lagi ringkasannya. Syarat wajib dipakai untuk menyaring, preferensi untuk mengurutkan. Anda bisa mengubah jawaban mana pun kapan saja.
            </p>
            <div className="mt-7">
              <RingkasanPreferensi
                butir={ringkasan(k, jawaban, dilewati)}
                onUbah={(id) => {
                  setDariRingkasan(true);
                  pindah(id);
                }}
              />
            </div>

            <section aria-labelledby={`${idJudul}-lanjut`} className="mt-8 rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
              <h2 id={`${idJudul}-lanjut`} className="text-lg font-bold text-ink">
                Langkah berikutnya
              </h2>
              {lengkap ? (
                <>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">
                    {peran === "tenant"
                      ? "Lihat lokasi yang memenuhi semua syarat wajib Anda, diurutkan menurut hal yang Anda sebut penting. Tiap lokasi disertai alasan, skor kecocokan, dan keyakinan datanya."
                      : "Lihat jenis usaha yang cocok untuk ruang yang Anda pilih, beserta alasannya dan jumlah calon tenant di jaringan yang memenuhi syarat."}
                  </p>
                  <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                    {simpan.status === "menyimpan" ? (
                      // Rekomendasi dihitung dari jawaban yang tersimpan, jadi tautannya baru aktif setelah simpanan selesai.
                      <span role="status" className={`${utama} opacity-70`}>
                        <LoaderCircle aria-hidden="true" className="size-4.5 animate-spin" />
                        Menyimpan jawaban…
                      </span>
                    ) : (
                      <Link href={`/temukan/${peran}/hasil`} className={utama}>
                        {peran === "tenant" ? "Lihat lokasi yang sesuai" : "Lihat peluang untuk SPBU Anda"}
                        <ArrowRight aria-hidden="true" className="size-4.5" />
                      </Link>
                    )}
                    {ruangAkun === null ? (
                      <Link href={`/login?lanjut=/temukan/${peran}/hasil`} className={sekunder}>
                        Sudah punya akun? Masuk
                      </Link>
                    ) : ruangAkun !== "nfr" ? (
                      <Link href="/ruang-kerja" className={sekunder}>
                        Buka ruang kerja Anda
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-subtle">
                    Rekomendasi adalah bahan pertimbangan, bukan penawaran. Skor kecocokan menunjukkan kemiripan pola, bukan jaminan hasil usaha.
                    {peran === "dealer" ? " Tindakan resmi membutuhkan akun pengelola SPBU yang wewenangnya sudah dipastikan tim Non Fuel Retail." : ""}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[15px] leading-relaxed text-muted">Masih ada pertanyaan inti yang belum dijawab. Lengkapi dulu agar rekomendasi bisa disusun.</p>
              )}
            </section>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-subtle">
              <p>{simpan.status === "tersimpan" ? "Jawaban Anda tersimpan untuk peramban ini selama 30 hari." : "Jawaban Anda belum tersimpan."}</p>
              <MulaiUlang peran={peran} onSelesai={mulaiLagi} className="inline-flex min-h-11 items-center rounded-lg font-semibold text-muted hover:text-ink hover:underline" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
