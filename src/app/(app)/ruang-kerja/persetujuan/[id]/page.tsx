import DokumenPanel from "@/components/dokumen";
import { getDokumenPeluang } from "@/lib/data-dokumen";
import type { Metadata } from "next";
import { Suspense } from "react";
import Galeri from "@/components/galeri";
import PanelGalat from "@/components/panel-galat";
import { KeputusanDealer } from "@/components/portal";
import { Jejak, Lencana } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getKartuKeputusan, PENERIMA } from "@/lib/data-dealer";
import { daya, luas, n, rp, tanggal } from "@/lib/format";
import { PIHAK_SETUJU, SKEMA, STATUS_SETUJU, UUID } from "@/lib/istilah";
import { KESIAPAN } from "@/lib/status-lahan";

export const metadata: Metadata = { title: "Usulan tenant" };

type Props = PageProps<"/ruang-kerja/persetujuan/[id]">;

// Pola halaman: Detail / Record, berupa kartu keputusan. Siapa calon tenantnya, ruang mana, apa manfaat dan
// tuntutannya bagi SPBU, lalu satu keputusan. Bila organisasi tidak berwenang, tampil siapa penyetujunya.
export default function UsulanTenant({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={6} />}>
      <Isi params={params} />
    </Suspense>
  );
}

