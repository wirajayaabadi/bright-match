import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ubahStatusCalon } from "@/app/aksi";
import LahanCocok from "@/components/lahan-cocok";
import PanelGalat from "@/components/panel-galat";
import { PilihWilayah } from "@/components/saring";
import { CatatanVersi } from "@/components/skor";
import { Bagian, Jejak, Lencana, tautan } from "@/components/tabel";
import { JudulHalaman, Rangka, TidakDitemukan } from "@/components/ui";
import { getKecocokanCalon } from "@/lib/data-tahap3";
import { daya, luas, n, rp, satu, tanggal } from "@/lib/format";
import { KANAL, namaJenisUsaha, namaTahap, POSISI, STATUS_CALON, UUID } from "@/lib/istilah";

export const metadata: Metadata = { title: "Calon tenant" };

type Props = PageProps<"/pipeline/calon/[id]">;

export default function ProfilCalon({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Isi({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) return <TidakDitemukan apa="Calon tenant ini" />;
  const saring = { provinsi: satu(sp.provinsi), kota: satu(sp.kota) };
  const hasil = await getKecocokanCalon(id, saring);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Calon tenant ini" />;

  const { calon: c, wilayah, peluang, lahan } = hasil.data;
  const kandidat = lahan[0]?.jumlah_kandidat ?? 0;
  const sudah = Object.fromEntries(peluang.map((p) => [p.lahan_id, p.id]));
  const rentang =
    c.luas_min != null || c.luas_maks != null
      ? `${c.luas_min != null ? luas(c.luas_min) : "0 m²"} – ${c.luas_maks != null ? luas(c.luas_maks) : "tanpa batas"}`
      : "Tidak disebut";

  return (
    <>
      <Jejak
        induk={[
          { href: "/pipeline", nama: "Pipeline" },
          { href: "/pipeline/calon", nama: "Calon tenant" },
        ]}
        kini={c.nama_usaha}
      />
      <JudulHalaman
        label={`${namaJenisUsaha(c.segmen)} · ${KANAL[c.kanal] ?? c.kanal}`}
        judul={c.nama_usaha}
        keterangan={c.deskripsi ?? undefined}
      />

      <div className="grid gap-x-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-bold text-ink">Profil</h2>
          <dl className="mt-4 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            <Butir nama="Kontak" nilai={[c.kontak_nama, c.kontak_email, c.kontak_telepon].filter(Boolean).join(" · ")} />
            <Butir nama="Asal" nilai={c.asal === "internasional" ? `Luar negeri${c.negara ? ` (${c.negara})` : ""}` : "Indonesia"} />
            <Butir nama="Jumlah gerai saat ini" nilai={c.jumlah_gerai != null ? n(c.jumlah_gerai) : "Tidak disebut"} />
            <Butir nama="Target pasar" nilai={c.target_pasar ?? "Tidak disebut"} />
            <Butir nama="Terdaftar" nilai={`${tanggal(c.dibuat)} oleh ${c.dibuat_oleh}`} />
            {c.catatan && <Butir nama="Catatan" nilai={c.catatan} />}
          </dl>
          <form action={ubahStatusCalon} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={c.id} />
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Status
              <select
                name="status"
                defaultValue={c.status}
                key={c.status}
                className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink"
              >
                {Object.entries(STATUS_CALON).map(([nilai, nama]) => (
                  <option key={nilai} value={nilai}>
                    {nama}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="min-h-10 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle">
              Simpan status
            </button>
          </form>
        </section>

        <section className="mt-10 lg:mt-0">
          <h2 className="text-lg font-bold text-ink">Kebutuhan lokasi</h2>
          <dl className="mt-4 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            <Butir nama="Luas" nilai={rentang} />
            <Butir nama="Posisi" nilai={POSISI[c.posisi].id} />
            <Butir nama="Daya listrik minimum" nilai={c.daya_min != null ? daya(c.daya_min) : "Tidak disebut"} />
            <Butir nama="Anggaran sewa" nilai={c.anggaran_tahunan != null ? `${rp(c.anggaran_tahunan)}/th` : "Tidak disebut"} />
            <Butir nama="Provinsi" nilai={c.provinsi_minat.length > 0 ? c.provinsi_minat.join(", ") : "Semua provinsi"} />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            Halaman hasil untuk calon ini:{" "}
            <Link href={`/daftar/${c.token}`} className={tautan}>
              buka tautan publik
            </Link>
            . Tautan itu bisa dibagikan kepada calon; isinya hanya lahan kosong yang cocok.
          </p>
        </section>
      </div>

      {peluang.length > 0 && (
        <Bagian judul="Peluang untuk calon ini">
          <ul className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            {peluang.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/pipeline/${p.id}`} className={tautan}>
                  {p.lahan_kode} · SPBU {p.spbu_nomor}, {p.kota ?? "–"}
                </Link>
                <Lencana warna={p.tahap === "kontrak" ? "hijau" : "biru"}>{namaTahap(p.tahap)}</Lencana>
              </li>
            ))}
          </ul>
        </Bagian>
      )}

      <Bagian
        judul="Lahan kosong yang cocok"
        keterangan={
          lahan.length > 0
            ? `${n(lahan.length)} lahan teratas dari ${n(kandidat)} yang memenuhi kebutuhan di atas. Kebutuhan calon dipakai apa adanya, tanpa toleransi.`
            : undefined
        }
      >
        <Form action={`/pipeline/calon/${c.id}`} className="mb-4 flex flex-wrap items-end gap-3">
          <PilihWilayah wilayah={wilayah} provinsi={saring.provinsi} kota={saring.kota} />
        </Form>
        {lahan.length === 0 ? (
          <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-subtle shadow-card">
            Tidak ada lahan kosong yang memenuhi semua kebutuhan calon ini di wilayah yang dipilih.
          </p>
        ) : (
          <LahanCocok lahan={lahan} calonId={c.id} peluang={sudah} />
        )}
        <CatatanVersi />
      </Bagian>
    </>
  );
}

function Butir({ nama, nilai }: { nama: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-muted">{nama}</dt>
      <dd className="text-right text-ink">{nilai}</dd>
    </div>
  );
}
