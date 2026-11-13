import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import TabelPeluang, { CatatanPotensi } from "@/components/tabel-peluang";
import { JudulHalaman, Rangka, TidakDitemukan } from "@/components/ui";
import { getPeluangKota } from "@/lib/data";
import { n, rp } from "@/lib/format";

type Props = PageProps<"/peluang/[provinsi]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { provinsi } = await params;
  return { title: `Peluang di ${decodeURIComponent(provinsi)}` };
}

export default function PeluangProvinsi({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const provinsi = decodeURIComponent((await params).provinsi);
  const hasil = await getPeluangKota(provinsi);

  if (hasil.galat) {
    return (
      <>
        <JudulHalaman label="Peta peluang" judul={provinsi} />
        <PanelGalat galat={hasil.galat} />
      </>
    );
  }
  if (hasil.data.length === 0) return <TidakDitemukan apa="Provinsi ini" />;

  const kosong = hasil.data.reduce((t, b) => t + b.lahan_kosong, 0);
  const potensi = hasil.data.reduce((t, b) => t + b.potensi_sewa_bertarif, 0);

  return (
    <>
      <nav aria-label="Jejak halaman" className="mb-4 text-sm text-subtle">
        <Link href="/peluang" className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
          Peta peluang
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span>{provinsi}</span>
      </nav>
      <JudulHalaman
        label="Peta peluang"
        judul={provinsi}
        keterangan={`${n(kosong)} lahan kosong di ${n(hasil.data.length)} kota dan kabupaten, dengan potensi sewa ${rp(potensi)} per tahun dari lahan yang tarifnya tercantum.`}
      />
      <TabelPeluang baris={hasil.data} kolomNama="Kota / kabupaten" nama={(b) => b.kota ?? "Kota tidak tercatat"} />
      <CatatanPotensi />
    </>
  );
}
