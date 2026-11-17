import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import PintasCari from "@/components/pintas-cari";
import { kolomSaring } from "@/components/saring";
import { BarisKosong, BingkaiTabel, Halaman, Lencana, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { Rangka } from "@/components/ui";
import { getInspeksiDaftar } from "@/lib/data-status";
import { alamat, n, pct, satu, tanggal } from "@/lib/format";
import { labelPilihan, SARING_INSPEKSI, STATUS_INSPEKSI } from "@/lib/status-lahan";

export const metadata: Metadata = { title: "Kesiapan lahan" };

type Props = PageProps<"/inspeksi">;

// Pola halaman: List / Index. Antrean inspeksi lokasi, yang menunggu tinjauan di urutan teratas.
export default function KesiapanLahan({ searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi searchParams={searchParams} />
    </Suspense>
  );
}

const WARNA: Record<string, "biru" | "kuning" | "hijau" | "netral"> = { diajukan: "biru", ditolak: "kuning", diterima: "hijau", draf: "netral" };

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = {
    q: satu(sp.q),
    status: SARING_INSPEKSI.some((s) => s.nilai === satu(sp.status)) ? satu(sp.status) : undefined,
  };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);
  const daftar = await getInspeksiDaftar({ cari: saring.q, status: saring.status, halaman });
  if (daftar.galat) return <PanelGalat galat={daftar.galat} />;
  const { total, baris, ringkasan: r } = daftar.data ?? { total: 0, baris: [], ringkasan: null };

  const butir: { label: string; tanpa: typeof saring }[] = [];
  if (saring.q) butir.push({ label: `Cari: ${saring.q}`, tanpa: { ...saring, q: undefined } });
  if (saring.status) {
    butir.push({ label: `Status: ${SARING_INSPEKSI.find((s) => s.nilai === saring.status)?.label}`, tanpa: { ...saring, status: undefined } });
  }

  return (
    <>
      <header className="mb-6 max-w-3xl">
        <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Kepercayaan data</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Kesiapan lahan</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {r ? (
            <>
              <strong className="text-ink">{n(r.terverifikasi)}</strong> dari {n(r.lahan_kosong)} lahan kosong sudah terverifikasi lewat
              inspeksi lokasi ({pct((100 * r.terverifikasi) / Math.max(1, r.lahan_kosong))}), {n(r.siap)} di antaranya siap dipakai.{" "}
              {r.menunggu > 0 ? `${n(r.menunggu)} inspeksi menunggu tinjauan.` : "Tidak ada inspeksi yang menunggu tinjauan."}
            </>
          ) : (
            "Inspeksi lokasi yang memverifikasi lahan kosong sebelum ditawarkan resmi."
          )}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-subtle">
          Inspeksi dimulai dari kartu lahan:{" "}
          <Link href="/kecocokan" className={tautan}>
            pilih lahan kosong di Mesin kecocokan
          </Link>
          .
        </p>
      </header>

      <PintasCari />
      <Form action="/inspeksi" className="relative mb-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted sm:max-w-sm">
          <span>
            Cari nomor SPBU atau kode lahan{" "}
            <kbd className="ml-1 hidden rounded border border-line bg-white px-1.5 font-sans text-[11px] font-semibold text-subtle sm:inline">/</kbd>
          </span>
          <input type="search" name="q" defaultValue={saring.q ?? ""} key={saring.q ?? ""} placeholder="mis. 3415138" className={kolomSaring} />
        </label>
        <details className="sm:relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle [&::-webkit-details-marker]:hidden">
            Saring{saring.status ? " (1)" : ""}
          </summary>
          <div className="absolute inset-x-0 top-full z-20 mt-2 grid gap-3 rounded-xl border border-line bg-white p-4 shadow-card sm:inset-x-auto sm:right-0 sm:w-80">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Status inspeksi
              <select name="status" defaultValue={saring.status ?? ""} key={`s-${saring.status ?? ""}`} className={kolomSaring}>
                <option value="">Sedang berjalan (bawaan)</option>
                {SARING_INSPEKSI.filter((s) => s.nilai !== "berjalan").map((s) => (
                  <option key={s.nilai} value={s.nilai}>
                    {s.label}
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
                href={alamat("/inspeksi", b.tanpa)}
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
            <Link href="/inspeksi" className={`${tautan} inline-flex min-h-11 items-center text-xs`}>
              Hapus semua
            </Link>
          </li>
        </ul>
      )}

      <BingkaiTabel lebarMin="min-w-[820px]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Lahan
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Kesimpulan
            </th>
            <th scope="col" className={thKanan}>
              Foto
            </th>
            <th scope="col" className={th}>
              Pemeriksa
            </th>
            <th scope="col" className={thKanan}>
              Terakhir diubah
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && (
            <BarisKosong
              kolom={6}
              pesan={
                butir.length > 0
                  ? "Tidak ada inspeksi yang sesuai saringan. Lepas saringan di atas untuk melihat lebih banyak."
                  : "Belum ada inspeksi yang berjalan. Mulai dari kartu lahan kosong di Mesin kecocokan."
              }
            />
          )}
          {baris.map((b) => (
            <tr key={b.id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <th scope="row" className={`${td} text-left font-normal`}>
                <Link href={`/inspeksi/${b.id}`} className={tautan}>
                  {b.lahan_kode}
                </Link>
                <p className="mt-0.5 text-xs text-subtle">SPBU {b.spbu_nomor}</p>
              </th>
              <td className={td}>
                <Lencana warna={WARNA[b.status] ?? "netral"}>{STATUS_INSPEKSI[b.status] ?? b.status}</Lencana>
              </td>
              <td className={`${td} text-muted`}>{b.hasil ? labelPilihan("hasil", b.hasil) : <span className="text-subtle">Belum diisi</span>}</td>
              <td className={`${tdAngka} text-muted`}>{n(b.foto)}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{b.pemeriksa_email ?? "–"}</td>
              <td className={`${tdAngka} text-muted`}>{tanggal(b.diubah)}</td>
            </tr>
          ))}
        </tbody>
      </BingkaiTabel>

      <Halaman halaman={halaman} total={total} satuan="inspeksi" href={(h) => alamat("/inspeksi", { ...saring, hal: h > 1 ? h : undefined })} />
    </>
  );
}
