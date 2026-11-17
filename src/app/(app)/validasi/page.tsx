import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { TombolPeriksaUlang } from "@/components/keputusan-masalah";
import PanelGalat from "@/components/panel-galat";
import PintasCari from "@/components/pintas-cari";
import { kolomSaring } from "@/components/saring";
import { BarisKosong, BingkaiTabel, Halaman, Lencana, tautan, td, th } from "@/components/tabel";
import { Rangka } from "@/components/ui";
import { getMasalahDaftar, getMasalahRingkasan, getProfilSaya } from "@/lib/data-validasi";
import { alamat, n, satu, tanggal } from "@/lib/format";
import {
  bolehUbah,
  JENIS_MASALAH,
  namaJenisMasalah,
  SARING_STATUS,
  STATUS_MASALAH,
  TINGKAT,
  type Tingkat,
} from "@/lib/validasi";

export const metadata: Metadata = { title: "Validasi data" };

type Props = PageProps<"/validasi">;

// Pola halaman: List / Index. Satu antrean temuan, satu kendali saringan, tabel berbingkai, penomoran halaman.
export default function ValidasiData({ searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi searchParams={searchParams} />
    </Suspense>
  );
}

const WARNA: Record<Tingkat, "merah" | "kuning" | "netral"> = { kritis: "merah", sedang: "kuning", rendah: "netral" };

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = {
    q: satu(sp.q),
    status: SARING_STATUS.some((s) => s.nilai === satu(sp.status)) ? satu(sp.status) : undefined,
    tingkat: satu(sp.tingkat) && satu(sp.tingkat)! in TINGKAT ? satu(sp.tingkat) : undefined,
    jenis: satu(sp.jenis) && satu(sp.jenis)! in JENIS_MASALAH ? satu(sp.jenis) : undefined,
  };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);

  const [ringkasan, daftar, profil] = await Promise.all([
    getMasalahRingkasan(),
    getMasalahDaftar({ cari: saring.q, status: saring.status, tingkat: saring.tingkat, jenis: saring.jenis, halaman }),
    getProfilSaya(),
  ]);
  if (daftar.galat) return <PanelGalat galat={daftar.galat} />;
  const { total, baris } = daftar.data ?? { total: 0, baris: [] };
  const r = ringkasan.data;
  const sumber = (r?.sumber ?? []).map((s) => `${s.nama} per ${s.per_tanggal ? tanggal(s.per_tanggal) : "tanggal tidak tercatat"}`);

  // Butir saringan yang aktif, masing-masing dengan alamat untuk melepasnya.
  type Saring = { q?: string; status?: string; tingkat?: string; jenis?: string };
  const butir: { label: string; tanpa: Saring }[] = [];
  if (saring.q) butir.push({ label: `Cari: ${saring.q}`, tanpa: { ...saring, q: undefined } });
  if (saring.status) {
    butir.push({
      label: `Status: ${SARING_STATUS.find((x) => x.nilai === saring.status)?.label}`,
      tanpa: { ...saring, status: undefined },
    });
  }
  if (saring.tingkat) butir.push({ label: `Tingkat: ${TINGKAT[saring.tingkat as Tingkat].nama}`, tanpa: { ...saring, tingkat: undefined } });
  if (saring.jenis) butir.push({ label: `Jenis: ${namaJenisMasalah(saring.jenis)}`, tanpa: { ...saring, jenis: undefined } });
  const jumlahSaring = [saring.status, saring.tingkat, saring.jenis].filter(Boolean).length;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Kepercayaan data</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Validasi data</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {r ? (
              <>
                <strong className="text-ink">{n(r.lahan_kosong_tertahan)}</strong> dari {n(r.lahan_kosong)} lahan kosong belum boleh
                ditawarkan resmi, karena {n(r.kritis_belum)} temuan kritis belum diputuskan. Data sumber tidak pernah diubah di sini:
                yang dicatat adalah keputusan Anda.
              </>
            ) : (
              "Temuan konflik data yang perlu diputuskan sebelum lahan ditawarkan resmi."
            )}
          </p>
          {r && (
            <p className="mt-1.5 text-xs leading-relaxed text-subtle">
              Sumber: {sumber.join("; ")}.{" "}
              {r.terakhir_diperiksa && `Terakhir diperiksa ${tanggal(r.terakhir_diperiksa)}.`}
            </p>
          )}
        </div>
        {bolehUbah(profil.data) && (
          <div className="shrink-0">
            <TombolPeriksaUlang />
          </div>
        )}
      </header>

      <PintasCari />
      <Form action="/validasi" className="relative mb-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted sm:max-w-sm">
          <span>
            Cari nomor SPBU, kode lahan, atau kota{" "}
            <kbd className="ml-1 hidden rounded border border-line bg-white px-1.5 font-sans text-[11px] font-semibold text-subtle sm:inline">/</kbd>
          </span>
          <input
            type="search"
            name="q"
            defaultValue={saring.q ?? ""}
            key={saring.q ?? ""}
            placeholder="mis. 3415138"
            className={kolomSaring}
          />
        </label>
        <details className="sm:relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle [&::-webkit-details-marker]:hidden">
            Saring{jumlahSaring > 0 ? ` (${jumlahSaring})` : ""}
          </summary>
          <div className="absolute inset-x-0 top-full z-20 mt-2 grid gap-3 rounded-xl border border-line bg-white p-4 shadow-card sm:inset-x-auto sm:right-0 sm:w-80">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Status
              <select name="status" defaultValue={saring.status ?? ""} key={`s-${saring.status ?? ""}`} className={kolomSaring}>
                <option value="">Belum diputuskan (bawaan)</option>
                {SARING_STATUS.filter((s) => s.nilai !== "belum").map((s) => (
                  <option key={s.nilai} value={s.nilai}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Tingkat
              <select name="tingkat" defaultValue={saring.tingkat ?? ""} key={`t-${saring.tingkat ?? ""}`} className={kolomSaring}>
                <option value="">Semua tingkat</option>
                {(Object.keys(TINGKAT) as Tingkat[]).map((t) => (
                  <option key={t} value={t}>
                    {TINGKAT[t].nama}: {TINGKAT[t].arti.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Jenis temuan
              <select name="jenis" defaultValue={saring.jenis ?? ""} key={`j-${saring.jenis ?? ""}`} className={kolomSaring}>
                <option value="">Semua jenis</option>
                {(r?.per_jenis ?? []).map((j) => (
                  <option key={j.jenis} value={j.jenis}>
                    {namaJenisMasalah(j.jenis)} ({n(j.belum)} belum diputuskan)
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong">
              Terapkan saringan
            </button>
          </div>
        </details>
        <button type="submit" className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong">
          Cari
        </button>
      </Form>

      {butir.length > 0 && (
        <ul aria-label="Saringan aktif" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {butir.map((b) => (
            <li key={b.label}>
              <Link
                href={alamat("/validasi", b.tanpa)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-ink hover:border-subtle"
              >
                {b.label}
                <span aria-hidden="true" className="text-subtle">
                  ×
                </span>
                <span className="sr-only">, lepas saringan ini</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/validasi" className={`${tautan} inline-flex min-h-11 items-center text-xs`}>
              Hapus semua
            </Link>
          </li>
        </ul>
      )}

      <BingkaiTabel lebarMin="min-w-[880px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Temuan
            </th>
            <th scope="col" className={th}>
              Tingkat
            </th>
            <th scope="col" className={th}>
              SPBU
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Peninjau
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && (
            <BarisKosong
              kolom={5}
              pesan={
                butir.length > 0
                  ? "Tidak ada temuan yang sesuai saringan. Lepas salah satu saringan di atas untuk melihat lebih banyak."
                  : "Tidak ada temuan yang menunggu keputusan. Semua lahan kosong boleh ditawarkan."
              }
            />
          )}
          {baris.map((b) => (
            <tr key={b.id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <th scope="row" className={`${td} text-left font-normal`}>
                <Link href={`/validasi/${b.id}`} className={tautan}>
                  {b.ringkasan}
                </Link>
                <p className="mt-0.5 text-xs text-subtle">
                  {namaJenisMasalah(b.jenis)}
                  {b.ada_lahan_kosong && b.tingkat !== "kritis" ? " · menyangkut lahan kosong" : ""}
                </p>
              </th>
              <td className={td}>
                <Lencana warna={WARNA[b.tingkat]}>{TINGKAT[b.tingkat].nama}</Lencana>
              </td>
              <td className={`${td} whitespace-nowrap`}>
                <Link href={`/lokasi/${b.spbu_id}`} className="text-ink underline-offset-2 hover:underline">
                  {b.spbu_nomor}
                </Link>
                <p className="text-xs text-subtle">{b.kota ?? b.provinsi ?? "–"}</p>
              </td>
              <td className={`${td} whitespace-nowrap text-muted`}>
                {STATUS_MASALAH[b.status]}
                {b.diputuskan && <p className="text-xs text-subtle">{tanggal(b.diputuskan)}</p>}
              </td>
              <td className={`${td} whitespace-nowrap text-muted`}>{b.peninjau_email ?? <span className="text-subtle">Belum ada</span>}</td>
            </tr>
          ))}
        </tbody>
      </BingkaiTabel>

      <Halaman
        halaman={halaman}
        total={total}
        satuan="temuan"
        href={(h) => alamat("/validasi", { ...saring, hal: h > 1 ? h : undefined })}
      />
    </>
  );
}
