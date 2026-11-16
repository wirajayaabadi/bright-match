import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { kolomSaring, PilihWilayah } from "@/components/saring";
import { CatatanVersi } from "@/components/skor";
import { Bagian, BarisKosong, BingkaiTabel, Halaman, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import SelFoto from "@/components/sel-foto";
import { getGambarDaftar } from "@/lib/data-gambar";
import { getDaftarLahanKosong, getWilayah } from "@/lib/data-tahap1";
import { alamat, daya, luas, rp, satu } from "@/lib/format";

export const metadata: Metadata = { title: "Mesin kecocokan" };

type Props = PageProps<"/kecocokan">;

/** Tiga kota pilot program Bright Partner. */
const PILOT = [
  { nama: "Kota Tangerang", provinsi: "Banten", kota: "Kodya Tangerang" },
  { nama: "Jakarta Selatan", provinsi: "DKI Jakarta", kota: "Kodya Jakarta Selatan" },
  { nama: "Semarang", provinsi: "Jawa Tengah", kota: "Semarang Kota" },
];

export default function MesinKecocokan({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Modul 4"
        judul="Mesin kecocokan"
        keterangan="Dua arah: untuk satu lahan kosong, tenant mana yang cocok; untuk satu tenant, lahan kosong mana yang cocok. Setiap skor disertai alasannya."
      />

      <section className="rounded-xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-base font-bold text-ink">Mulai dari tenant</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Cari tenant, buka profilnya, lalu pilih “Cari lahan kosong yang cocok”.
        </p>
        <Form action="/tenant" className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
            Nama tenant
            <input type="search" name="q" placeholder="mis. Poci atau Bank Mandiri" className={kolomSaring} />
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-strong"
          >
            Cari tenant
          </button>
        </Form>
      </section>

      <Bagian
        judul="Mulai dari lahan kosong"
        keterangan="Pilih wilayah, lalu pilih lahan untuk melihat kartu rekomendasinya."
      >
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          Kota pilot:
          {PILOT.map((p) => (
            <Link
              key={p.kota}
              href={alamat("/kecocokan", { provinsi: p.provinsi, kota: p.kota })}
              className="rounded-full border border-line bg-white px-3 py-1 font-semibold text-brand-blue-strong hover:border-brand-blue"
            >
              {p.nama}
            </Link>
          ))}
        </p>
        <Suspense fallback={<Rangka baris={6} />}>
          <LahanKosong searchParams={searchParams} />
        </Suspense>
      </Bagian>

      <CatatanVersi />
    </>
  );
}

async function LahanKosong({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = { provinsi: satu(sp.provinsi), kota: satu(sp.kota) };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);

  const [wilayah, daftar] = await Promise.all([getWilayah(), getDaftarLahanKosong({ ...saring, halaman })]);
  if (daftar.galat) return <PanelGalat galat={daftar.galat} />;
  const { total, baris } = daftar.data ?? { total: 0, baris: [] };
  const foto = await getGambarDaftar({ lahan: baris.map((l) => l.lahan_id) });

  return (
    <>
      <Form action="/kecocokan" className="mb-4 flex flex-wrap items-end gap-3">
        <PilihWilayah wilayah={wilayah.data ?? []} provinsi={saring.provinsi} kota={saring.kota} />
      </Form>

      <BingkaiTabel>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Foto
            </th>
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
          {baris.length === 0 && <BarisKosong kolom={8} pesan="Tidak ada lahan kosong di wilayah ini." />}
          {baris.map((l) => (
            <tr key={l.lahan_id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <td className="px-4 py-2.5 align-top">
                <SelFoto gambar={foto.lahan[l.lahan_id]} subjek={`lahan ${l.kode}`} />
              </td>
              <th scope="row" className={`${td} text-left font-semibold whitespace-nowrap text-ink`}>
                {l.kode}
              </th>
              <td className={td}>
                <Link href={`/lokasi/${l.spbu_id}`} className={tautan}>
                  SPBU {l.spbu_nomor}
                </Link>
                <p className="text-xs text-subtle">
                  {l.kota ?? "–"}, {l.provinsi}
                </p>
              </td>
              <td className={`${td} text-muted`}>{l.posisi ?? "–"}</td>
              <td className={`${tdAngka} text-muted`}>{luas(l.luas_m2)}</td>
              <td className={`${tdAngka} text-muted`}>{daya(l.daya_w)}</td>
              <td className={`${tdAngka} font-semibold text-ink`}>{l.tarif_tahunan != null ? rp(l.tarif_tahunan) : "–"}</td>
              <td className={`${td} text-right whitespace-nowrap`}>
                <Link href={`/kecocokan/lahan/${l.lahan_id}`} className={tautan}>
                  Cari tenant cocok
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
        href={(h) => alamat("/kecocokan", { ...saring, hal: h > 1 ? h : undefined })}
      />
    </>
  );
}
