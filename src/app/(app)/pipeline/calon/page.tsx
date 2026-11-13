import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { kolomSaring, PilihLangsung } from "@/components/saring";
import TabPipeline from "@/components/tab-pipeline";
import { BarisKosong, BingkaiTabel, Halaman, Lencana, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getDaftarCalon } from "@/lib/data-tahap3";
import { alamat, n, satu, tanggal } from "@/lib/format";
import { KANAL, namaJenisUsaha, STATUS_CALON } from "@/lib/istilah";

export const metadata: Metadata = { title: "Calon tenant" };

type Props = PageProps<"/pipeline/calon">;

export default function DaftarCalon({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Modul 7"
        judul="Calon tenant"
        keterangan="Usaha yang belum menjadi tenant: pendaftar formulir Jadi Bright Partner dan calon yang dicatat tim dari kanal lain."
      />
      <TabPipeline aktif="calon" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/pipeline/calon/baru"
          className="inline-flex min-h-10 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong"
        >
          Tambah calon tenant
        </Link>
        <Link href="/daftar" className={`${tautan} text-sm`}>
          Buka formulir publik
        </Link>
      </div>
      <Suspense fallback={<Rangka baris={6} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = { q: satu(sp.q), status: satu(sp.status) };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);
  const hasil = await getDaftarCalon({ cari: saring.q, status: saring.status, halaman });
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const { total, baris } = hasil.data ?? { total: 0, baris: [] };

  return (
    <>
      <Form action="/pipeline/calon" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted sm:max-w-md">
          Cari nama usaha atau kontak
          <input type="search" name="q" defaultValue={saring.q ?? ""} key={saring.q ?? ""} className={kolomSaring} />
        </label>
        <PilihLangsung
          name="status"
          label="Status"
          nilai={saring.status}
          kosong="Semua status"
          pilihan={Object.entries(STATUS_CALON).map(([nilai, label]) => ({ nilai, label }))}
        />
        <button type="submit" className="min-h-10 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong">
          Cari
        </button>
      </Form>

      <BingkaiTabel lebarMin="min-w-[820px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Nama usaha
            </th>
            <th scope="col" className={th}>
              Jenis usaha
            </th>
            <th scope="col" className={th}>
              Asal
            </th>
            <th scope="col" className={th}>
              Kanal
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={thKanan}>
              Peluang
            </th>
            <th scope="col" className={thKanan}>
              Terdaftar
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && <BarisKosong kolom={7} pesan="Belum ada calon tenant. Tambahkan sendiri atau bagikan formulir publik." />}
          {baris.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <th scope="row" className={`${td} text-left font-normal`}>
                <Link href={`/pipeline/calon/${c.id}`} className={tautan}>
                  {c.nama_usaha}
                </Link>
                <p className="mt-0.5 text-xs text-subtle">{c.kontak_nama}</p>
              </th>
              <td className={`${td} text-muted`}>{namaJenisUsaha(c.segmen)}</td>
              <td className={`${td} text-muted`}>{c.asal === "internasional" ? (c.negara ?? "Luar negeri") : "Indonesia"}</td>
              <td className={`${td} text-muted`}>{KANAL[c.kanal] ?? c.kanal}</td>
              <td className={td}>
                <Lencana warna={c.status === "aktif" ? "hijau" : c.status === "baru" ? "kuning" : "netral"}>
                  {STATUS_CALON[c.status] ?? c.status}
                </Lencana>
              </td>
              <td className={`${tdAngka} text-muted`}>{n(c.peluang)}</td>
              <td className={`${tdAngka} text-muted`}>{tanggal(c.dibuat)}</td>
            </tr>
          ))}
        </tbody>
      </BingkaiTabel>

      <Halaman
        halaman={halaman}
        total={total}
        satuan="calon tenant"
        href={(h) => alamat("/pipeline/calon", { ...saring, hal: h > 1 ? h : undefined })}
      />
    </>
  );
}
