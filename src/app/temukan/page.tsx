import { BriefcaseBusiness, Database, ListChecks, type LucideIcon, ShieldCheck, Store } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { GarisMerek } from "@/components/brand";
import KartuPeran from "@/components/temukan/kartu-peran";
import Lanjutkan from "@/components/temukan/lanjutkan";
import TombolAkun from "@/components/temukan/tombol-akun";
import { langkahAktif, terjawab } from "@/lib/temukan/cabang";
import { kuesioner } from "@/lib/temukan/kuesioner";
import { bacaSesi } from "@/lib/temukan/sesi";
import { ATRIBUSI_LINGKUNGAN } from "@/lib/tipe-lokasi";

export const metadata: Metadata = {
  title: "Temukan peluang",
  description: "Bright Match membantu Anda menemukan lokasi usaha atau mitra bisnis yang sesuai melalui rekomendasi berbasis data.",
};

const LANGKAH = [
  { judul: "Pilih peran Anda", isi: "Mencari lokasi usaha, atau mengembangkan ruang di SPBU yang Anda kelola." },
  { judul: "Ceritakan kebutuhan Anda", isi: "Lima pertanyaan inti. Pertanyaan tambahan boleh dilewati, dan jawaban bisa diubah kapan saja." },
  { judul: "Lihat yang cocok", isi: "Tiap saran disertai alasannya, sumber datanya, dan seberapa yakin datanya." },
  { judul: "Tindak lanjuti", isi: "Nyatakan minat tanpa terikat. Penawaran resmi selalu melalui tim Non Fuel Retail Pertamina." },
];

const DASAR: { ikon: LucideIcon; judul: string; isi: string }[] = [
  { ikon: Database, judul: "Data ruang dari Brightspace", isi: "Ruang usaha yang tampil berasal dari daftar ruang di SPBU Pertamina, bukan contoh buatan." },
  { ikon: ListChecks, judul: "Alasan di balik tiap saran", isi: "Skor menunjukkan kemiripan dengan pola yang sudah ada di jaringan SPBU. Skor bukan jaminan hasil usaha." },
  { ikon: ShieldCheck, judul: "Keputusan tetap di tangan Anda", isi: "Memilih peran di sini tidak memberi hak apa pun. Tindakan resmi membutuhkan akun dan wewenang yang sudah dipastikan." },
];

async function SesiTersimpan() {
  const sesi = (await bacaSesi()).map((s) => {
    const inti = langkahAktif(kuesioner(s.peran), s.jawaban).filter((p) => p.inti);
    const dijawab = inti.filter((p) => terjawab(s.jawaban, p.id)).length;
    // "Selesai" di sini berarti semua pertanyaan inti terjawab: itulah syarat rekomendasi bisa disusun.
    return { peran: s.peran, selesai: dijawab === inti.length, terjawab: dijawab, jumlah: inti.length };
  });
  return sesi.length > 0 ? <Lanjutkan sesi={sesi} /> : null;
}

/** Halaman depan Temukan peluang. Pola: halaman pemasaran (beranda), bukan halaman aplikasi. */
export default function HalamanTemukan() {
  return (
    <div className="flex min-h-svh flex-col bg-white">
      <GarisMerek className="rounded-none" />
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/temukan" className="flex min-h-11 items-center gap-3 rounded-lg" aria-label="Bright Match">
            <Image src="/brand/logo-pertamina.png" alt="Pertamina" width={467} height={118} priority className="h-5 w-auto" />
            <span className="border-l border-line pl-3 text-[15px] font-extrabold tracking-[-0.01em] whitespace-nowrap text-ink">Bright Match</span>
          </Link>
          <Suspense fallback={<span className="h-11 w-20" />}>
            <TombolAkun />
          </Suspense>
        </div>
      </header>

      <main id="konten" className="flex-1">
        <section className="bg-canvas px-4 pt-12 pb-14 sm:px-8 sm:pt-20 sm:pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Bright Partner</p>
              <h1 className="mt-3 text-[2rem] leading-[1.15] font-extrabold tracking-[-0.025em] text-balance text-ink sm:text-5xl">
                Temukan peluang bisnis yang tepat untuk Anda
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-pretty text-muted sm:text-lg">
                Bright Match membantu Anda menemukan lokasi usaha atau mitra bisnis yang sesuai melalui rekomendasi berbasis data.
              </p>
            </div>

            <Suspense fallback={null}>
              <SesiTersimpan />
            </Suspense>

            <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-2">
              <KartuPeran
                href="/temukan/tenant"
                ikon={BriefcaseBusiness}
                warna="biru"
                judul="Saya mencari lokasi usaha"
                keterangan="Temukan lokasi SPBU yang sesuai dengan kebutuhan, target pasar, dan rencana ekspansi bisnis Anda."
                butir={["Jenis usaha dan wilayah tujuan", "Anggaran sewa dan kebutuhan ruang", "Prioritas Anda dalam memilih lokasi"]}
                tombol="Cari lokasi"
              />
              <KartuPeran
                href="/temukan/dealer"
                ikon={Store}
                warna="hijau"
                judul="Saya mengelola SPBU"
                keterangan="Temukan jenis usaha dan calon mitra yang berpotensi meningkatkan produktivitas ruang komersial SPBU Anda."
                butir={["SPBU dan ruang usaha yang ingin dikembangkan", "Tujuan dan jenis usaha yang diinginkan", "Prioritas Anda dalam memilih tenant"]}
                tombol="Temukan peluang"
              />
            </div>
            <p className="mt-6 text-center text-sm text-subtle">Tanpa akun untuk memulai. Jawaban Anda bisa diubah atau dihapus kapan saja.</p>
          </div>
        </section>

        <section aria-labelledby="cara-kerja" className="border-t border-line px-4 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 id="cara-kerja" className="text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
              Cara kerjanya
            </h2>
            <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {LANGKAH.map((l, i) => (
                <li key={l.judul} className="border-t-2 border-ink pt-4">
                  <p className="angka text-sm font-bold text-brand-blue-strong">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 text-lg font-bold text-ink">{l.judul}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{l.isi}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="dasar" className="border-t border-line bg-canvas px-4 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 id="dasar" className="max-w-2xl text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
              Rekomendasi yang bisa Anda periksa sendiri
            </h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {DASAR.map((d) => (
                <div key={d.judul} className="rounded-xl border border-line bg-white p-6">
                  <d.ikon aria-hidden="true" strokeWidth={1.75} className="size-6 text-brand-blue-strong" />
                  <h3 className="mt-4 text-base font-bold text-ink">{d.judul}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{d.isi}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="mulai" className="border-t border-line px-4 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="mulai" className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
                Mulai dari kebutuhan Anda
              </h2>
              <p className="mt-1.5 text-[15px] text-muted">Pilih yang paling menggambarkan Anda.</p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Link href="/temukan/tenant" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong">
                Cari lokasi usaha
              </Link>
              <Link href="/temukan/dealer" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line bg-white px-5 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-brand-blue/60">
                Temukan peluang untuk SPBU
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-canvas px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-2 text-xs leading-relaxed text-subtle">
          <p>
            Jawaban Anda hanya dipakai untuk menyusun rekomendasi dan disimpan paling lama 30 hari sejak terakhir diubah. Data kontak baru diminta saat Anda
            mendaftar sebagai Bright Partner.
          </p>
          <p>{ATRIBUSI_LINGKUNGAN}</p>
          <p>Bright Match · Non Fuel Retail Pertamina · Growing Together, Beyond Fuel</p>
        </div>
      </footer>
    </div>
  );
}
