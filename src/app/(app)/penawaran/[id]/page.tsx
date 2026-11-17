import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { GarisMerek } from "@/components/brand";
import Galeri from "@/components/galeri";
import PanelGalat from "@/components/panel-galat";
import PeringatanData from "@/components/peringatan-data";
import { Jejak } from "@/components/tabel";
import TombolCetak from "@/components/tombol-cetak";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getGambarLahan } from "@/lib/data-gambar";
import { getPenawaran } from "@/lib/data-tahap3";
import { alamat, n, rp, satu } from "@/lib/format";
import { type Bahasa, namaJenisUsaha, UUID } from "@/lib/istilah";
import { alasan, alasanEn } from "@/lib/kecocokan";
import { artiTipe, namaTipe, TIPE_LOKASI_EN } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Kartu penawaran" };

type Props = PageProps<"/penawaran/[id]">;

const T = {
  id: {
    judul: "Penawaran ruang usaha",
    untuk: "Disiapkan untuk",
    ruang: "Ruang yang ditawarkan",
    kode: "Kode ruang",
    luasK: "Luas",
    dimensi: "Dimensi (panjang × lebar × tinggi)",
    posisi: "Posisi",
    dayaK: "Daya listrik tersedia",
    sewa: "Sewa",
    perTahun: "per tahun",
    perBulan: "Setara per bulan",
    perM2: "Per m² per tahun",
    sewaKosong: "Tarif belum tercantum. Hubungi tim Non Fuel Retail untuk penawaran harga.",
    skema: "Skema lain, seperti bagi hasil atau masa perkenalan, dibahas bersama tim Non Fuel Retail.",
    lokasi: "Lokasi",
    tipe: "Tipe lokasi",
    penduduk: "Penduduk dalam 3 km",
    tempat: "Tempat usaha dalam 1 km",
    terdekat: "Tempat penting terdekat",
    spbu: "Tentang SPBU ini",
    fasilitas: "Fasilitas",
    fasilitasKosong: "Belum tercatat",
    usaha: "Usaha yang sudah ada",
    usahaKosong: "Belum ada",
    ruangUsaha: "Ruang usaha",
    terisi: (a: string, b: string) => `${a} dari ${b} terisi`,
    cocok: "Mengapa cocok",
    skor: "Skor kecocokan",
    tidakLolos: "Pasangan ini tidak memenuhi salah satu syarat wajib (luas, posisi, daya, tarif, atau wilayah), jadi alasan kecocokannya tidak ditampilkan.",
    kontak: "Tim Non Fuel Retail Pertamina",
    catatan: "Penawaran ini tidak mengikat. Ketersediaan dan tarif mengikuti data Brightspace per 14 November 2026.",
    sumber: "Data lingkungan: Overture Maps Foundation dan WorldPop (CC BY 4.0).",
    cetak: "Cetak atau simpan PDF",
    dalam: "Di dalam bangunan",
    luar: "Di luar bangunan",
    rb: "rb",
  },
  en: {
    judul: "Retail space offer",
    untuk: "Prepared for",
    ruang: "The space",
    kode: "Space code",
    luasK: "Area",
    dimensi: "Dimensions (length × width × height)",
    posisi: "Position",
    dayaK: "Power supply available",
    sewa: "Rent",
    perTahun: "per year",
    perBulan: "Monthly equivalent",
    perM2: "Per m² per year",
    sewaKosong: "Rent is not listed yet. Contact the Non Fuel Retail team for a quotation.",
    skema: "Other schemes, such as revenue sharing or an introductory period, are discussed with the Non Fuel Retail team.",
    lokasi: "Location",
    tipe: "Location type",
    penduduk: "Residents within 3 km",
    tempat: "Businesses within 1 km",
    terdekat: "Nearby landmarks",
    spbu: "About this station",
    fasilitas: "Facilities",
    fasilitasKosong: "Not recorded",
    usaha: "Existing businesses",
    usahaKosong: "None yet",
    ruangUsaha: "Retail spaces",
    terisi: (a: string, b: string) => `${a} of ${b} occupied`,
    cocok: "Why it fits",
    skor: "Match score",
    tidakLolos: "This pair does not meet one of the mandatory requirements (area, position, power, rent or region), so no match reasons are shown.",
    kontak: "Pertamina Non Fuel Retail team",
    catatan: "This offer is not binding. Availability and rent follow Brightspace data as of 14 November 2026.",
    sumber: "Neighbourhood data: Overture Maps Foundation and WorldPop (CC BY 4.0).",
    cetak: "Print or save as PDF",
    dalam: "Indoor",
    luar: "Outdoor",
    rb: "k",
  },
} as const;

const JENIS_POI_EN: Record<string, string> = {
  Kampus: "University", Mal: "Mall", "Rumah sakit": "Hospital", Hotel: "Hotel", Stasiun: "Station", Bandara: "Airport",
  "Kantor pemerintah": "Government office", Perkantoran: "Office", SMA: "High school", Toserba: "Department store",
  Pasar: "Market", "Terminal / halte": "Transit stop", Stadion: "Stadium", Pabrik: "Factory", "Taman hiburan": "Amusement park",
};

