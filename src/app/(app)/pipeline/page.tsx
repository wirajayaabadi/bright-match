import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { kolomSaring } from "@/components/saring";
import TabPipeline from "@/components/tab-pipeline";
import { BarisKosong, BingkaiTabel, Halaman, Lencana, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getDaftarPeluang, type DaftarPeluang } from "@/lib/data-tahap3";
import { alamat, n, satu, tanggal } from "@/lib/format";
import { HASIL, namaTahap, TAHAP, tahapBerakhir } from "@/lib/istilah";

export const metadata: Metadata = { title: "Pipeline calon tenant" };

type Props = PageProps<"/pipeline">;

export default function Pipeline({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Modul 7"
        judul="Pipeline calon tenant"
        keterangan="Setiap peluang adalah satu lahan kosong yang ditawarkan ke satu pihak, lewat 12 tahap dari dibuat sampai pemantauan kinerja. Peluang dibuat dari Mesin kecocokan atau dari halaman calon tenant."
      />
      <TabPipeline aktif="peluang" />
      <Suspense fallback={<Rangka baris={6} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const warnaTahap = (t: string) => (tahapBerakhir(t) ? "netral" : t === "pemantauan" ? "hijau" : t === "baru" ? "kuning" : "biru");

// Pola halaman: List / Index. Peluang yang tenggatnya lewat di urutan teratas.
async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = { tahap: satu(sp.tahap), q: satu(sp.q) };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);

  const hasil = await getDaftarPeluang({ tahap: saring.tahap, cari: saring.q, halaman });
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const { total, per_tahap: per, terlambat, baris }: DaftarPeluang = hasil.data ?? { total: 0, per_tahap: {}, terlambat: 0, baris: [] };
  const semua = Object.values(per).reduce((a, b) => a + b, 0);
  const berakhir = HASIL.reduce((a, h) => a + (per[h.nilai] ?? 0), 0);

  const chip = (nilai: string | undefined, nama: string, jumlah: number) => (
    <Link
      key={nama}
      href={alamat("/pipeline", { tahap: nilai, q: saring.q })}
      aria-current={saring.tahap === nilai ? "true" : undefined}
      className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold ${
        saring.tahap === nilai ? "border-brand-blue bg-brand-blue-soft text-brand-blue-strong" : "border-line bg-white text-muted hover:border-subtle"
      }`}
    >
      {nama} <span className="angka ml-1.5 font-normal opacity-70">{n(jumlah)}</span>
    </Link>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {chip(undefined, "Semua", semua)}
        {chip("berjalan", "Sedang berjalan", semua - berakhir)}
        {chip("terlambat", "Tenggat lewat", terlambat)}
        {chip("berakhir", "Berakhir", berakhir)}
      </div>

      <Form action="/pipeline" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted sm:max-w-md">
          Cari pihak, kode lahan, atau nomor SPBU
          <input type="search" name="q" defaultValue={saring.q ?? ""} key={saring.q ?? ""} className={kolomSaring} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Tahap
          <select name="tahap" defaultValue={saring.tahap ?? ""} key={`t-${saring.tahap ?? ""}`} className={kolomSaring}>
            <option value="">Semua tahap</option>
            <option value="berjalan">Sedang berjalan</option>
            <option value="terlambat">Tenggat lewat</option>
            <option value="berakhir">Berakhir</option>
            {TAHAP.map((t, i) => (
              <option key={t.nilai} value={t.nilai}>
                {i + 1}. {t.nama} ({n(per[t.nilai] ?? 0)})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong">
          Cari
        </button>
      </Form>

      <BingkaiTabel lebarMin="min-w-[900px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Pihak
            </th>
            <th scope="col" className={th}>
              Lahan
            </th>
            <th scope="col" className={th}>
              Tahap
            </th>
            <th scope="col" className={th}>
              Tindakan berikut
            </th>
            <th scope="col" className={th}>
              Pemilik
            </th>
            <th scope="col" className={thKanan}>
              Tenggat
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && (
            <BarisKosong
              kolom={6}
              pesan={
                semua === 0
                  ? "Belum ada peluang. Buka Mesin kecocokan, pilih pasangan lahan dan tenant, lalu klik “Jadikan peluang”."
                  : "Tidak ada peluang yang sesuai saringan."
              }
            />
          )}
          {baris.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <th scope="row" className={`${td} min-w-52 text-left font-normal`}>
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
              <td className={td}>
                <Lencana warna={warnaTahap(p.tahap)}>{namaTahap(p.tahap)}</Lencana>
              </td>
              <td className={`${td} max-w-xs text-muted`}>{p.tindakan_berikut ?? <span className="text-subtle">Belum diisi</span>}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{p.pemilik ?? <span className="font-semibold text-brand-red-strong">Belum ada</span>}</td>
              <td className={`${tdAngka} ${p.terlambat ? "font-semibold text-brand-red-strong" : "text-muted"}`}>
                {p.tenggat ? tanggal(p.tenggat) : <span className="text-subtle">–</span>}
                {p.terlambat && <p className="text-xs font-normal">sudah lewat</p>}
              </td>
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
