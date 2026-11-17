import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DialogTinjau } from "@/components/aksi-lahan";
import FormInspeksi from "@/components/form-inspeksi";
import PanelGalat from "@/components/panel-galat";
import RingkasanInspeksi from "@/components/ringkasan-inspeksi";
import { Jejak, Lencana, tautan } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getInspeksiRinci } from "@/lib/data-status";
import { getProfilSaya } from "@/lib/data-validasi";
import { tanggal } from "@/lib/format";
import { UUID } from "@/lib/istilah";
import { STATUS_INSPEKSI } from "@/lib/status-lahan";

export const metadata: Metadata = { title: "Inspeksi lahan" };

type Props = PageProps<"/inspeksi/[id]">;

// Pola halaman: Form. Daftar periksa kesiapan lokasi, satu kolom, untuk diisi di ponsel.
// Setelah diajukan, formulir yang sama tampil sebagai ringkasan baca untuk ditinjau.
export default function InspeksiLahan({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

const WARNA: Record<string, "biru" | "kuning" | "hijau" | "netral"> = { diajukan: "biru", ditolak: "kuning", diterima: "hijau", draf: "netral" };

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) return <TidakDitemukan apa="Inspeksi ini" />;
  const [hasil, profil] = await Promise.all([getInspeksiRinci(id), getProfilSaya()]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Inspeksi ini" />;

  const i = hasil.data;
  const bisaIsi = i.milik_saya && (i.status === "draf" || i.status === "ditolak");
  const peran = profil.data?.peran_nfr;
  const bisaTinjau = i.status === "diajukan" && !i.milik_saya && (peran === "nfr_admin" || peran === "nfr_penyetuju");

  return (
    <>
      <Jejak induk={[{ href: "/inspeksi", nama: "Kesiapan lahan" }]} kini={i.lahan_kode} />

      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Inspeksi lahan {i.lahan_kode}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            SPBU {i.spbu_nomor}
            {i.lahan?.kota ? `, ${i.lahan.kota}` : ""}. {i.lahan?.alamat ?? ""}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <Lencana warna={WARNA[i.status] ?? "netral"}>{STATUS_INSPEKSI[i.status] ?? i.status}</Lencana>
            <span>Pemeriksa: {i.pemeriksa_email ?? "–"}</span>
            {i.diajukan && <span>Diajukan {tanggal(i.diajukan)}</span>}
            <Link href={`/kecocokan/lahan/${i.lahan_id}`} className={tautan}>
              Buka kartu lahan
            </Link>
          </p>
        </div>
        {bisaTinjau && (
          <div className="flex shrink-0 flex-wrap items-start gap-3">
            <DialogTinjau id={i.id} kode={i.lahan_kode} />
          </div>
        )}
      </header>

      {i.status === "ditolak" && (
        <section aria-label="Catatan peninjau" className="mb-6 max-w-2xl rounded-xl border border-warn bg-warn-soft px-4 py-3.5 text-sm leading-relaxed text-warn">
          <p className="font-bold">
            Dikembalikan oleh {i.peninjau_email ?? "peninjau"} pada {tanggal(i.ditinjau)}
          </p>
          <p className="mt-1">{i.catatan_tinjau}</p>
          {i.milik_saya && <p className="mt-1">Perbaiki di bawah, lalu ajukan lagi.</p>}
        </section>
      )}
      {i.status === "diterima" && (
        <section aria-label="Hasil tinjauan" className="mb-6 max-w-2xl rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed shadow-card">
          <p className="font-bold text-ink">
            Diterima oleh {i.peninjau_email ?? "peninjau"} pada {tanggal(i.ditinjau)}
          </p>
          <p className="mt-1 text-muted">{i.catatan_tinjau ?? "Lahan menjadi terverifikasi berdasarkan inspeksi ini."}</p>
        </section>
      )}
      {i.status === "diajukan" && !bisaTinjau && (
        <p className="mb-6 max-w-2xl rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-muted shadow-card">
          {i.milik_saya
            ? "Inspeksi ini menunggu tinjauan admin atau penyetuju NFR. Lahan terverifikasi setelah tinjauan itu."
            : "Inspeksi ini menunggu tinjauan admin atau penyetuju NFR."}
        </p>
      )}
      {(i.status === "draf" || i.status === "ditolak") && !i.milik_saya && (
        <p className="mb-6 max-w-2xl rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-muted shadow-card">
          Inspeksi ini sedang diisi {i.pemeriksa_email ?? "orang lain"}. Di bawah adalah isinya sejauh ini.
        </p>
      )}

      {bisaIsi ? (
        <FormInspeksi
          id={i.id}
          isi={i.isi}
          hasil={i.hasil}
          foto={i.foto}
          sumber={{ luas_m2: i.lahan?.luas_m2 ?? null, daya_w: i.lahan?.daya_w ?? null }}
        />
      ) : (
        <RingkasanInspeksi i={i} />
      )}
    </>
  );
}
