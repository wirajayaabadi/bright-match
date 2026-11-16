import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { LencanaTipe } from "@/components/lingkungan";
import { CentangLangsung, kolomSaring, PilihLangsung, PilihWilayah } from "@/components/saring";
import { BarisKosong, BingkaiTabel, Halaman, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import SelFoto from "@/components/sel-foto";
import { getGambarDaftar } from "@/lib/data-gambar";
import { getDaftarSpbu, getWilayah } from "@/lib/data-tahap1";
import { alamat, n, rp, satu } from "@/lib/format";
import { DAFTAR_TIPE, TIPE_LOKASI } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Profil lokasi" };

type Props = PageProps<"/lokasi">;

export default function DaftarLokasi({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Modul 2"
        judul="Profil lokasi"
        keterangan="Semua SPBU beserta lahan, tenant, dan lahan kosongnya. Pilih satu SPBU untuk melihat profil lengkap dan mencari tenant yang cocok."
      />
      <Suspense fallback={<Rangka baris={8} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = {
    q: satu(sp.q),
    provinsi: satu(sp.provinsi),
    kota: satu(sp.kota),
    tipe: satu(sp.tipe),
    kosong: satu(sp.kosong) === "1" ? "1" : undefined,
  };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);

  const [wilayah, daftar] = await Promise.all([
    getWilayah(),
    getDaftarSpbu({
      cari: saring.q,
      provinsi: saring.provinsi,
      kota: saring.kota,
      tipe: saring.tipe,
      hanyaKosong: saring.kosong === "1",
      halaman,
    }),
  ]);
  if (daftar.galat) return <PanelGalat galat={daftar.galat} />;
  const { total, baris } = daftar.data ?? { total: 0, baris: [] };
  const foto = await getGambarDaftar({ spbu: baris.map((b) => b.id) });

  return (
    <>
      <Form action="/lokasi" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
          Cari nomor SPBU atau alamat
          <input
            type="search"
            name="q"
            defaultValue={saring.q ?? ""}
            key={saring.q ?? ""}
            placeholder="mis. 3415138 atau Sudirman"
            className={kolomSaring}
          />
        </label>
        <PilihWilayah wilayah={wilayah.data ?? []} provinsi={saring.provinsi} kota={saring.kota} />
        <PilihLangsung
          name="tipe"
          label="Tipe lokasi"
          nilai={saring.tipe}
          kosong="Semua tipe"
          pilihan={DAFTAR_TIPE.map((t) => ({ nilai: t, label: TIPE_LOKASI[t].nama }))}
        />
        <CentangLangsung name="kosong" label="Hanya yang punya lahan kosong" aktif={saring.kosong === "1"} />
        <button
          type="submit"
          className="min-h-10 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-strong"
        >
          Cari
        </button>
      </Form>

      <BingkaiTabel lebarMin="min-w-[940px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Foto
            </th>
            <th scope="col" className={th}>
              SPBU
            </th>
            <th scope="col" className={th}>
              Kota
            </th>
            <th scope="col" className={th}>
              Tipe lokasi
            </th>
            <th scope="col" className={thKanan}>
              Lahan
            </th>
            <th scope="col" className={thKanan}>
              Kosong
            </th>
            <th scope="col" className={thKanan}>
              Tenant
            </th>
            <th scope="col" className={thKanan}>
              Potensi sewa/tahun
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && <BarisKosong kolom={8} pesan="Tidak ada SPBU yang sesuai saringan." />}
          {baris.map((b) => (
            <tr key={b.id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <td className="px-4 py-2.5 align-top">
                <SelFoto gambar={foto.spbu[b.id]} subjek={`SPBU ${b.nomor}`} />
              </td>
              <th scope="row" className={`${td} text-left font-normal`}>
                <Link href={`/lokasi/${b.id}`} className={tautan}>
                  SPBU {b.nomor}
                </Link>
                <p className="mt-0.5 max-w-md text-xs leading-relaxed text-subtle">{b.alamat ?? "Alamat tidak tercatat"}</p>
              </th>
              <td className={`${td} text-muted`}>
                {b.kota ?? "–"}
                <p className="text-xs text-subtle">{b.provinsi}</p>
              </td>
              <td className={td}>
                <LencanaTipe tipe={b.tipe_lokasi} />
              </td>
              <td className={`${tdAngka} text-muted`}>{n(b.lahan)}</td>
              <td className={`${tdAngka} font-semibold text-ink`}>{n(b.lahan_kosong)}</td>
              <td className={`${tdAngka} text-muted`}>{n(b.tenant)}</td>
              <td className={`${tdAngka} font-semibold text-ink`}>
                {b.potensi_sewa_bertarif > 0 ? rp(b.potensi_sewa_bertarif) : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </BingkaiTabel>

      <Halaman
        halaman={halaman}
        total={total}
        satuan="SPBU"
        href={(h) => alamat("/lokasi", { ...saring, hal: h > 1 ? h : undefined })}
      />
    </>
  );
}
