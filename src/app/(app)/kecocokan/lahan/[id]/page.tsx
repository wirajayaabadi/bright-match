import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Galeri from "@/components/galeri";
import { PanelLingkungan } from "@/components/lingkungan";
import KeyakinanData from "@/components/keyakinan-data";
import PanelGalat from "@/components/panel-galat";
import PeringatanData from "@/components/peringatan-data";
import StatusLahanPanel from "@/components/status-lahan";
import { CatatanVersi, RincianSkor, Skor } from "@/components/skor";
import { Bagian, Jejak, Lencana, tautan } from "@/components/tabel";
import TombolPeluang from "@/components/tombol-peluang";
import { JudulHalaman, KartuAngka, Rangka, TidakDitemukan } from "@/components/ui";
import { getGambarLahan } from "@/lib/data-gambar";
import { getKecocokanLahan } from "@/lib/data-tahap1";
import { daya, luas, n, pct, rp } from "@/lib/format";
import { gambarSiap } from "@/lib/gambar";

export const metadata: Metadata = { title: "Kartu rekomendasi lahan" };

type Props = PageProps<"/kecocokan/lahan/[id]">;

export default function KartuLahan({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const [hasil, hasilFoto] = await Promise.all([getKecocokanLahan(id), getGambarLahan(id)]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Lahan kosong ini" />;
  // Foto bersifat pelengkap: bila gagal dimuat, kartu tetap tampil tanpa foto.
  const foto = hasilFoto.data ?? { lahan: [], spbu: [] };

  const { lahan: l, lingkungan, jenis_usaha: jenis, tenant } = hasil.data;
  const totalPembanding = jenis[0]?.total ?? 0;
  const tingkat = jenis[0]?.tingkat === "kota" ? (l.kota ?? "kota ini") : l.provinsi;
  const maks = Math.max(1, ...jenis.map((j) => j.n));
  const kandidat = tenant[0]?.jumlah_kandidat ?? 0;

  return (
    <>
      <Jejak
        induk={[
          { href: "/kecocokan", nama: "Mesin kecocokan" },
          { href: `/lokasi/${l.spbu_id}`, nama: `SPBU ${l.spbu_nomor}` },
        ]}
        kini={l.kode}
      />
      <JudulHalaman
        label={`Kartu rekomendasi · ${[l.kota, l.provinsi].filter(Boolean).join(", ")}`}
        judul={`Lahan ${l.kode}`}
        keterangan={l.alamat ?? undefined}
      />

      <Suspense fallback={null}>
        <PeringatanData lahanId={l.lahan_id} />
      </Suspense>

      <div className="mb-6">
        <Suspense fallback={<Rangka baris={1} />}>
          <StatusLahanPanel lahanId={l.lahan_id} />
        </Suspense>
        <div className="mt-4">
          <Suspense fallback={null}>
            <KeyakinanData lahanId={l.lahan_id} />
          </Suspense>
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuAngka label="Luas" nilai={luas(l.luas_m2)} catatan={l.kelas ? `Kelas ${l.kelas}` : "Luas belum tercatat"} />
        <KartuAngka label="Posisi" nilai={l.posisi === "Diluar Bangunan" ? "Luar" : "Dalam"} catatan={`${l.posisi ?? "–"} · ${l.lantai ?? "–"}`} />
        <KartuAngka label="Daya listrik" nilai={daya(l.daya_w)} catatan={l.daya_w == null ? "Belum tercatat" : undefined} />
        <KartuAngka
          label="Tarif per tahun"
          nilai={l.tarif_tahunan != null ? rp(l.tarif_tahunan) : "–"}
          catatan={l.tarif_tahunan == null ? "Tarif belum tercantum" : undefined}
        />
      </dl>

      {gambarSiap && foto.lahan.length + foto.spbu.length > 0 && (
        <Bagian judul="Foto" keterangan="Foto dari Brightspace. Pilih satu foto untuk memperbesarnya.">
          <div className="grid gap-5">
            {foto.lahan.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Lahan ini</h3>
                <Galeri gambar={foto.lahan} subjek={`lahan ${l.kode}`} />
              </div>
            )}
            {foto.spbu.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">SPBU {l.spbu_nomor}</h3>
                <Galeri gambar={foto.spbu} subjek={`SPBU ${l.spbu_nomor}`} />
              </div>
            )}
          </div>
        </Bagian>
      )}

      <Bagian judul="Lingkungan SPBU">
        <PanelLingkungan l={lingkungan} ringkas />
      </Bagian>

      <Bagian
        judul="Jenis usaha yang cocok"
        keterangan={
          totalPembanding > 0
            ? `Berdasarkan ${n(totalPembanding)} lahan tersewa di ${tingkat} dengan kelas ukuran dan posisi yang sama. Angka “×” menunjukkan seberapa sering jenis usaha itu hadir di SPBU bertipe lokasi sama dibanding seluruh jaringan.`
            : "Belum ada lahan sejenis yang tersewa sebagai pembanding, misalnya karena luas lahan ini belum tercatat."
        }
      >
        {jenis.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {jenis.map((j) => (
              <li key={j.segmen} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[14rem_minmax(0,1fr)_auto_auto]">
                <span>
                  <span className="font-semibold text-ink">{j.segmen}</span>
                  {j.lift_tipe != null && (
                    <span className="angka block text-xs text-subtle">
                      {j.lift_tipe.toFixed(2).replace(".", ",")}× di tipe lokasi ini
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className="col-span-2 row-start-2 h-2 rounded-full bg-canvas sm:col-span-1 sm:row-start-auto">
                  <span className="block h-2 rounded-full bg-brand-blue" style={{ width: `${(100 * j.n) / maks}%` }} />
                </span>
                <span className="angka col-span-2 text-muted sm:col-span-1 sm:w-36 sm:text-right">
                  {n(j.n)} lahan ({pct((100 * j.n) / Math.max(1, j.total))})
                </span>
                <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                  <Lencana warna={j.sudah_ada ? "netral" : "biru"}>{j.sudah_ada ? "Sudah ada di SPBU" : "Belum ada di SPBU"}</Lencana>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bagian>

      <Bagian
        judul="Tenant yang cocok"
        keterangan={
          tenant.length > 0
            ? `${n(tenant.length)} tenant ditampilkan dari ${n(kandidat)} yang lolos syarat wajib, paling banyak lima per jenis usaha. Semuanya sudah beroperasi di ${l.provinsi} dan belum ada di SPBU ini.`
            : undefined
        }
      >
        {tenant.length === 0 ? (
          <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-subtle shadow-card">
            Tidak ada tenant yang lolos syarat wajib untuk lahan ini. Coba periksa data luas, daya, dan tarif lahannya.
          </p>
        ) : (
          <ol className="space-y-3">
            {tenant.map((p) => (
              <li key={p.tenant_id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 rounded-xl border border-line bg-white p-4 shadow-card">
                <Skor nilai={p.skor} />
                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/tenant/${p.tenant_id}`} className={`${tautan} text-base`}>
                      {p.tenant}
                    </Link>
                    <Lencana>{p.segmen}</Lencana>
                    <span className="angka text-xs text-subtle">{n(p.tenant_spbu)} SPBU di jaringan</span>
                    <span className="ml-auto flex items-center gap-3">
                      <Link
                        href={`/penawaran/${l.lahan_id}?tenant=${p.tenant_id}`}
                        className="text-xs font-semibold text-brand-blue-strong underline-offset-2 hover:underline"
                      >
                        Kartu penawaran
                      </Link>
                      <TombolPeluang lahanId={l.lahan_id} tenantId={p.tenant_id} skor={p.skor} />
                    </span>
                  </div>
                  <div className="mt-2">
                    <RincianSkor p={p} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <CatatanVersi />
      </Bagian>
    </>
  );
}
