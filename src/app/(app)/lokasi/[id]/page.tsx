import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PanelLingkungan } from "@/components/lingkungan";
import PetaSekitar from "@/components/peta-sekitar";
import PanelGalat from "@/components/panel-galat";
import { Bagian, BarisKosong, BingkaiTabel, Jejak, Lencana, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, KartuAngka, Rangka, TidakDitemukan } from "@/components/ui";
import { getPetaSpbu } from "@/lib/data-peta";
import { getProfilSpbu } from "@/lib/data-tahap1";
import { daya, luas, n, pct, rp, tanggal } from "@/lib/format";

export const metadata: Metadata = { title: "Profil SPBU" };

type Props = PageProps<"/lokasi/[id]">;

export default function ProfilLokasi({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

/** Peta dimuat terpisah agar profil SPBU tidak menunggu ratusan titik tempat. */
async function BagianPeta({ id }: { id: string }) {
  const hasil = await getPetaSpbu(id);
  if (hasil.galat?.jenis === "skema-belum-ada") {
    return (
      <Bagian judul="Peta sekitar SPBU">
        <p className="rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">
          Peta belum dipasang di basis data. Jalankan <code>npm run db:schema</code>, lalu <code>npm run db:lingkungan</code>.
        </p>
      </Bagian>
    );
  }
  // SPBU tanpa koordinat yang layak tidak punya peta; penjelasannya sudah ada di bagian Lingkungan sekitar.
  if (hasil.galat || !hasil.data) return null;
  return (
    <Bagian
      judul="Peta sekitar SPBU"
      keterangan="Tempat usaha dan fasilitas dalam 1 km dari Overture Maps. Pilih satu kelompok untuk menyorotnya di peta dan melihat yang terdekat."
    >
      <PetaSekitar data={hasil.data} />
    </Bagian>
  );
}

const brightspace = (spbuId: string, lahanId: string) =>
  `https://brightspace.pertamina.com/detail/lahan?id=${encodeURIComponent(spbuId)}&lahanId=${encodeURIComponent(lahanId)}`;

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const hasil = await getProfilSpbu(id);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="SPBU ini" />;

  const { spbu, ringkasan: r, lahan, area, bauran_kota: bauran, lingkungan, poi } = hasil.data;
  const kosong = lahan.filter((l) => l.status === "Tersedia");
  const tersewa = lahan.filter((l) => l.status === "Tersewa");
  const okupansi = r.lahan > 0 ? (100 * r.lahan_tersewa) / r.lahan : null;
  // Jenis usaha yang ada di minimal 30% SPBU sekota tetapi belum ada di sini.
  const celah = bauran.segmen.filter((s) => !s.ada && bauran.spbu_di_kota > 0 && s.spbu / bauran.spbu_di_kota >= 0.3);

  return (
    <>
      <Jejak induk={[{ href: "/lokasi", nama: "Profil lokasi" }]} kini={`SPBU ${spbu.nomor}`} />
      <JudulHalaman
        label={[spbu.kota, spbu.provinsi].filter(Boolean).join(" · ")}
        judul={`SPBU ${spbu.nomor}`}
        keterangan={spbu.alamat ?? undefined}
      />

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuAngka label="Lahan kosong" nilai={n(r.lahan_kosong)} catatan={`dari ${n(r.lahan)} lahan`} />
        <KartuAngka label="Okupansi" nilai={pct(okupansi)} catatan={`${n(r.lahan_tersewa)} lahan tersewa`} />
        <KartuAngka
          label="Potensi sewa per tahun"
          nilai={r.potensi_sewa_bertarif > 0 ? rp(r.potensi_sewa_bertarif) : "–"}
          catatan="Dari lahan kosong yang tarifnya tercantum"
        />
        <KartuAngka label="Tenant" nilai={n(r.tenant)} catatan="Sedang menyewa di SPBU ini" />
      </dl>

      <Bagian
        judul="Lahan kosong"
        keterangan="Pilih satu lahan untuk melihat jenis usaha dan tenant yang cocok."
      >
        <BingkaiTabel>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>
                Kode lahan
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
            {kosong.length === 0 && <BarisKosong kolom={6} pesan="SPBU ini tidak punya lahan kosong." />}
            {kosong.map((l) => (
              <tr key={l.lahan_id} className="border-b border-line last:border-b-0">
                <th scope="row" className={`${td} text-left font-semibold whitespace-nowrap text-ink`}>
                  {l.kode}
                </th>
                <td className={`${td} text-muted`}>
                  {l.posisi ?? "–"}
                  <span className="text-subtle"> · {l.lantai ?? "–"}</span>
                </td>
                <td className={`${tdAngka} text-muted`}>{luas(l.luas_m2)}</td>
                <td className={`${tdAngka} text-muted`}>{daya(l.daya_w)}</td>
                <td className={`${tdAngka} font-semibold text-ink`}>
                  {l.tarif_tahunan != null ? rp(l.tarif_tahunan) : "–"}
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <Link href={`/kecocokan/lahan/${l.lahan_id}`} className={tautan}>
                    Cari tenant cocok
                  </Link>
                  <a
                    href={brightspace(spbu.id, l.lahan_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-4 text-xs text-subtle underline-offset-2 hover:underline"
                  >
                    Brightspace
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </BingkaiTabel>
      </Bagian>

      <Bagian judul="Tenant yang sudah ada">
        <BingkaiTabel>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>
                Tenant
              </th>
              <th scope="col" className={th}>
                Jenis usaha
              </th>
              <th scope="col" className={th}>
                Kode lahan
              </th>
              <th scope="col" className={thKanan}>
                Luas
              </th>
              <th scope="col" className={thKanan}>
                Tarif/tahun
              </th>
              <th scope="col" className={thKanan}>
                Kontrak berakhir
              </th>
            </tr>
          </thead>
          <tbody>
            {tersewa.length === 0 && <BarisKosong kolom={6} pesan="Belum ada lahan yang tersewa." />}
            {tersewa.map((l) => (
              <tr key={l.lahan_id} className="border-b border-line last:border-b-0">
                <th scope="row" className={`${td} text-left font-normal`}>
                  {l.tenant_id ? (
                    <Link href={`/tenant/${l.tenant_id}`} className={tautan}>
                      {l.tenant}
                    </Link>
                  ) : (
                    <span className="text-subtle">Nama tenant tidak tercatat</span>
                  )}
                </th>
                <td className={`${td} text-muted`}>{l.segmen}</td>
                <td className={`${td} whitespace-nowrap text-muted`}>{l.kode}</td>
                <td className={`${tdAngka} text-muted`}>{luas(l.luas_m2)}</td>
                <td className={`${tdAngka} text-muted`}>{l.tarif_tahunan != null ? rp(l.tarif_tahunan) : "–"}</td>
                <td className={`${tdAngka} text-muted`}>{tanggal(l.kontrak_akhir)}</td>
              </tr>
            ))}
          </tbody>
        </BingkaiTabel>
      </Bagian>

      <Suspense fallback={null}>
        <BagianPeta id={spbu.id} />
      </Suspense>

      <Bagian
        judul="Lingkungan sekitar"
        keterangan="Dihitung dari data terbuka di sekitar koordinat SPBU. Tipe lokasi dipakai Mesin kecocokan untuk menilai jenis usaha yang cocok."
      >
        <PanelLingkungan l={lingkungan} poi={poi} />
      </Bagian>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Bagian
          judul="Bauran jenis usaha"
          keterangan={
            bauran.spbu_di_kota > 0
              ? `Dibandingkan dengan ${n(bauran.spbu_di_kota)} SPBU di ${spbu.kota ?? "kota ini"}.`
              : undefined
          }
        >
          {celah.length > 0 && (
            <p className="mb-3 rounded-lg bg-brand-blue-soft px-3.5 py-2.5 text-sm leading-relaxed text-brand-blue-strong">
              Umum di kota ini tetapi belum ada di SPBU ini: <strong>{celah.map((s) => s.segmen).join(", ")}</strong>.
            </p>
          )}
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {bauran.segmen.length === 0 && <li className="px-4 py-6 text-sm text-subtle">Belum ada data pembanding.</li>}
            {bauran.segmen.map((s) => (
              <li key={s.segmen} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-ink">{s.segmen}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="angka text-xs text-subtle">
                    {pct((100 * s.spbu) / Math.max(1, bauran.spbu_di_kota))} SPBU sekota
                  </span>
                  <Lencana warna={s.ada ? "hijau" : "netral"}>{s.ada ? "Ada di sini" : "Belum ada"}</Lencana>
                </span>
              </li>
            ))}
          </ul>
        </Bagian>

        <div>
          <Bagian judul="Fasilitas">
            {spbu.fasilitas.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {spbu.fasilitas.map((f) => (
                  <li key={f} className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink">
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">Fasilitas SPBU ini belum tercatat di Brightspace.</p>
            )}
          </Bagian>

          <Bagian judul="Catatan lingkungan di Brightspace">
            {area.length > 0 ? (
              <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
                {area.map((a) => (
                  <li key={`${a.nama}-${a.jarak_km}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      <span className="text-ink">{a.nama}</span>
                      {a.keterangan && <span className="block text-xs text-subtle">{a.keterangan}</span>}
                    </span>
                    <span className="angka shrink-0 text-xs text-subtle">
                      {a.jarak_km != null ? `${String(a.jarak_km).replace(".", ",")} km` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">Brightspace belum mencatat lingkungan sekitar SPBU ini.</p>
            )}
          </Bagian>

          <Bagian judul="Lokasi">
            {spbu.lat != null && spbu.lng != null ? (
              <p className="text-sm text-muted">
                <span className="angka">
                  {spbu.lat.toFixed(5)}, {spbu.lng.toFixed(5)}
                </span>
                {" · "}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${spbu.lat},${spbu.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className={tautan}
                >
                  Buka di Google Maps
                </a>
              </p>
            ) : (
              <p className="text-sm text-subtle">Koordinat SPBU ini belum tercatat.</p>
            )}
          </Bagian>
        </div>
      </div>
    </>
  );
}
