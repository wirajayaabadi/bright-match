import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GarisMerek, Merek } from "@/components/brand";
import { Rangka } from "@/components/ui";
import { getHasilCalon } from "@/lib/data-tahap3";
import { daya, luas, n, rp, satu } from "@/lib/format";
import { namaJenisUsaha, POSISI, UUID } from "@/lib/istilah";
import { ATRIBUSI_LINGKUNGAN, namaTipe } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Ruang usaha yang cocok", robots: { index: false, follow: false } };

type Props = PageProps<"/daftar/[token]">;

const T = {
  id: {
    terima: "Terima kasih",
    diterima: "Pendaftaran Anda sudah kami terima. Tim Non Fuel Retail Pertamina akan menghubungi Anda.",
    minat: (j: number) => `${n(j)} lokasi yang Anda tandai sudah kami teruskan ke tim Non Fuel Retail sebagai minat Anda. Minat tidak mengikat dan belum menjadi penawaran.`,
    kebutuhan: "Kebutuhan yang Anda sampaikan",
    cocok: "Ruang usaha yang cocok",
    ada: (j: number, t: number) => `${n(t)} teratas dari ${n(j)} ruang usaha kosong yang memenuhi kebutuhan Anda.`,
    kosong: "Belum ada ruang usaha kosong yang memenuhi semua kebutuhan Anda. Tim kami akan mencarikan pilihan lain.",
    lahan: "Kode ruang",
    kota: "Kota",
    luasK: "Luas",
    posisiK: "Posisi",
    dayaK: "Daya",
    sewa: "Sewa/tahun",
    lokasi: "Tipe lokasi",
    skor: "Kecocokan",
    simpan: "Simpan alamat halaman ini bila ingin melihatnya lagi.",
    tidakAda: "Halaman ini tidak ditemukan",
    tidakAdaIsi: "Tautannya mungkin salah. Anda bisa mengisi formulir lagi.",
    isiLagi: "Isi formulir",
    semua: "Semua provinsi",
    bebas: "tanpa batas",
  },
  en: {
    terima: "Thank you",
    diterima: "We have received your registration. The Pertamina Non Fuel Retail team will contact you.",
    minat: (j: number) => `The ${n(j)} location(s) you marked have been passed to the Non Fuel Retail team as your expression of interest. This is not binding and is not an offer.`,
    kebutuhan: "What you told us",
    cocok: "Matching retail spaces",
    ada: (j: number, t: number) => `Top ${n(t)} of ${n(j)} vacant spaces that meet your requirements.`,
    kosong: "No vacant space meets all your requirements yet. Our team will look for other options.",
    lahan: "Space code",
    kota: "City",
    luasK: "Area",
    posisiK: "Position",
    dayaK: "Power",
    sewa: "Rent/year",
    lokasi: "Location type",
    skor: "Match",
    simpan: "Save this page address if you want to return to it.",
    tidakAda: "Page not found",
    tidakAdaIsi: "The link may be wrong. You can fill in the form again.",
    isiLagi: "Open the form",
    semua: "Any province",
    bebas: "no limit",
  },
} as const;

/** Hasil pendaftaran: ringkasan kebutuhan dan lahan kosong yang cocok. Dibuka dengan token, tanpa login. */
export default function HalamanHasil({ params, searchParams }: Props) {
  return (
    <main className="px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <GarisMerek className="rounded-none" />
        <div className="p-6 sm:p-10">
          <Merek />
          <Suspense fallback={<div className="mt-8"><Rangka baris={4} /></div>}>
            <Isi params={params} searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
      <p className="mx-auto mt-5 max-w-4xl text-center text-xs leading-relaxed text-subtle">{ATRIBUSI_LINGKUNGAN}</p>
    </main>
  );
}

