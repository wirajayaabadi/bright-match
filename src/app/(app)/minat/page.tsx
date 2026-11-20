import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TindakMinat } from "@/components/jelajah";
import PanelGalat from "@/components/panel-galat";
import { Lencana, tautan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getMinat } from "@/lib/data-jelajah";
import { getProfilSaya } from "@/lib/data-validasi";
import { alamat, luas, n, satu, tanggal } from "@/lib/format";
import { namaJenisUsaha } from "@/lib/istilah";
import { STATUS_MINAT, SUMBER_MINAT } from "@/lib/jelajah";
import { bolehUbah } from "@/lib/validasi";

export const metadata: Metadata = { title: "Minat lokasi" };

type Props = PageProps<"/minat">;

const SARING = [
  { nilai: "baru", nama: "Baru" },
  { nilai: "ditindaklanjuti", nama: "Sedang ditindaklanjuti" },
  { nilai: "ditutup", nama: "Ditutup" },
] as const;

// Pola halaman: Inbox. Minat dari penjelajah lokasi, rekomendasi Temukan peluang, formulir Bright Partner, dan
// pengelola SPBU, yang terbaru di atas, untuk ditindaklanjuti tim NFR.
export default function MinatHalaman({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Portal tenant"
        judul="Minat lokasi"
        keterangan="Ruang yang diminati tenant, calon tenant, atau pengelola SPBU. Minat tidak mengikat dan belum menjadi peluang; tindak lanjuti dengan menghubungi peminatnya, lalu buat peluangnya dari kartu lahan atau halaman calon tenant."
      />
      <Suspense fallback={<Rangka baris={5} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const status = SARING.find((s) => s.nilai === satu(sp.status))?.nilai ?? "baru";
  const [hasil, profil] = await Promise.all([getMinat(status), getProfilSaya()]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const daftar = hasil.data ?? [];
  const ubah = bolehUbah(profil.data);

  return (
    <div className="max-w-4xl">
      <nav aria-label="Saringan status" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {SARING.map((s) => (
          <Link
            key={s.nilai}
            href={alamat("/minat", { status: s.nilai === "baru" ? undefined : s.nilai })}
            aria-current={status === s.nilai ? "page" : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap ${
              status === s.nilai ? "border-brand-blue font-semibold text-brand-blue-strong" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {s.nama}
          </Link>
        ))}
      </nav>

      {daftar.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
          <h2 className="text-base font-bold text-ink">
            {status === "baru" ? "Belum ada minat baru" : status === "ditindaklanjuti" ? "Tidak ada minat yang sedang ditindaklanjuti" : "Belum ada minat yang ditutup"}
          </h2>
          <p className="mt-2">
            Minat masuk dari empat arah: tenant yang penjelajah lokasinya dibuka admin NFR, tenant yang menyatakan minat dari rekomendasinya, calon tenant yang
            menandai lokasi lalu mendaftar sebagai Bright Partner, dan pengelola SPBU yang ingin menghadirkan satu jenis usaha.
          </p>
          <Link href="/organisasi" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle">
            Buka Organisasi dan anggota
          </Link>
        </section>
      ) : (
        <>
          <p className="angka mb-3 text-sm text-muted">{n(daftar.length)} minat</p>
          <ul className="grid gap-3">
            {daftar.map((m) => (
              <li key={m.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-base font-bold text-ink">{m.organisasi}</span>
                  {m.demo && <Lencana warna="kuning">Organisasi uji</Lencana>}
                  <Lencana warna={STATUS_MINAT[m.status].warna}>{STATUS_MINAT[m.status].nama}</Lencana>
                </p>
                <p className="mt-0.5 text-xs font-semibold text-subtle">{SUMBER_MINAT[m.sumber] ?? m.sumber}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {m.segmen ? (
                    <>
                      Ingin menghadirkan <strong className="text-ink">{namaJenisUsaha(m.segmen).toLowerCase()}</strong> di ruang{" "}
                    </>
                  ) : (
                    "Meminati ruang "
                  )}
                  <strong className="text-ink">{m.lahan_kode}</strong>
                  {m.luas_m2 != null ? ` (${luas(m.luas_m2)})` : ""} di SPBU {m.spbu_nomor}
                  {m.kota ? `, ${m.kota}` : ""}. Dikirim {tanggal(m.dibuat)} oleh {m.dibuat_oleh === "publik" ? "pendaftar formulir" : (m.dibuat_oleh ?? "–")}.
                </p>
                {m.catatan && <p className="mt-2 text-sm leading-relaxed text-ink">Catatan peminat: {m.catatan}</p>}
                {m.potret && (m.potret.skor != null || m.potret.preferensi != null) && (
                  <p className="angka mt-2 text-sm leading-relaxed text-muted">
                    Rekomendasi yang dilihat peminat saat itu:{" "}
                    {[m.potret.skor != null ? `kecocokan ${m.potret.skor}` : null, m.potret.preferensi != null ? `kesesuaian preferensi ${m.potret.preferensi}` : null]
                      .filter(Boolean)
                      .join(", ")}
                    . Ini keterangan dari layar peminat, bukan skor resmi; skor resmi dihitung saat peluang dibuat.
                  </p>
                )}
                {m.ditangani && (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {m.status === "ditutup" ? "Ditutup" : "Ditandai ditindaklanjuti"} {tanggal(m.ditangani)} oleh {m.ditangani_oleh ?? "–"}
                    {m.catatan_nfr ? `: ${m.catatan_nfr}` : "."}
                  </p>
                )}
                <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <Link href={`/kecocokan/lahan/${m.lahan_id}`} className={`${tautan} inline-flex min-h-11 items-center`}>
                    Buka kartu lahan
                  </Link>
                  {m.calon_id && (
                    <Link href={`/pipeline/calon/${m.calon_id}`} className={`${tautan} inline-flex min-h-11 items-center`}>
                      Buka calon tenant
                    </Link>
                  )}
                  {m.peluang_id && (
                    <Link href={`/pipeline/${m.peluang_id}`} className={`${tautan} inline-flex min-h-11 items-center`}>
                      Buka peluangnya
                    </Link>
                  )}
                </p>
                {ubah && m.status !== "ditutup" && (
                  <div className="mt-2 border-t border-line pt-3">
                    <TindakMinat id={m.id} status={m.status} lokasi={`ruang ${m.lahan_kode}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
