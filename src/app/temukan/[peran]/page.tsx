import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Segar from "@/components/temukan/segar";
import Wizard from "@/components/temukan/wizard";
import { Rangka } from "@/components/ui";
import { getRuang } from "@/lib/data";
import { getRingkasanDealer } from "@/lib/data-dealer";
import { satu } from "@/lib/format";
import { langkahTujuan, RINGKASAN } from "@/lib/temukan/cabang";
import { adalahPeran, kuesioner } from "@/lib/temukan/kuesioner";
import { bacaSesi, getWilayahTemukan } from "@/lib/temukan/sesi";
import type { SpbuUmum } from "@/lib/temukan/tipe";

export const metadata: Metadata = { title: "Temukan peluang" };

type Props = PageProps<"/temukan/[peran]">;

/** Wizard Temukan peluang. Pola halaman: Formulir (wizard), satu pertanyaan per langkah, tanpa menu aplikasi. */
export default function HalamanWizard({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Kerangka />}>
      <Isi params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function Kerangka() {
  return (
    <div className="min-h-svh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center px-4 sm:px-6">
          <Image src="/brand/logo-pertamina.png" alt="Pertamina" width={467} height={118} className="h-4 w-auto" />
        </div>
        <div className="h-1 bg-line" />
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
        <Rangka baris={4} />
      </main>
    </div>
  );
}

async function Isi({ params, searchParams }: Props) {
  const [{ peran }, cari] = await Promise.all([params, searchParams]);
  if (!adalahPeran(peran)) notFound();
  const k = kuesioner(peran);

  const [sesiSemua, wilayah, ruangAkun] = await Promise.all([bacaSesi(), peran === "tenant" ? getWilayahTemukan() : [], getRuang()]);
  const sesi = sesiSemua.find((s) => s.peran === peran);

  // Pengelola SPBU yang sudah masuk memilih dari SPBU yang wewenangnya memang tercatat untuk akunnya.
  let spbuSaya: SpbuUmum[] = [];
  if (peran === "dealer" && ruangAkun === "dealer") {
    const milik = await getRingkasanDealer();
    spbuSaya = (milik.data?.spbu ?? []).map((s) => ({
      id: s.spbu_id,
      nomor: s.nomor,
      alamat: s.alamat,
      kota: s.kota,
      provinsi: s.provinsi,
    }));
  }

  const jawaban = sesi?.jawaban ?? {};
  const dilewati = sesi?.dilewati ?? [];
  const diminta = satu(cari.langkah) ?? (sesi?.status === "selesai" ? RINGKASAN : sesi?.langkah);

  return (
    <Segar>
      <Wizard
        peran={peran}
        awal={{
          jawaban,
          dilewati,
          langkah: langkahTujuan(k, jawaban, dilewati, diminta),
          tersimpan: sesi !== undefined,
        }}
        wilayah={wilayah}
        spbuSaya={spbuSaya}
        ruangAkun={ruangAkun}
        ubah={satu(cari.ubah) === "1"}
      />
    </Segar>
  );
}
