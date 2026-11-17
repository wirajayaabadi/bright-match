import type { Metadata } from "next";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import StudioKelayakan from "@/components/studio-kelayakan";
import { Jejak } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getPenawaranTenantRinci, getSkenarioKelayakan } from "@/lib/data-portal";
import { luas } from "@/lib/format";
import { UUID } from "@/lib/istilah";
import { modelDariSegmen } from "@/lib/kelayakan";

export const metadata: Metadata = { title: "Studio kelayakan" };

type Props = PageProps<"/ruang-kerja/penawaran/[id]/kelayakan">;

// Pola halaman: Form. Tenant mengisi asumsi usahanya; hasil hitungan berubah langsung di sampingnya.
export default function StudioKelayakanHalaman({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) return <TidakDitemukan apa="Penawaran ini" />;
  const [hasil, skenario] = await Promise.all([getPenawaranTenantRinci(id), getSkenarioKelayakan(id)]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Penawaran ini" />;
  const p = hasil.data;
  const s = p.syarat;

  return (
    <>
      <Jejak
        induk={[
          { href: "/ruang-kerja", nama: "Penawaran untuk Anda" },
          { href: `/ruang-kerja/penawaran/${p.id}`, nama: `SPBU ${p.spbu.nomor}` },
        ]}
        kini="Studio kelayakan"
      />
      <header className="mb-8 max-w-3xl">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Studio kelayakan</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Hitung apakah usaha Anda layak di ruang {luas(p.ruang?.luas_m2)} di SPBU {p.spbu.nomor}, {p.spbu.kota ?? p.spbu.provinsi}. Syarat sewanya diambil dari
          penawaran; angka usahanya Anda isi sendiri.
        </p>
      </header>
      <StudioKelayakan
        peluangId={p.id}
        sewa={{
          sewa_tahunan: s.sewa_tahunan,
          lama_sewa_bulan: s.lama_sewa_bulan,
          bebas_sewa_bulan: s.bebas_sewa_bulan,
          deposit: s.deposit ?? 0,
          bagi_hasil_pct: s.bagi_hasil_pct ?? 0,
        }}
        versiPenawaran={s.versi}
        modelAwal={modelDariSegmen(p.segmen)}
        tersimpan={skenario.data ?? []}
      />
    </>
  );
}
