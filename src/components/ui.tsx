import Link from "next/link";
import { modulDariSlug } from "@/lib/modules";

export function JudulHalaman({
  label,
  judul,
  keterangan,
}: {
  label: string;
  judul: string;
  keterangan?: string;
}) {
  return (
    <header className="mb-8">
      <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">{label}</p>
      <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">{judul}</h1>
      {keterangan && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{keterangan}</p>}
    </header>
  );
}

export function KartuAngka({ label, nilai, catatan }: { label: string; nilai: string; catatan?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-card">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="angka mt-2 text-3xl leading-none font-extrabold tracking-[-0.02em] text-ink">{nilai}</dd>
      {catatan && <dd className="mt-2 text-xs leading-relaxed text-subtle">{catatan}</dd>}
    </div>
  );
}

/** Kerangka abu-abu selama data dimuat. */
export function Rangka({ baris = 4 }: { baris?: number }) {
  return (
    <div role="status" aria-label="Memuat data" className="animate-pulse space-y-3">
      {Array.from({ length: baris }, (_, i) => (
        <div key={i} className="h-16 rounded-xl bg-line/60" />
      ))}
    </div>
  );
}

/** Isi halaman untuk modul yang belum dibangun. */
export function ModulSegera({ slug }: { slug: string }) {
  const m = modulDariSlug(slug);
  if (!m) return null;

  return (
    <>
      <JudulHalaman label={`Tahap ${m.tahap}`} judul={m.nama} keterangan={m.ringkas} />
      <section className="max-w-2xl rounded-xl border border-line bg-white p-6 shadow-card">
        <h2 className="text-base font-bold text-ink">Yang akan ada di modul ini</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
          {m.isi.map((butir) => (
            <li key={butir}>{butir}</li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-subtle">
          Modul ini belum dibangun. Datanya sudah tersedia di basis data; lihat{" "}
          <Link href="/peluang" className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
            Peta peluang
          </Link>{" "}
          untuk modul yang sudah berjalan.
        </p>
      </section>
    </>
  );
}

/** Pesan "tidak ditemukan" yang bisa dipakai langsung di dalam halaman maupun oleh not-found.tsx. */
export function TidakDitemukan({ apa = "Halaman ini" }: { apa?: string }) {
  return (
    <>
      <JudulHalaman
        label="Tidak ditemukan"
        judul={`${apa} tidak ada`}
        keterangan="Alamatnya mungkin salah ketik, atau datanya sudah tidak ada di basis data."
      />
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white transition-colors hover:bg-brand-blue-strong"
      >
        Kembali ke beranda
      </Link>
    </>
  );
}
