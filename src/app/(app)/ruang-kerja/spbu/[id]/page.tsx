/* Foto disajikan rute /foto milik aplikasi; tidak lewat pengoptimal next/image. */
/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TombolInspeksi } from "@/components/aksi-lahan";
import Galeri from "@/components/galeri";
import PanelGalat from "@/components/panel-galat";
import { KonfirmasiRuang } from "@/components/portal";
import { SurveiDealerDaftar } from "@/components/survei";
import { Jejak, Lencana, tautan } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getSpbuDealer, PENERIMA, POLA, type RuangDealer } from "@/lib/data-dealer";
import { getSurveiDealer } from "@/lib/data-survei";
import { daya, luas, n, tanggal } from "@/lib/format";
import { gambarSiap, urlGambar } from "@/lib/gambar";
import { KESIAPAN, STATUS_DATA, STATUS_INSPEKSI } from "@/lib/status-lahan";

export const metadata: Metadata = { title: "Ruang usaha SPBU" };

type Props = PageProps<"/ruang-kerja/spbu/[id]">;

// Pola halaman: Detail / Record. Satu SPBU: siapa yang berwenang, lalu ruang usahanya satu per satu.
// Dirancang untuk ponsel: satu kolom, tombol besar, satu keputusan per ruang.
export default function SpbuSaya({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={6} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const [hasil, hasilSurvei] = await Promise.all([getSpbuDealer(id), getSurveiDealer(id)]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="SPBU ini" />;
  const { spbu, hak, foto_spbu: foto, ruang } = hasil.data;
  const kosong = ruang.filter((r) => r.status_sumber === "Tersedia");
  const terisi = ruang.filter((r) => r.status_sumber !== "Tersedia");
  const survei = hasilSurvei.data ?? [];

  return (
    <>
      <Jejak induk={[{ href: "/ruang-kerja", nama: "SPBU Anda" }]} kini={`SPBU ${spbu.nomor}`} />
      <header className="mb-6 max-w-3xl">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">SPBU {spbu.nomor}</h1>
        <p className="mt-2 text-base leading-relaxed text-muted">{spbu.alamat ?? `${spbu.kota ?? ""}, ${spbu.provinsi}`}</p>
        <p className="mt-2 text-sm text-muted">
          {n(kosong.length)} ruang kosong, {n(terisi.length)} terisi.
        </p>
      </header>

      <div className="grid max-w-3xl grid-cols-1 gap-8">
        {foto.length > 0 && <Galeri gambar={foto} subjek={`SPBU ${spbu.nomor}`} maks={4} kisi="grid-cols-2 sm:grid-cols-4" />}

        {survei.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold text-ink">Survei lokasi yang akan datang</h2>
            <SurveiDealerDaftar daftar={survei} tampilSpbu={false} />
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold text-ink">Siapa yang memutuskan di SPBU ini</h2>
          {hak && hak.status === "dipastikan" ? (
            <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
              {(
                [
                  ["Pola pengelolaan", hak.pola ? POLA[hak.pola] : "–"],
                  ["Menyetujui tenant baru", hak.dealer_berwenang ? "Organisasi Anda" : (hak.penyetuju ?? "–")],
                  ["Menandatangani kontrak", hak.pihak_kontrak ?? "–"],
                  ["Sewa dibayar kepada", `${PENERIMA[hak.penerima_sewa ?? ""] ?? "–"}${hak.bagi_hasil ? ` (${hak.bagi_hasil})` : ""}`],
                ] as const
              ).map(([nama, nilai]) => (
                <div key={nama} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-muted">{nama}</dt>
                  <dd className="font-semibold text-ink">{nilai}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-muted shadow-card">
              Wewenang untuk SPBU ini belum dipastikan tim Non Fuel Retail. Sampai dipastikan, belum ada tenant baru yang bisa ditawarkan resmi di sini.
            </p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">Ruang kosong</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Pastikan tiap ruang memang bisa dipakai, lalu periksa kesiapannya. Ruang baru ditawarkan ke tenant setelah pemeriksaan Anda ditinjau tim Non Fuel
            Retail.
          </p>
          {kosong.length === 0 ? (
            <p className="mt-3 rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">Semua ruang di SPBU ini sudah terisi.</p>
          ) : (
            <ul className="mt-3 grid gap-4">
              {kosong.map((r) => (
                <KartuRuang key={r.lahan_id} r={r} />
              ))}
            </ul>
          )}
        </section>

        {terisi.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-ink">Ruang terisi</h2>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
              {terisi.map((r) => (
                <li key={r.lahan_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{r.outlet ?? "Outlet tidak tercatat"}</span>
                    <span className="block text-xs text-muted">
                      {r.segmen} · {r.kode}
                    </span>
                  </span>
                  <span className="angka text-xs text-subtle">{luas(r.luas_m2)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function KartuRuang({ r }: { r: RuangDealer }) {
  const ins = r.inspeksi;
  return (
    <li className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4">
        {gambarSiap && r.foto ? (
          <img src={urlGambar(r.foto, true)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg border border-line bg-canvas object-cover" />
        ) : (
          <span className="grid aspect-[4/3] w-full place-items-center rounded-lg border border-line bg-canvas text-xs text-subtle">Belum ada foto</span>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">{r.kode}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {luas(r.luas_m2)} · {r.posisi === "Diluar Bangunan" ? "di luar bangunan" : "di dalam bangunan"} · {r.daya_w != null ? daya(r.daya_w) : "daya belum tercatat"}
          </p>
          <p className="mt-2 flex flex-wrap gap-2">
            <Lencana warna={r.status_data === "terverifikasi" ? "hijau" : r.status_data === "disengketakan" ? "merah" : "netral"}>
              Data: {STATUS_DATA[r.status_data]?.nama.toLowerCase() ?? r.status_data}
            </Lencana>
            <Lencana warna={r.kesiapan === "siap" ? "hijau" : r.kesiapan === "belum_siap" ? "kuning" : "netral"}>
              Kesiapan: {KESIAPAN[r.kesiapan]?.nama.toLowerCase() ?? r.kesiapan}
            </Lencana>
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-sm font-semibold text-ink">Apakah ruang ini bisa dipakai tenant baru?</p>
        <KonfirmasiRuang lahanId={r.lahan_id} kode={r.kode} kini={r.konfirmasi} />
        {r.konfirmasi && (
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            Terakhir Anda konfirmasi {tanggal(r.konfirmasi_waktu)}
            {r.konfirmasi === "tidak_tersedia" && r.konfirmasi_catatan ? `: ${r.konfirmasi_catatan}` : "."}
          </p>
        )}
        {r.status_ruang !== "tersedia" && r.konfirmasi !== "tidak_tersedia" && (
          <p className="mt-2 text-xs leading-relaxed text-warn">Ruang ini sedang ditahan tim Non Fuel Retail: {r.alasan_ruang ?? "tanpa alasan tercatat"}.</p>
        )}
      </div>

      {r.konfirmasi !== "tidak_tersedia" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
          {ins && ["draf", "ditolak", "diajukan"].includes(ins.status) ? (
            <>
              <span className="text-muted">
                Pemeriksaan: {STATUS_INSPEKSI[ins.status]?.toLowerCase()}
                {ins.milik_saya ? "" : ` (${ins.pemeriksa ?? "orang lain"})`}.
              </span>
              <Link href={`/ruang-kerja/inspeksi/${ins.id}`} className={`${tautan} inline-flex min-h-11 items-center`}>
                {ins.milik_saya && ins.status !== "diajukan" ? "Lanjutkan pemeriksaan" : "Lihat pemeriksaan"}
              </Link>
            </>
          ) : (
            <TombolInspeksi lahanId={r.lahan_id} label={r.status_data === "terverifikasi" ? "Periksa ulang kesiapan" : "Periksa kesiapan ruang"} utama={r.status_data !== "terverifikasi"} dealer />
          )}
        </div>
      )}
    </li>
  );
}