export default function KartuPenawaran({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Isi({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const b: Bahasa = satu(sp.bahasa) === "en" ? "en" : "id";
  const calon = satu(sp.calon);
  const tenant = satu(sp.tenant);
  const [hasil, hasilFoto] = await Promise.all([
    getPenawaran(id, { tenant, calon: calon && UUID.test(calon) ? calon : undefined }),
    getGambarLahan(id),
  ]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Lahan kosong ini" />;

  const t = T[b];
  // Kartu berbahasa Inggris memakai format angka dan rupiah yang lazim bagi pembaca asing.
  const en = b === "en";
  const angka = (v: number) => (en ? new Intl.NumberFormat("en-US").format(v) : n(v));
  const uang = (v: number) => {
    if (!en) return rp(v);
    if (v >= 1e9) return `IDR ${(v / 1e9).toFixed(1)} billion`;
    if (v >= 1e6) return `IDR ${(v / 1e6).toFixed(1)} million`;
    return `IDR ${angka(Math.round(v))}`;
  };
  const luas = (v: number | null) => (v == null ? "–" : `${angka(v)} m²`);
  const daya = (v: number | null) => (v == null ? "–" : `${angka(v)} W`);
  const { lahan: l, spbu, ringkasan, jenis_usaha_ada: usaha, lingkungan: lk, poi, pihak, nama_pihak: namaPihak } = hasil.data;
  // Tiga foto di kartu: foto lahan dulu, lalu foto SPBU bila masih ada tempat. Sisanya bisa dibuka dari petak terakhir.
  const foto = [...(hasilFoto.data?.lahan ?? []), ...(hasilFoto.data?.spbu ?? [])];
  const ke = (bahasa: Bahasa) => alamat(`/penawaran/${l.lahan_id}`, { bahasa: bahasa === "en" ? "en" : undefined, calon, tenant });
  const dimensi = [l.panjang_m, l.lebar_m, l.tinggi_m].every((v) => v != null)
    ? [l.panjang_m, l.lebar_m, l.tinggi_m].map((v) => (en ? String(v) : String(v).replace(".", ","))).join(" × ") + " m"
    : "–";
  const tipeNama = lk ? (b === "en" ? TIPE_LOKASI_EN[lk.tipe_lokasi].nama : namaTipe(lk.tipe_lokasi)) : null;
  const tipeArti = lk ? (b === "en" ? TIPE_LOKASI_EN[lk.tipe_lokasi].arti : artiTipe(lk.tipe_lokasi)) : null;
  const butirCocok = pihak
    ? b === "en"
      ? alasanEn(pihak, namaJenisUsaha(pihak.segmen, "en"), tipeNama)
      : alasan(pihak)
    : [];

  return (
    <>
      <div className="tidak-cetak">
        <Jejak induk={[{ href: "/penawaran", nama: "Kartu penawaran" }]} kini={l.kode} />
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Bahasa kartu" className="inline-flex rounded-lg border border-line bg-white p-1 text-sm">
            {(["id", "en"] as const).map((x) => (
              <Link
                key={x}
                href={ke(x)}
                aria-current={b === x ? "true" : undefined}
                className={`rounded-md px-3 py-1.5 font-semibold ${b === x ? "bg-brand-blue text-white" : "text-muted hover:text-ink"}`}
              >
                {x === "id" ? "Bahasa Indonesia" : "English"}
              </Link>
            ))}
          </div>
          <TombolCetak label={T.id.cetak} />
          <Link href={`/kecocokan/lahan/${l.lahan_id}`} className="text-sm font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
            Kartu rekomendasi lahan
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-3xl">
        <Suspense fallback={null}>
          <PeringatanData lahanId={l.lahan_id} />
        </Suspense>
      </div>

      <article lang={b} className="kartu-cetak mx-auto max-w-3xl overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <GarisMerek className="rounded-none" />
        <div className="p-6 sm:p-9">
          <Suspense fallback={null}>
            <PeringatanData lahanId={l.lahan_id} cetak />
          </Suspense>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Image src="/brand/logo-pertamina.png" alt="Pertamina" width={467} height={118} className="h-6 w-auto" />
              <p className="mt-3 text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Bright Partner · {t.judul}</p>
            </div>
            <p className="angka text-right text-xs text-subtle">
              {l.kode}
              <br />
              SPBU {spbu.nomor}
            </p>
          </header>

          <h1 className="mt-5 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
            {luas(l.luas_m2)} · SPBU {spbu.nomor}, {spbu.kota ?? spbu.provinsi}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{spbu.alamat ?? `${spbu.kota ?? ""}, ${spbu.provinsi}`}</p>
          {namaPihak && (
            <p className="mt-3 inline-block rounded-lg bg-brand-blue-soft px-3 py-1.5 text-sm text-brand-blue-strong">
              {t.untuk} <strong>{namaPihak}</strong>
            </p>
          )}

          {foto.length > 0 && (
            <div className="mt-6">
              <Galeri gambar={foto} subjek={`${l.kode}, SPBU ${spbu.nomor}`} maks={3} segera kisi="grid-cols-3" />
            </div>
          )}

          <div className="mt-7 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            <section>
              <h2 className="text-sm font-bold tracking-wide text-ink uppercase">{t.ruang}</h2>
              <dl className="mt-2 text-sm">
                <Baris nama={t.kode} nilai={l.kode} />
                <Baris nama={t.luasK} nilai={luas(l.luas_m2)} />
                <Baris nama={t.dimensi} nilai={dimensi} />
                <Baris nama={t.posisi} nilai={`${l.posisi === "Diluar Bangunan" ? t.luar : t.dalam}${l.lantai ? ` · ${en ? l.lantai.replace("Lantai", "Floor") : l.lantai}` : ""}`} />
                <Baris nama={t.dayaK} nilai={daya(l.daya_w)} />
              </dl>
            </section>

            <section>
              <h2 className="text-sm font-bold tracking-wide text-ink uppercase">{t.sewa}</h2>
              {l.tarif_tahunan != null ? (
                <>
                  <p className="angka mt-2 text-3xl leading-none font-extrabold text-ink">
                    {uang(l.tarif_tahunan)} <span className="text-sm font-medium text-muted">{t.perTahun}</span>
                  </p>
                  <dl className="mt-3 text-sm">
                    <Baris nama={t.perBulan} nilai={uang(l.tarif_tahunan / 12)} />
                    {l.luas_m2 != null && l.luas_m2 > 0 && <Baris nama={t.perM2} nilai={uang(l.tarif_tahunan / l.luas_m2)} />}
                  </dl>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.sewaKosong}</p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-subtle">{t.skema}</p>
            </section>

            <section>
              <h2 className="text-sm font-bold tracking-wide text-ink uppercase">{t.lokasi}</h2>
              {lk ? (
                <>
                  <dl className="mt-2 text-sm">
                    <Baris nama={t.tipe} nilai={tipeNama ?? "–"} />
                    <Baris nama={t.penduduk} nilai={en ? angka(Math.round(lk.penduduk_3km / 1000) * 1000) : `${n(Math.round(lk.penduduk_3km / 1000))} ${t.rb}`} />
                    <Baris nama={t.tempat} nilai={angka(lk.poi_1km)} />
                  </dl>
                  <p className="mt-2 text-xs leading-relaxed text-subtle">{tipeArti}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">{spbu.kota ?? spbu.provinsi}</p>
              )}
              {poi.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold tracking-wide text-subtle uppercase">{t.terdekat}</h3>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {poi.slice(0, 5).map((p) => (
                      <li key={`${p.nama}-${p.jarak_m}`} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-ink">
                          {p.nama} <span className="text-xs text-subtle">· {b === "en" ? (JENIS_POI_EN[p.jenis] ?? p.jenis) : p.jenis}</span>
                        </span>
                        <span className="angka shrink-0 text-xs text-subtle">{angka(p.jarak_m)} m</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold tracking-wide text-ink uppercase">{t.spbu}</h2>
              <dl className="mt-2 text-sm">
                <Baris nama={t.ruangUsaha} nilai={t.terisi(angka(ringkasan.lahan_tersewa), angka(ringkasan.lahan))} />
                <Baris nama={t.fasilitas} nilai={spbu.fasilitas.length > 0 ? spbu.fasilitas.join(", ") : t.fasilitasKosong} />
                <Baris
                  nama={t.usaha}
                  nilai={usaha.length > 0 ? usaha.map((u) => namaJenisUsaha(u, b)).join(", ") : t.usahaKosong}
                />
              </dl>
            </section>
          </div>

          {(pihak || namaPihak) && (
            <section className="mt-7 border-t border-line pt-6">
              <h2 className="text-sm font-bold tracking-wide text-ink uppercase">
                {t.cocok}
                {namaPihak ? ` · ${namaPihak}` : ""}
              </h2>
              {pihak ? (
                <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5">
                  <p className="text-center">
                    <span className="angka block text-4xl leading-none font-extrabold text-brand-blue-strong">{pihak.skor}</span>
                    <span className="mt-1 block text-[11px] text-subtle">{t.skor}</span>
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
                    {butirCocok.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.tidakLolos}</p>
              )}
            </section>
          )}

          <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
            <p className="font-semibold text-muted">{t.kontak}</p>
            <p className="mt-1">{t.catatan}</p>
            {lk && <p>{t.sumber}</p>}
          </footer>
        </div>
      </article>
    </>
  );
}

function Baris({ nama, nilai }: { nama: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5">
      <dt className="text-muted">{nama}</dt>
      <dd className="angka text-right font-semibold text-ink">{nilai}</dd>
    </div>
  );
}