async function Isi({ params, searchParams }: Props) {
  const [{ token }, cari] = await Promise.all([params, searchParams]);
  // Jumlah lokasi yang baru saja diteruskan dari Temukan peluang. Hanya keterangan di layar.
  const minat = Number(satu(cari.minat));
  const hasil = UUID.test(token) ? await getHasilCalon(token) : null;
  const h = hasil && !hasil.galat ? hasil.data : null;

  if (!h) {
    return (
      <div className="mt-8">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">{T.id.tidakAda}</h1>
        <p className="mt-2 text-[15px] text-muted">{T.id.tidakAdaIsi}</p>
        <Link href="/daftar" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white hover:bg-brand-blue-strong">
          {T.id.isiLagi}
        </Link>
      </div>
    );
  }

  const b = h.calon.bahasa === "en" ? "en" : "id";
  const t = T[b];
  const c = h.calon;
  const rentang =
    c.luas_min != null || c.luas_maks != null
      ? `${c.luas_min != null ? luas(c.luas_min) : "0 m²"} – ${c.luas_maks != null ? luas(c.luas_maks) : t.bebas}`
      : "–";

  return (
    <div lang={b}>
      <h1 className="mt-8 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
        {t.terima}, {c.nama_usaha}
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{t.diterima}</p>
      {Number.isInteger(minat) && minat >= 1 && minat <= 10 && (
        <p role="status" className="mt-4 max-w-2xl rounded-lg bg-brand-green-soft px-3.5 py-2.5 text-sm leading-relaxed text-brand-green-strong">
          {t.minat(minat)}
        </p>
      )}

      <h2 className="mt-8 text-lg font-bold text-ink">{t.kebutuhan}</h2>
      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {[
          [namaJenisUsaha(c.segmen, b), ""],
          [t.luasK, rentang],
          [t.posisiK, POSISI[c.posisi][b]],
          [t.sewa, c.anggaran_tahunan != null ? `≤ ${rp(c.anggaran_tahunan)}` : "–"],
          ["Provinsi", c.provinsi_minat.length > 0 ? c.provinsi_minat.join(", ") : t.semua],
        ].map(([nama, nilai]) => (
          <div key={nama} className="flex items-baseline justify-between gap-4 border-b border-line py-1.5">
            <dt className="text-muted">{nama}</dt>
            <dd className="angka text-right font-semibold text-ink">{nilai}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 text-lg font-bold text-ink">{t.cocok}</h2>
      {h.lahan.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{t.kosong}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{t.ada(h.jumlah, h.lahan.length)}</p>
          <div className="relative mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold tracking-wide whitespace-nowrap text-subtle uppercase">
                  <th scope="col" className="px-3 py-2.5">{t.lahan}</th>
                  <th scope="col" className="px-3 py-2.5">{t.kota}</th>
                  <th scope="col" className="px-3 py-2.5 text-right">{t.luasK}</th>
                  <th scope="col" className="px-3 py-2.5">{t.posisiK}</th>
                  <th scope="col" className="px-3 py-2.5 text-right">{t.dayaK}</th>
                  <th scope="col" className="px-3 py-2.5 text-right">{t.sewa}</th>
                  <th scope="col" className="px-3 py-2.5">{t.lokasi}</th>
                  <th scope="col" className="px-3 py-2.5 text-right">{t.skor}</th>
                </tr>
              </thead>
              <tbody>
                {h.lahan.map((l) => (
                  <tr key={l.kode} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-3 py-2.5 text-left font-semibold whitespace-nowrap text-ink">
                      {l.kode}
                      <span className="block text-xs font-normal text-subtle">SPBU {l.spbu_nomor}</span>
                    </th>
                    <td className="px-3 py-2.5 text-muted">
                      {l.kota ?? "–"}
                      <span className="block text-xs text-subtle">{l.provinsi}</span>
                    </td>
                    <td className="angka px-3 py-2.5 text-right whitespace-nowrap text-muted">{luas(l.luas_m2)}</td>
                    <td className="px-3 py-2.5 text-muted">{l.posisi === "Diluar Bangunan" ? POSISI.luar[b] : POSISI.dalam[b]}</td>
                    <td className="angka px-3 py-2.5 text-right whitespace-nowrap text-muted">{daya(l.daya_w)}</td>
                    <td className="angka px-3 py-2.5 text-right font-semibold whitespace-nowrap text-ink">
                      {l.tarif_tahunan != null ? rp(l.tarif_tahunan) : "–"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{namaTipe(l.tipe_lokasi)}</td>
                    <td className="angka px-3 py-2.5 text-right font-bold text-brand-blue-strong">{l.skor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-6 text-xs leading-relaxed text-subtle">{t.simpan}</p>
    </div>
  );
}
