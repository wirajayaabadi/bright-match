import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DialogKeputusan, TombolTinjau } from "@/components/keputusan-masalah";
import PanelGalat from "@/components/panel-galat";
import SelFoto from "@/components/sel-foto";
import { BarisKosong, BingkaiTabel, Jejak, Lencana, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getGambarDaftar } from "@/lib/data-gambar";
import { getMasalahRinci, getProfilSaya } from "@/lib/data-validasi";
import { alamat, daya, luas, n, rp, satu, tanggal } from "@/lib/format";
import { namaTahap } from "@/lib/istilah";
import { bolehUbah, JENIS_MASALAH, PERISTIWA, STATUS_MASALAH, TINGKAT, type RincianMasalah, type SumberData } from "@/lib/validasi";

export const metadata: Metadata = { title: "Temuan data" };

type Props = PageProps<"/validasi/[id]">;

// Pola halaman: Detail / Record. Nama temuan, status dan metadata, lalu tab Bukti, Riwayat, dan Peluang terkait.
export default function TemuanData({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const TAB = [
  { nilai: "bukti", nama: "Bukti" },
  { nilai: "riwayat", nama: "Riwayat" },
  { nilai: "peluang", nama: "Peluang terkait" },
] as const;

async function Isi({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const nomor = Number(id);
  if (!Number.isInteger(nomor) || nomor <= 0) return <TidakDitemukan apa="Temuan ini" />;

  const [hasil, profil] = await Promise.all([getMasalahRinci(nomor), getProfilSaya()]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Temuan ini" />;

  const m = hasil.data;
  const jenis = JENIS_MASALAH[m.jenis];
  const tab = TAB.find((t) => t.nilai === satu(sp.tab))?.nilai ?? "bukti";
  const diputuskan = m.status === "selesai" || m.status === "diabaikan";
  const ubah = bolehUbah(profil.data);
  const jumlah = { bukti: null, riwayat: m.riwayat.length, peluang: m.peluang.length } as const;

  return (
    <>
      <Jejak induk={[{ href: "/validasi", nama: "Validasi data" }]} kini={m.lahan_kode ?? `SPBU ${m.spbu_nomor}`} />

      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
            {jenis?.nama ?? m.jenis}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{m.ringkasan}.</p>
          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <div className="flex items-center gap-2">
              <dt className="sr-only">Tingkat</dt>
              <dd>
                <Lencana warna={m.tingkat === "kritis" ? "merah" : m.tingkat === "sedang" ? "kuning" : "netral"}>
                  {TINGKAT[m.tingkat].nama}: {TINGKAT[m.tingkat].arti.toLowerCase()}
                </Lencana>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Status:</dt>
              <dd className="font-semibold text-ink">{STATUS_MASALAH[m.status]}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>SPBU:</dt>
              <dd>
                <Link href={`/lokasi/${m.spbu_id}`} className={tautan}>
                  {m.spbu_nomor}
                </Link>
                {m.kota ? `, ${m.kota}` : ""}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Peninjau:</dt>
              <dd>{m.peninjau_email ?? "belum ada"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Terdeteksi:</dt>
              <dd>
                {tanggal(m.pertama_terdeteksi)}, terakhir diperiksa {tanggal(m.terakhir_terdeteksi)}
              </dd>
            </div>
          </dl>
        </div>
        {ubah ? (
          <div className="flex shrink-0 flex-wrap items-start gap-3">
            {!diputuskan && m.status === "terbuka" && <TombolTinjau id={m.id} />}
            <DialogKeputusan id={m.id} mode={diputuskan ? "buka" : "putuskan"} />
          </div>
        ) : (
          <p className="max-w-xs text-sm text-subtle">Peran Anda hanya membaca. Keputusan diambil analis atau admin NFR.</p>
        )}
      </header>

      {diputuskan && (
        <section aria-label="Keputusan" className="mb-6 rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed shadow-card">
          <p className="font-bold text-ink">
            {m.status === "selesai" ? "Selesai" : "Diabaikan"} oleh {m.diputuskan_oleh ?? "–"} pada {tanggal(m.diputuskan)}
          </p>
          <p className="mt-1 text-muted">{m.keputusan}</p>
        </section>
      )}

      <nav aria-label="Bagian temuan" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TAB.map((t) => (
          <Link
            key={t.nilai}
            href={alamat(`/validasi/${m.id}`, { tab: t.nilai === "bukti" ? undefined : t.nilai })}
            aria-current={tab === t.nilai ? "page" : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap ${
              tab === t.nilai ? "border-brand-blue font-semibold text-brand-blue-strong" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.nama}
            {jumlah[t.nilai] != null && <span className="angka ml-1.5 text-xs text-subtle">{n(jumlah[t.nilai])}</span>}
          </Link>
        ))}
      </nav>

      {tab === "bukti" && <TabBukti m={m} />}
      {tab === "riwayat" && <TabRiwayat m={m} />}
      {tab === "peluang" && <TabPeluang m={m} />}
    </>
  );
}

const sumberNama = (sumber: SumberData[], kunci: string) => {
  const s = sumber.find((x) => x.kunci === kunci);
  return s ? `${s.nama}, per ${s.per_tanggal ? tanggal(s.per_tanggal) : "tanggal tidak tercatat"}` : kunci;
};

async function TabBukti({ m }: { m: RincianMasalah }) {
  const jenis = JENIS_MASALAH[m.jenis];
  const rekaman = m.bukti.rekaman ?? [];
  const kontrak = m.bukti.kontrak;
  const foto = await getGambarDaftar({ lahan: rekaman.map((r) => r.lahan_id) });

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid gap-x-8 gap-y-5 text-sm leading-relaxed lg:grid-cols-2">
        <div>
          <h2 className="font-bold text-ink">Dampak bagi bisnis</h2>
          <p className="mt-1 text-muted">{jenis?.dampak}</p>
        </div>
        <div>
          <h2 className="font-bold text-ink">Langkah yang disarankan</h2>
          <p className="mt-1 text-muted">{jenis?.tindakan}</p>
        </div>
      </div>

      {m.bukti.spbu && (
        <section>
          <h2 className="text-base font-bold text-ink">Menurut {sumberNama(m.sumber, "brightspace")}</h2>
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            {[
              ["Nomor SPBU", m.bukti.spbu.nomor],
              ["Alamat", m.bukti.spbu.alamat ?? "tidak tercatat"],
              ["Kota", m.bukti.spbu.kota ?? "tidak tercatat"],
              ["Provinsi", m.bukti.spbu.provinsi ?? "tidak tercatat"],
            ].map(([nama, nilai]) => (
              <div key={nama} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted">{nama}</dt>
                <dd className="text-right text-ink">{nilai}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {rekaman.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-ink">Menurut {sumberNama(m.sumber, "brightspace")}</h2>
          <p className="mt-1 text-sm text-muted">
            {rekaman.length > 1
              ? `${n(rekaman.length)} lahan memakai kode ${m.lahan_kode}. Foto membantu memastikan lahan mana yang dimaksud.`
              : "Rekaman lahan apa adanya dari sumber."}
          </p>
          <div className="mt-3">
            <BingkaiTabel lebarMin="min-w-[820px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={th}>
                    Foto
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={th}>
                    Outlet
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
                {rekaman.map((r) => (
                  <tr key={r.lahan_id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 align-top">
                      <SelFoto gambar={foto.lahan[r.lahan_id]} subjek={`lahan ${r.kode}`} />
                    </td>
                    <td className={td}>
                      <Lencana warna={r.status === "Tersedia" ? "biru" : "netral"}>{r.status === "Tersedia" ? "Kosong" : "Tersewa"}</Lencana>
                    </td>
                    <td className={`${td} text-ink`}>
                      {r.outlet || <span className="text-subtle">–</span>}
                      {r.segmen && r.status !== "Tersedia" && <p className="text-xs text-subtle">{r.segmen}</p>}
                    </td>
                    <td className={`${td} text-muted`}>{r.posisi ?? "–"}</td>
                    <td className={`${tdAngka} text-muted`}>{luas(r.luas_m2)}</td>
                    <td className={`${tdAngka} text-muted`}>{daya(r.daya_w)}</td>
                    <td className={`${tdAngka} text-muted`}>{r.tarif_tahunan != null ? rp(r.tarif_tahunan) : "–"}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {r.status === "Tersedia" && (
                        <Link href={`/kecocokan/lahan/${r.lahan_id}`} className={tautan}>
                          Buka kartu lahan
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </BingkaiTabel>
          </div>
        </section>
      )}

      {rekaman.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-ink">Menurut {sumberNama(m.sumber, "master")}</h2>
          {kontrak ? (
            <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
              {[
                ["Tenant", kontrak.tenant],
                ["Masa kontrak", `${tanggal(kontrak.mulai)} sampai ${tanggal(kontrak.akhir)}`],
                ["Nilai kontrak", kontrak.nilai != null ? rp(kontrak.nilai) : "tidak tercatat"],
                ["Baris di file master", kontrak.baris != null ? n(kontrak.baris) : "tidak tercatat"],
              ].map(([nama, nilai]) => (
                <div key={nama} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <dt className="shrink-0 text-muted">{nama}</dt>
                  <dd className="angka text-right text-ink">{nilai}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">
              File master tidak memuat kontrak untuk kode lahan ini.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function TabRiwayat({ m }: { m: RincianMasalah }) {
  if (m.riwayat.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-subtle shadow-card">
        Belum ada yang meninjau temuan ini. Riwayat muncul setelah temuan ditinjau atau diputuskan.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
      {m.riwayat.map((r) => (
        <li key={`${r.waktu}-${r.peristiwa}`} className="px-4 py-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-semibold text-ink">
              {PERISTIWA[r.peristiwa] ?? r.peristiwa}
              {r.data.status_ke && r.peristiwa === "masalah_diputuskan" ? `: ${STATUS_MASALAH[r.data.status_ke as keyof typeof STATUS_MASALAH] ?? r.data.status_ke}` : ""}
            </span>
            <span className="angka text-xs text-subtle">
              {tanggal(r.waktu)} · {r.oleh ?? "sistem"}
            </span>
          </p>
          {r.data.alasan && <p className="mt-1 leading-relaxed text-muted">{r.data.alasan}</p>}
        </li>
      ))}
    </ol>
  );
}

function TabPeluang({ m }: { m: RincianMasalah }) {
  return (
    <BingkaiTabel lebarMin="min-w-[560px]">
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className={th}>
            Peluang
          </th>
          <th scope="col" className={th}>
            Lahan
          </th>
          <th scope="col" className={th}>
            Tahap
          </th>
        </tr>
      </thead>
      <tbody>
        {m.peluang.length === 0 && <BarisKosong kolom={3} pesan="Belum ada peluang yang dibuat untuk lahan di temuan ini." />}
        {m.peluang.map((p) => (
          <tr key={p.id} className="border-b border-line last:border-b-0">
            <th scope="row" className={`${td} text-left font-normal`}>
              <Link href={`/pipeline/${p.id}`} className={tautan}>
                {p.pihak ?? "Pihak tidak tercatat"}
              </Link>
            </th>
            <td className={`${td} whitespace-nowrap text-muted`}>{p.lahan_kode}</td>
            <td className={`${td} text-muted`}>{namaTahap(p.tahap)}</td>
          </tr>
        ))}
      </tbody>
    </BingkaiTabel>
  );
}
