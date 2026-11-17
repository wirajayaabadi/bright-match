import type { Metadata } from "next";
import { Suspense } from "react";
import FormInspeksi from "@/components/form-inspeksi";
import PanelGalat from "@/components/panel-galat";
import RingkasanInspeksi from "@/components/ringkasan-inspeksi";
import { Jejak, Lencana } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getInspeksiDealer } from "@/lib/data-dealer";
import { tanggal } from "@/lib/format";
import { UUID } from "@/lib/istilah";
import { STATUS_INSPEKSI } from "@/lib/status-lahan";

export const metadata: Metadata = { title: "Pemeriksaan ruang" };

type Props = PageProps<"/ruang-kerja/inspeksi/[id]">;

// Pola halaman: Form. Daftar periksa kesiapan yang sama dengan milik tim NFR, diisi pengelola SPBU di lokasi.
export default function PemeriksaanRuang({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) return <TidakDitemukan apa="Pemeriksaan ini" />;
  const hasil = await getInspeksiDealer(id);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Pemeriksaan ini" />;
  const i = hasil.data;
  const bisaIsi = i.milik_saya && (i.status === "draf" || i.status === "ditolak");

  return (
    <>
      <Jejak
        induk={[
          { href: "/ruang-kerja", nama: "SPBU Anda" },
          { href: `/ruang-kerja/spbu/${i.spbu_id}`, nama: `SPBU ${i.spbu_nomor}` },
        ]}
        kini={i.lahan_kode}
      />
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Pemeriksaan ruang {i.lahan_kode}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <Lencana warna={i.status === "diterima" ? "hijau" : i.status === "ditolak" ? "kuning" : i.status === "diajukan" ? "biru" : "netral"}>
            {STATUS_INSPEKSI[i.status] ?? i.status}
          </Lencana>
          <span>Pemeriksa: {i.pemeriksa_email ?? "–"}</span>
          {i.diajukan && <span>Diajukan {tanggal(i.diajukan)}</span>}
        </p>
      </header>

      {i.status === "ditolak" && (
        <section aria-label="Catatan peninjau" className="mb-6 max-w-2xl rounded-xl border border-warn bg-warn-soft px-4 py-3.5 text-sm leading-relaxed text-warn">
          <p className="font-bold">Dikembalikan tim Non Fuel Retail pada {tanggal(i.ditinjau)}</p>
          <p className="mt-1">{i.catatan_tinjau}</p>
          {i.milik_saya && <p className="mt-1">Perbaiki di bawah, lalu ajukan lagi.</p>}
        </section>
      )}
      {i.status === "diajukan" && (
        <p className="mb-6 max-w-2xl rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-muted shadow-card">
          Pemeriksaan ini sedang ditinjau tim Non Fuel Retail. Ruang baru bisa ditawarkan ke tenant setelah tinjauan itu.
        </p>
      )}
      {i.status === "diterima" && (
        <p className="mb-6 max-w-2xl rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-muted shadow-card">
          Diterima tim Non Fuel Retail pada {tanggal(i.ditinjau)}. Data ruang ini sekarang terverifikasi.
        </p>
      )}

      {bisaIsi ? (
        <FormInspeksi id={i.id} isi={i.isi} hasil={i.hasil} foto={i.foto} sumber={{ luas_m2: i.lahan?.luas_m2 ?? null, daya_w: i.lahan?.daya_w ?? null }} />
      ) : (
        <RingkasanInspeksi i={i} />
      )}
    </>
  );
}
