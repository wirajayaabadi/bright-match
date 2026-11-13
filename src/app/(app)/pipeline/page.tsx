import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { kolomSaring } from "@/components/saring";
import TabPipeline from "@/components/tab-pipeline";
import { BarisKosong, BingkaiTabel, Halaman, Lencana, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getDaftarPeluang } from "@/lib/data-tahap3";
import { alamat, n, satu, tanggal } from "@/lib/format";
import { namaTahap, TAHAP } from "@/lib/istilah";

export const metadata: Metadata = { title: "Pipeline calon tenant" };

type Props = PageProps<"/pipeline">;

export default function Pipeline({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Modul 7"
        judul="Pipeline calon tenant"
        keterangan="Setiap peluang adalah satu lahan kosong yang ditawarkan ke satu pihak, dari kontak pertama sampai kontrak. Peluang dibuat dari Mesin kecocokan atau dari halaman calon tenant."
      />
      <TabPipeline aktif="peluang" />
      <Suspense fallback={<Rangka baris={6} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const warnaTahap = (t: string) => (t === "kontrak" ? "hijau" : t === "batal" ? "netral" : t === "baru" ? "kuning" : "biru");

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = { tahap: satu(sp.tahap), q: satu(sp.q) };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);

  const hasil = await getDaftarPeluang({ tahap: saring.tahap, cari: saring.q, halaman });
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const { total, per_tahap: per, baris } = hasil.data ?? { total: 0, per_tahap: {}, baris: [] };
  const semua = Object.values(per).reduce((a, b) => a + b, 0);

  const chip = (nilai: string | undefined, nama: string, jumlah: number) => (
    <Link
      key={nama}
      href={alamat("/pipeline", { tahap: nilai, q: saring.q })}
      aria-current={saring.tahap === nilai ? "true" : undefined}
      className={`rounded-full border px-3 py-1 text-sm font-semibold ${
        saring.tahap === nilai ? "border-brand-blue bg-brand-blue-soft text-brand-blue-strong" : "border-line bg-white text-muted hover:border-subtle"
      }`}
    >
      {nama} <span className="angka font-normal opacity-70">{n(jumlah)}</span>
    </Link>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {chip(undefined, "Semua", semua)}
        {TAHAP.map((t) => chip(t.nilai, t.nama, per[t.nilai] ?? 0))}
        {chip("batal", "Batal", per.batal ?? 0)}
      </div>

      <Form action="/pipeline" className="mb-5 flex flex-wrap items-end gap-3">
        {saring.tahap && <input type="hidden" name="tahap" value={saring.tahap} />}
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted sm:max-w-md">
          Cari pihak, kode lahan, atau nomor SPBU
          <input type="search" name="q" defaultValue={saring.q ?? ""} key={saring.q ?? ""} className={kolomSaring} />
        </label>
        <button type="submit" className="min-h-10 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong">
          Cari
        </button>
      </Form>

      <BingkaiTabel lebarMin="min-w-[860px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Pihak
            </th>
            <th scope="col" className={th}>
              Lahan
            </th>
            <th scope="col" className={th}>
              Jenis usaha
            </th>
            <th scope="col" className={thKanan}>
              Skor
            </th>
            <th scope="col" className={th}>
              Tahap
            </th>
            <th scope="col" className={thKanan}>
              Persyaratan
            </th>
            <th scope="col" className={thKanan}>
              Diubah
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && (
            <BarisKosong
              kolom={7}
              pesan={
                semua === 0
                  ? "Belum ada peluang. Buka Mesin kecocokan, pilih pasangan lahan dan tenant, lalu klik “Jadikan peluang”."
                  : "Tidak ada peluang yang sesuai saringan."
              }
            />
          )}
          {baris.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <th scope="row" className={`${td} text-left font-normal`}>
                <Link href={`/pipeline/${p.id}`} className={tautan}>
                  {p.pihak}
                </Link>
                <p className="mt-0.5 text-xs text-subtle">{p.jenis_pihak === "calon" ? "Calon tenant baru" : "Tenant eksisting"}</p>
              </th>
              <td className={`${td} text-muted`}>
                <span className="font-medium whitespace-nowrap text-ink">{p.lahan_kode}</span>
                <p className="text-xs text-subtle">
                  SPBU {p.spbu_nomor} · {p.kota ?? "–"}
                </p>
              </td>
              <td className={`${td} text-muted`}>{p.segmen ?? "–"}</td>
              <td className={`${tdAngka} font-semibold text-ink`}>{p.skor ?? "–"}</td>
              <td className={td}>
                <Lencana warna={warnaTahap(p.tahap)}>{namaTahap(p.tahap)}</Lencana>
              </td>
              <td className={`${tdAngka} text-muted`}>
                {n(p.syarat_terpenuhi)} dari {n(p.syarat_total)}
              </td>
              <td className={`${tdAngka} text-muted`}>{tanggal(p.diubah)}</td>
            </tr>
          ))}
        </tbody>
      </BingkaiTabel>

      <Halaman
        halaman={halaman}
        total={total}
        satuan="peluang"
        href={(h) => alamat("/pipeline", { ...saring, hal: h > 1 ? h : undefined })}
      />
    </>
  );
}
