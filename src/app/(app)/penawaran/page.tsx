import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { PilihWilayah } from "@/components/saring";
import { BarisKosong, BingkaiTabel, Halaman, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getDaftarLahanKosong, getWilayah } from "@/lib/data-tahap1";
import { alamat, daya, luas, rp, satu } from "@/lib/format";

export const metadata: Metadata = { title: "Kartu penawaran" };

type Props = PageProps<"/penawaran">;

export default function DaftarPenawaran({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Modul 6"
        judul="Kartu penawaran"
        keterangan="Satu halaman penawaran per lahan kosong: ruang, sewa, lokasi, dan lingkungan. Tersedia dalam bahasa Indonesia dan Inggris, dan bisa dicetak atau disimpan sebagai PDF."
      />
      <p className="mb-5 max-w-3xl text-sm leading-relaxed text-muted">
        Pilih lahan di bawah untuk membuat kartunya. Kartu yang dibuka dari halaman peluang atau kartu rekomendasi
        otomatis memuat alasan kecocokan untuk pihak yang dituju.
      </p>
      <Suspense fallback={<Rangka baris={6} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = { provinsi: satu(sp.provinsi), kota: satu(sp.kota) };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);
  const [wilayah, daftar] = await Promise.all([getWilayah(), getDaftarLahanKosong({ ...saring, halaman })]);
  if (daftar.galat) return <PanelGalat galat={daftar.galat} />;
  const { total, baris } = daftar.data ?? { total: 0, baris: [] };

  return (
    <>
      <Form action="/penawaran" className="mb-4 flex flex-wrap items-end gap-3">
        <PilihWilayah wilayah={wilayah.data ?? []} provinsi={saring.provinsi} kota={saring.kota} />
      </Form>
      <BingkaiTabel>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Kode lahan
            </th>
            <th scope="col" className={th}>
              SPBU
            </th>
            <th scope="col" className={th}>
              Posisi
            </th>
            <th scope="col" className={thKanan}>
              Luas
            </th>
            <th scope="col" className={thKanan}>
              Daya
            </th>
            <th scope="col" className={thKanan}>
              Tarif/tahun
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Tindakan</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && <BarisKosong kolom={7} pesan="Tidak ada lahan kosong di wilayah ini." />}
          {baris.map((l) => (
            <tr key={l.lahan_id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <th scope="row" className={`${td} text-left font-semibold whitespace-nowrap text-ink`}>
                {l.kode}
              </th>
              <td className={`${td} text-muted`}>
                SPBU {l.spbu_nomor}
                <p className="text-xs text-subtle">
                  {l.kota ?? "–"}, {l.provinsi}
                </p>
              </td>
              <td className={`${td} text-muted`}>{l.posisi ?? "–"}</td>
              <td className={`${tdAngka} text-muted`}>{luas(l.luas_m2)}</td>
              <td className={`${tdAngka} text-muted`}>{daya(l.daya_w)}</td>
              <td className={`${tdAngka} font-semibold text-ink`}>{l.tarif_tahunan != null ? rp(l.tarif_tahunan) : "–"}</td>
              <td className={`${td} text-right whitespace-nowrap`}>
                <Link href={`/penawaran/${l.lahan_id}`} className={tautan}>
                  Buat kartu
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </BingkaiTabel>
      <Halaman
        halaman={halaman}
        total={total}
        satuan="lahan kosong"
        href={(h) => alamat("/penawaran", { ...saring, hal: h > 1 ? h : undefined })}
      />
    </>
  );
}
