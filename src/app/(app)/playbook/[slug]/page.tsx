import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { Bagian, BingkaiTabel, Jejak, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, KartuAngka, Rangka, TidakDitemukan } from "@/components/ui";
import { getPlaybook } from "@/lib/data-tahap2";
import { daya, luas, n, pct, rp } from "@/lib/format";
import { PLAYBOOK, playbookDariSlug, SURVEI } from "@/lib/playbook";
import { artiTipe, namaTipe } from "@/lib/tipe-lokasi";

type Props = PageProps<"/playbook/[slug]">;

export function generateStaticParams() {
  return PLAYBOOK.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = playbookDariSlug((await params).slug);
  return { title: p ? `Playbook ${p.nama}` : "Playbook" };
}

export default function HalamanPlaybook({ params }: Props) {
  // `params` dibaca di dalam <Suspense> agar kerangka halaman bisa tampil seketika saat berpindah halaman.
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const p = playbookDariSlug((await params).slug);
  if (!p) return <TidakDitemukan apa="Playbook ini" />;

  return (
    <>
      <Jejak induk={[{ href: "/playbook", nama: "Playbook jenis usaha" }]} kini={p.nama} />
      <JudulHalaman label="Playbook jenis usaha" judul={p.nama} keterangan={p.ringkas} />

      <Suspense fallback={<Rangka baris={3} />}>
        <Statistik segmen={p.segmen} />
      </Suspense>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Bagian judul="Segmen pelanggan">
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {p.pelanggan.map((s) => (
              <li key={s.siapa} className="px-4 py-3 text-sm">
                <p className="font-semibold text-ink">{s.siapa}</p>
                <p className="mt-0.5 leading-relaxed text-muted">{s.kebutuhan}</p>
              </li>
            ))}
          </ul>
        </Bagian>

        <Bagian judul="Alur kunjungan di SPBU" keterangan={`Waktu singgah: ${p.waktuSinggah}`}>
          <ol className="space-y-2">
            {p.journey.map((l, i) => (
              <li key={l.judul} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-card">
                <span className="angka flex size-6 items-center justify-center rounded-full bg-brand-blue-soft text-xs font-bold text-brand-blue-strong">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold text-ink">{l.judul}</span>
                  <span className="mt-0.5 block leading-relaxed text-muted">{l.isi}</span>
                </span>
              </li>
            ))}
          </ol>
        </Bagian>
      </div>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Bagian judul="Yang perlu disiapkan">
          <Butir isi={p.kunci} />
        </Bagian>
        <Bagian judul="Risiko">
          <Butir isi={p.risiko} />
        </Bagian>
      </div>

      <Bagian judul="Bukti permintaan" keterangan={`${SURVEI}. Sebagian besar responden pengendara motor, dan 42,5% berasal dari Medan Raya.`}>
        {p.bukti.length > 0 ? (
          <Butir isi={p.bukti} />
        ) : (
          <p className="rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">
            Survei tidak menanyakan jenis usaha ini, jadi belum ada bukti permintaan dari konsumen.
          </p>
        )}
      </Bagian>

      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-subtle">
        Segmen pelanggan, alur kunjungan, dan daftar persiapan adalah usulan awal yang belum divalidasi lewat pengamatan
        lapangan atau wawancara tenant.
      </p>
    </>
  );
}

function Butir({ isi }: { isi: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 rounded-xl border border-line bg-white py-4 pr-4 pl-9 text-sm leading-relaxed text-muted shadow-card">
      {isi.map((b) => (
        <li key={b}>{b}</li>
      ))}
    </ul>
  );
}

