import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { Bagian, BarisKosong, BingkaiTabel, Jejak, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, KartuAngka, Rangka, TidakDitemukan } from "@/components/ui";
import { getProfilTenant } from "@/lib/data-tahap1";
import { daya, luas, n, pct, rp, tanggal } from "@/lib/format";

export const metadata: Metadata = { title: "Profil tenant" };

type Props = PageProps<"/tenant/[id]">;

export default function HalamanTenant({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const hasil = await getProfilTenant(id);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Tenant ini" />;

  const { tenant: t, segmen, provinsi, kota, kontrak } = hasil.data;
  const totalPosisi = t.lahan_dalam + t.lahan_luar;

  return (
    <>
      <Jejak induk={[{ href: "/tenant", nama: "Profil tenant" }]} kini={t.nama} />
      <JudulHalaman
        label={t.segmen_utama}
        judul={t.nama}
        keterangan={`Menyewa ${n(t.lahan)} lahan di ${n(t.spbu)} SPBU, tersebar di ${n(t.kota)} kota dan ${n(t.provinsi)} provinsi.`}
      />

      <Link
        href={`/kecocokan/tenant/${t.id}`}
        className="mb-8 inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white transition-colors hover:bg-brand-blue-strong"
      >
        Cari lahan kosong yang cocok
      </Link>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuAngka label="SPBU" nilai={n(t.spbu)} catatan={`${n(t.lahan)} lahan tersewa`} />
        <KartuAngka
          label="Luas yang biasa dipakai"
          nilai={luas(t.luas_median)}
          catatan={t.luas_p10 != null ? `Umumnya ${luas(t.luas_p10)} sampai ${luas(t.luas_p90)}` : "Luas tidak tercatat"}
        />
        <KartuAngka
          label="Tarif yang biasa dibayar"
          nilai={t.tarif_median != null ? `${rp(t.tarif_median)}/th` : "–"}
          catatan={
            t.tarif_p90 != null
              ? `Batas atas ${rp(t.tarif_p90)}/th, dari ${n(t.lahan_bertarif)} lahan bertarif`
              : "Tarif tidak tercatat"
          }
        />
        <KartuAngka
          label="Kontrak berakhir ≤ 90 hari"
          nilai={n(t.kontrak_segera)}
          catatan={`${n(t.kontrak_lewat)} kontrak sudah lewat tanggal di file master`}
        />
      </dl>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Bagian
          judul="Kebutuhan lokasi"
          keterangan="Diturunkan dari lahan yang sedang disewa, bukan dari pernyataan tenant. Dipakai Mesin kecocokan sebagai syarat."
        >
          <dl className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            <Butir nama="Posisi" nilai={
              totalPosisi > 0
                ? `${pct((100 * t.lahan_dalam) / totalPosisi)} di dalam bangunan, ${pct((100 * t.lahan_luar) / totalPosisi)} di luar`
                : "–"
            } />
            <Butir nama="Luas" nilai={t.luas_p10 != null ? `${luas(t.luas_p10)} – ${luas(t.luas_p90)} (median ${luas(t.luas_median)})` : "–"} />
            <Butir nama="Daya listrik" nilai={t.daya_median != null ? `median ${daya(t.daya_median)}` : "Tidak tercatat"} />
            <Butir
              nama="Tarif sewa"
              nilai={t.tarif_median != null ? `median ${rp(t.tarif_median)}/th, batas atas ${rp(t.tarif_p90)}/th` : "Tidak tercatat"}
            />
            <Butir nama="Wilayah operasi" nilai={`${n(t.provinsi)} provinsi, ${n(t.kota)} kota`} />
          </dl>
        </Bagian>

        <Bagian judul="Jenis usaha">
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {segmen.map((s) => (
              <li key={s.segmen} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-ink">{s.segmen}</span>
                <span className="angka text-muted">
                  {n(s.lahan)} lahan <span className="text-subtle">({pct((100 * s.lahan) / Math.max(1, t.lahan))})</span>
                </span>
              </li>
            ))}
          </ul>
        </Bagian>
      </div>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Bagian judul="Sebaran per provinsi">
          <BingkaiTabel lebarMin="min-w-0">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  Provinsi
                </th>
                <th scope="col" className={thKanan}>
                  Lahan
                </th>
                <th scope="col" className={thKanan}>
                  SPBU
                </th>
                <th scope="col" className={thKanan}>
                  Kota
                </th>
              </tr>
            </thead>
            <tbody>
              {provinsi.map((p) => (
                <tr key={p.provinsi} className="border-b border-line last:border-b-0">
                  <th scope="row" className={`${td} text-left font-medium text-ink`}>
                    {p.provinsi}
                  </th>
                  <td className={`${tdAngka} text-muted`}>{n(p.lahan)}</td>
                  <td className={`${tdAngka} text-muted`}>{n(p.spbu)}</td>
                  <td className={`${tdAngka} text-muted`}>{n(p.kota)}</td>
                </tr>
              ))}
            </tbody>
          </BingkaiTabel>
        </Bagian>

        <Bagian judul="Sepuluh kota terbanyak">
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {kota.map((k) => (
              <li key={`${k.provinsi}-${k.kota}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  <span className="text-ink">{k.kota ?? "Kota tidak tercatat"}</span>
                  <span className="block text-xs text-subtle">{k.provinsi}</span>
                </span>
                <span className="angka text-muted">{n(k.lahan)} lahan</span>
              </li>
            ))}
          </ul>
        </Bagian>
      </div>

      <Bagian
        judul="Kontrak yang berakhir paling dekat"
        keterangan="Sepuluh kontrak berikutnya menurut file master. Kontrak yang hampir habis adalah momen menawarkan lahan tambahan."
      >
        <BingkaiTabel>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>
                Kode lahan
              </th>
              <th scope="col" className={th}>
                SPBU
              </th>
              <th scope="col" className={th}>
                Kota
              </th>
              <th scope="col" className={th}>
                Jenis usaha
              </th>
              <th scope="col" className={thKanan}>
                Tarif/tahun
              </th>
              <th scope="col" className={thKanan}>
                Berakhir
              </th>
            </tr>
          </thead>
          <tbody>
            {kontrak.length === 0 && <BarisKosong kolom={6} pesan="Tidak ada kontrak dengan tanggal berakhir di masa depan." />}
            {kontrak.map((k) => (
              <tr key={k.kode} className="border-b border-line last:border-b-0">
                <th scope="row" className={`${td} text-left font-medium whitespace-nowrap text-ink`}>
                  {k.kode}
                </th>
                <td className={td}>
                  <Link href={`/lokasi/${k.spbu_id}`} className={tautan}>
                    SPBU {k.spbu_nomor}
                  </Link>
                </td>
                <td className={`${td} text-muted`}>{k.kota ?? "–"}</td>
                <td className={`${td} text-muted`}>{k.segmen}</td>
                <td className={`${tdAngka} text-muted`}>{k.tarif_tahunan != null ? rp(k.tarif_tahunan) : "–"}</td>
                <td className={`${tdAngka} font-semibold text-ink`}>{tanggal(k.kontrak_akhir)}</td>
              </tr>
            ))}
          </tbody>
        </BingkaiTabel>
      </Bagian>
    </>
  );
}

function Butir({ nama, nilai }: { nama: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-muted">{nama}</dt>
      <dd className="angka text-right text-ink">{nilai}</dd>
    </div>
  );
}
