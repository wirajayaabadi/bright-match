import type { Metadata } from "next";
import Form from "next/form";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { PilihWilayah } from "@/components/saring";
import LahanCocok from "@/components/lahan-cocok";
import { CatatanVersi } from "@/components/skor";
import { Bagian, Jejak } from "@/components/tabel";
import { JudulHalaman, Rangka, TidakDitemukan } from "@/components/ui";
import { getKecocokanTenant } from "@/lib/data-tahap1";
import { daya, luas, n, rp, satu } from "@/lib/format";

export const metadata: Metadata = { title: "Lahan cocok untuk tenant" };

type Props = PageProps<"/kecocokan/tenant/[id]">;

export default function LahanUntukTenant({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Isi({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const saring = { provinsi: satu(sp.provinsi), kota: satu(sp.kota) };
  const hasil = await getKecocokanTenant(id, saring);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Tenant ini" />;

  const { tenant: t, wilayah, lahan } = hasil.data;
  const kandidat = lahan[0]?.jumlah_kandidat ?? 0;
  const di = saring.kota ?? saring.provinsi ?? `${n(t.provinsi)} provinsi tempat tenant ini beroperasi`;

  return (
    <>
      <Jejak
        induk={[
          { href: "/kecocokan", nama: "Mesin kecocokan" },
          { href: `/tenant/${t.id}`, nama: t.nama },
        ]}
        kini="Lahan yang cocok"
      />
      <JudulHalaman
        label={t.segmen_utama}
        judul={`Lahan kosong untuk ${t.nama}`}
        keterangan={`Syarat diturunkan dari ${n(t.lahan)} lahan yang sedang disewa: luas ${luas(t.luas_p10)} – ${luas(t.luas_p90)}, tarif sampai ${t.tarif_p90 != null ? `${rp(t.tarif_p90)}/th` : "tidak tercatat"}, daya median ${daya(t.daya_median)}.`}
      />

      <Form action={`/kecocokan/tenant/${t.id}`} className="mb-2 flex flex-wrap items-end gap-3">
        <PilihWilayah wilayah={wilayah} provinsi={saring.provinsi} kota={saring.kota} />
      </Form>
      <p className="text-xs text-subtle">Hanya wilayah tempat tenant ini sudah beroperasi yang bisa dipilih.</p>

      <Bagian
        judul="Lahan yang cocok"
        keterangan={
          lahan.length > 0
            ? `${n(lahan.length)} lahan teratas dari ${n(kandidat)} lahan kosong yang lolos syarat wajib di ${di}. SPBU yang sudah ditempati tenant ini tidak ikut.`
            : undefined
        }
      >
        {lahan.length === 0 ? (
          <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-subtle shadow-card">
            Tidak ada lahan kosong yang lolos syarat wajib di wilayah ini.
          </p>
        ) : (
          <LahanCocok lahan={lahan} tenantId={t.id} />
        )}
        <CatatanVersi />
      </Bagian>
    </>
  );
}