/** Angka dari jaringan untuk satu jenis usaha: sebaran, kebutuhan ruang, tenant, dan tipe lokasi. */
async function Statistik({ segmen }: { segmen: string }) {
  const hasil = await getPlaybook();
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const s = (hasil.data ?? []).find((x) => x.segmen === segmen);
  if (!s) {
    return (
      <p className="rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">
        Belum ada lahan tersewa untuk jenis usaha ini di basis data.
      </p>
    );
  }

  const posisi = s.lahan_dalam + s.lahan_luar;
  const tipe = s.tipe_lokasi.filter((t) => t.spbu >= 5);
  const maksLift = Math.max(1, ...tipe.map((t) => t.lift));

  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuAngka label="Ada di" nilai={`${pct(s.spbu_pct)} SPBU`} catatan={`${n(s.lahan)} lahan di ${n(s.spbu)} SPBU, ${n(s.tenant)} tenant`} />
        <KartuAngka
          label="Luas yang biasa dipakai"
          nilai={luas(s.luas_median)}
          catatan={s.luas_p10 != null ? `Umumnya ${luas(s.luas_p10)} sampai ${luas(Math.round(s.luas_p90 ?? 0))}` : undefined}
        />
        <KartuAngka
          label="Sewa yang biasa dibayar"
          nilai={s.tarif_median != null ? `${rp(s.tarif_median)}/th` : "–"}
          catatan={s.tarif_p90 != null ? `Batas atas ${rp(s.tarif_p90)}/th` : undefined}
        />
        <KartuAngka
          label="Posisi lahan"
          nilai={posisi > 0 ? `${pct((100 * s.lahan_dalam) / posisi)} dalam` : "–"}
          catatan={`Di dalam bangunan; daya listrik median ${daya(s.daya_median)}`}
        />
      </dl>

      <Bagian
        judul="Tipe lokasi yang cocok"
        keterangan="Seberapa sering jenis usaha ini hadir di tiap tipe lokasi, dibanding kehadirannya di seluruh jaringan. Di atas 1× berarti lebih sering."
      >
        <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
          {tipe.map((t) => (
            <li key={t.tipe_lokasi} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[15rem_minmax(0,1fr)_auto]">
              <span>
                <span className="font-semibold text-ink">{namaTipe(t.tipe_lokasi)}</span>
                <span className="block text-xs leading-relaxed text-subtle sm:hidden">{artiTipe(t.tipe_lokasi)}</span>
              </span>
              <span aria-hidden="true" className="col-span-2 row-start-2 h-2 rounded-full bg-canvas sm:col-span-1 sm:row-start-auto">
                <span
                  className={`block h-2 rounded-full ${t.lift >= 1 ? "bg-brand-blue" : "bg-subtle/50"}`}
                  style={{ width: `${(100 * t.lift) / maksLift}%` }}
                />
              </span>
              <span className="angka col-start-2 row-start-1 text-right text-muted sm:col-start-auto sm:row-start-auto sm:w-56">
                <strong className="text-ink">{t.lift.toFixed(2).replace(".", ",")}×</strong> · ada di {pct(t.pct_di_tipe)} SPBU tipe ini
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-subtle">
          Rata-rata jaringan: {pct(s.spbu_pct)} SPBU. Tipe lokasi diperkirakan dari data terbuka dan belum diuji
          lapangan; tipe dengan kurang dari lima SPBU tidak ditampilkan.
        </p>
      </Bagian>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Bagian judul="Tenant terbesar">
          <BingkaiTabel lebarMin="min-w-0">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  Tenant
                </th>
                <th scope="col" className={thKanan}>
                  SPBU
                </th>
              </tr>
            </thead>
            <tbody>
              {s.tenant_teratas.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className={`${td} text-left font-normal`}>
                    <Link href={`/tenant/${t.id}`} className={tautan}>
                      {t.nama}
                    </Link>
                  </th>
                  <td className={`${tdAngka} text-muted`}>{n(t.spbu)}</td>
                </tr>
              ))}
            </tbody>
          </BingkaiTabel>
        </Bagian>

        <Bagian judul="Provinsi terbanyak">
          <BingkaiTabel lebarMin="min-w-0">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  Provinsi
                </th>
                <th scope="col" className={thKanan}>
                  Lahan
                </th>
              </tr>
            </thead>
            <tbody>
              {s.provinsi_teratas.map((p) => (
                <tr key={p.provinsi} className="border-b border-line last:border-b-0">
                  <th scope="row" className={`${td} text-left font-medium text-ink`}>
                    {p.provinsi}
                  </th>
                  <td className={`${tdAngka} text-muted`}>{n(p.lahan)}</td>
                </tr>
              ))}
            </tbody>
          </BingkaiTabel>
        </Bagian>
      </div>
    </>
  );
}