const judul = "text-lg font-bold text-ink";

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) return <TidakDitemukan apa="Usulan ini" />;
  const [hasil, hasilDokumen] = await Promise.all([getKartuKeputusan(id), getDokumenPeluang(id)]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Usulan ini" />;
  const k = hasil.data;
  const dokumen = hasilDokumen.data ?? {
    peran: null,
    boleh_unggah: null,
    dokumen: [],
  };
  const s = k.syarat;
  const milik = k.persetujuan.find((p) => p.pihak === "dealer");
  const hsse = k.persetujuan.find((p) => p.pihak === "hsse");
  const berwenang = k.hak.status === "dipastikan" && k.hak.dealer_berwenang;
  const bulanBayar = Math.max(0, s.lama_sewa_bulan - s.bebas_sewa_bulan);
  const untukSpbu = s.penerima_sewa === "pemilik_spbu" || s.penerima_sewa === "dibagi";

  return (
    <>
      <Jejak
        induk={[
          { href: "/ruang-kerja", nama: "SPBU Anda" },
          {
            href: `/ruang-kerja/spbu/${k.spbu.id}`,
            nama: `SPBU ${k.spbu.nomor}`,
          },
        ]}
        kini="Usulan tenant"
      />
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">{k.tenant.nama ?? "Calon tenant"}</h1>
        <p className="mt-2 text-base leading-relaxed text-muted">
          Ingin membuka usaha {k.tenant.segmen ?? "baru"} di ruang {k.lahan_kode}, SPBU {k.spbu.nomor}.
        </p>
        {milik && (
          <p className="mt-3">
            <Lencana warna={milik.status === "disetujui" ? "hijau" : milik.status === "menunggu" ? "biru" : "kuning"}>
              Keputusan SPBU: {STATUS_SETUJU[milik.status]?.toLowerCase()}
            </Lencana>
          </p>
        )}
      </header>

      <div className="grid max-w-2xl grid-cols-1 gap-8">
        <section>
          <h2 className={judul}>Siapa calon tenantnya</h2>
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-base shadow-card">
            <Baris nama="Jenis usaha" nilai={k.tenant.segmen ?? "Belum tercatat"} />
            <Baris
              nama="Pengalaman"
              nilai={
                k.tenant.baru
                  ? k.tenant.jumlah_gerai != null
                    ? `Belum pernah di SPBU; punya ${n(k.tenant.jumlah_gerai)} gerai di luar SPBU`
                    : "Belum pernah membuka usaha di SPBU"
                  : `Sudah menyewa di ${n(k.tenant.jaringan_spbu ?? 0)} SPBU lain`
              }
            />
            <Baris nama="Usaha yang sudah ada di SPBU Anda" nilai={k.usaha_ada.length > 0 ? k.usaha_ada.join(", ") : "Belum ada"} />
          </dl>
          {k.tenant.deskripsi && <p className="mt-3 text-sm leading-relaxed text-muted">{k.tenant.deskripsi}</p>}
        </section>

        <section>
          <h2 className={judul}>Ruang yang diusulkan</h2>
          {k.foto.length > 0 && (
            <div className="mt-3">
              <Galeri gambar={k.foto} subjek={`ruang ${k.lahan_kode}`} maks={3} kisi="grid-cols-3" />
            </div>
          )}
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-base shadow-card">
            <Baris nama="Luas" nilai={luas(k.ruang?.luas_m2)} />
            <Baris
              nama="Posisi"
              nilai={`${k.ruang?.posisi === "Diluar Bangunan" ? "Di luar bangunan" : "Di dalam bangunan"}${k.ruang?.lantai ? `, ${k.ruang.lantai}` : ""}`}
            />
            <Baris nama="Daya listrik" nilai={k.ruang?.daya_w != null ? daya(k.ruang.daya_w) : "Belum tercatat"} />
            <Baris nama="Kesiapan menurut pemeriksaan" nilai={KESIAPAN[k.kesiapan?.kesiapan ?? "belum_diketahui"]?.nama ?? "Belum diketahui"} />
            {k.kesiapan?.pembatasan && <Baris nama="Pembatasan keselamatan" nilai={k.kesiapan.pembatasan} />}
          </dl>
        </section>

        <section>
          <h2 className={judul}>Syarat dan manfaat bagi SPBU</h2>
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-base shadow-card">
            <Baris nama="Sewa per tahun" nilai={rp(s.sewa_tahunan)} />
            <Baris nama="Lama sewa" nilai={`${n(s.lama_sewa_bulan)} bulan${s.bebas_sewa_bulan > 0 ? `, bebas sewa ${n(s.bebas_sewa_bulan)} bulan` : ""}`} />
            <Baris
              nama="Skema"
              nilai={`${SKEMA[s.skema] ?? s.skema}${s.bagi_hasil_pct != null ? `, ${String(s.bagi_hasil_pct).replace(".", ",")}% dari omzet` : ""}`}
            />
            <Baris nama="Sewa dibayar kepada" nilai={`${PENERIMA[s.penerima_sewa] ?? "–"}${k.hak.bagi_hasil ? ` (${k.hak.bagi_hasil})` : ""}`} />
            <Baris nama="Sewa tetap selama masa sewa" nilai={rp((s.sewa_tahunan * bulanBayar) / 12)} />
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {untukSpbu
              ? "Menurut pengaturan yang sudah dipastikan untuk SPBU ini, sewa di atas diterima pemilik SPBU, seluruhnya atau sebagian. Angkanya dari syarat yang ditawarkan, belum pendapatan sampai kontrak berjalan."
              : "Menurut pengaturan yang sudah dipastikan untuk SPBU ini, sewa di atas diterima Pertamina. Manfaat bagi SPBU berupa bertambahnya layanan dan pengunjung; nilainya belum bisa dihitung."}
          </p>
          {s.catatan && <p className="mt-2 text-sm leading-relaxed text-muted">Catatan: {s.catatan}</p>}
        </section>

        {k.persetujuan.some((p) => p.pihak !== "dealer") && (
          <section>
            <h2 className={judul}>Keputusan pihak lain atas versi {s.versi}</h2>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-base shadow-card">
              {k.persetujuan
                .filter((p) => p.pihak !== "dealer")
                .map((p) => (
                  <li key={p.pihak} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="text-ink">{PIHAK_SETUJU[p.pihak]}</span>
                    <span className="text-muted">{STATUS_SETUJU[p.status]}</span>
                  </li>
                ))}
            </ul>
            {hsse?.status === "menunggu" && (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Persetujuan keselamatan (HSSE) belum terbit. Kontrak tidak bisa ditandatangani tanpanya.
              </p>
            )}
          </section>
        )}

        {dokumen.dokumen.length > 0 && (
          <section>
            <h2 className={`${judul} mb-3`}>Dokumen pendukung</h2>
            <DokumenPanel peluangId={k.peluang_id} data={dokumen} />
          </section>
        )}

        <section className="rounded-xl border border-line bg-white p-5 shadow-card">
          <h2 className={judul}>Keputusan Anda</h2>
          <div className="mt-3">
            {milik && milik.status !== "menunggu" ? (
              <p className="text-base leading-relaxed text-muted">
                Sudah diputuskan: <strong className="text-ink">{STATUS_SETUJU[milik.status]?.toLowerCase()}</strong> pada {tanggal(milik.diputuskan)}.{" "}
                {milik.alasan ?? ""}
              </p>
            ) : !berwenang ? (
              <p className="text-base leading-relaxed text-muted">
                Untuk SPBU ini, tenant baru disetujui oleh <strong className="text-ink">{k.hak.penyetuju ?? "pihak yang berwenang"}</strong>, bukan oleh
                organisasi Anda. Bila Anda punya keberatan atau masukan, sampaikan ke tim Non Fuel Retail Pertamina sebelum keputusan diambil.
              </p>
            ) : !k.tahap_persetujuan ? (
              <p className="text-base leading-relaxed text-muted">
                Usulan ini belum sampai tahap persetujuan. Keputusan Anda diminta setelah syaratnya selesai dibahas.
              </p>
            ) : k.peran_saya !== "dealer_admin" ? (
              <p className="text-base leading-relaxed text-muted">
                Keputusan atas nama organisasi diambil admin dealer. Minta admin organisasi Anda memutuskannya.
              </p>
            ) : (
              <KeputusanDealer id={k.peluang_id} versi={s.versi} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Baris({ nama, nilai }: { nama: string; nilai: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{nama}</dt>
      <dd className="font-semibold text-ink">{nilai}</dd>
    </div>
  );
}
