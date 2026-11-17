/* Foto disajikan rute /foto milik aplikasi; tidak lewat pengoptimal next/image. */
/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { MinatiLokasi } from "@/components/jelajah";
import PanelGalat from "@/components/panel-galat";
import { Halaman, Jejak, Lencana } from "@/components/tabel";
import { Rangka } from "@/components/ui";
import { getJelajah } from "@/lib/data-jelajah";
import { alamat, daya, luas, n, satu, tanggal } from "@/lib/format";
import { gambarSiap, urlGambar } from "@/lib/gambar";
import { KESIAPAN } from "@/lib/status-lahan";
import { namaTipe } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Jelajahi lokasi" };

type Props = PageProps<"/ruang-kerja/jelajah">;

// Pola halaman: List / Index. Ruang kosong yang sudah diverifikasi di wilayah yang dibuka untuk organisasi tenant ini.
export default function JelajahHalaman({ searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi searchParams={searchParams} />
    </Suspense>
  );
}

const kolom = "mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3.5 text-base font-normal text-ink focus:border-brand-blue";
const label = "block text-sm font-semibold text-ink";

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const provinsi = satu(sp.provinsi);
  const kota = satu(sp.kota);
  const posisi = satu(sp.posisi);
  const luasTeks = satu(sp.luas);
  const luasMin = luasTeks && /^\d{1,6}$/.test(luasTeks) ? Number(luasTeks) : undefined;
  const halaman = Math.max(1, Number(satu(sp.halaman)) || 1);
  const hasil = await getJelajah({ provinsi, kota, luasMin, posisi, halaman });
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const d = hasil.data ?? { akses: [], total: 0, halaman: 1, per_halaman: 12, kota: [], lokasi: [] };
  const adaSaring = Boolean(provinsi || kota || posisi || luasMin != null);
  const banyakProvinsi = d.akses.length > 1;
  const pilihanKota = d.kota.filter((k) => !provinsi || k.provinsi === provinsi).sort((a, b) => a.kota.localeCompare(b.kota));

  return (
    <>
      <Jejak induk={[{ href: "/ruang-kerja", nama: "Penawaran untuk Anda" }]} kini="Jelajahi lokasi" />
      <header className="mb-6 max-w-3xl">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Jelajahi lokasi</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {d.akses.length === 0
            ? "Ruang usaha kosong di SPBU Pertamina yang sudah diperiksa di lokasi."
            : `Ruang usaha kosong di SPBU Pertamina yang sudah diperiksa di lokasi, di ${d.akses.join(", ")}. Menyatakan minat tidak mengikat.`}
        </p>
      </header>

      {d.akses.length === 0 ? (
        <section className="max-w-2xl rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
          <h2 className="text-base font-bold text-ink">Penjelajah lokasi belum dibuka untuk organisasi Anda</h2>
          <p className="mt-2">
            Tim Non Fuel Retail Pertamina membuka penjelajah per wilayah. Hubungi kontak NFR Anda dan sebutkan wilayah yang Anda minati. Penawaran yang sudah
            dibagikan kepada Anda tetap ada di halaman penawaran.
          </p>
          <Link href="/ruang-kerja" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle">
            Lihat penawaran untuk Anda
          </Link>
        </section>
      ) : (
        <>
          <Form action="/ruang-kerja/jelajah" className="mb-6 grid max-w-4xl gap-4 rounded-xl border border-line bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
            {banyakProvinsi && (
              <label className={label}>
                Provinsi
                <select name="provinsi" defaultValue={provinsi ?? ""} className={kolom}>
                  <option value="">Semua yang dibuka</option>
                  {d.akses.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={label}>
              Kota
              <select name="kota" defaultValue={kota ?? ""} className={kolom}>
                <option value="">Semua kota</option>
                {pilihanKota.map((k) => (
                  <option key={`${k.provinsi}-${k.kota}`} value={k.kota}>
                    {k.kota}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Luas paling sedikit <span className="font-normal text-muted">(m²)</span>
              <input type="text" inputMode="numeric" name="luas" defaultValue={luasTeks ?? ""} className={kolom} />
            </label>
            <label className={label}>
              Letak ruang
              <select name="posisi" defaultValue={posisi ?? ""} className={kolom}>
                <option value="">Di dalam atau di luar</option>
                <option value="Didalam Bangunan">Di dalam bangunan</option>
                <option value="Diluar Bangunan">Di luar bangunan</option>
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong">
                Terapkan saringan
              </button>
              {adaSaring && (
                <Link href="/ruang-kerja/jelajah" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
                  Hapus saringan
                </Link>
              )}
            </div>
          </Form>

          {d.lokasi.length === 0 ? (
            <section className="max-w-2xl rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
              <h2 className="text-base font-bold text-ink">{adaSaring ? "Tidak ada ruang yang cocok dengan saringan ini" : "Belum ada ruang yang siap dijelajahi"}</h2>
              <p className="mt-2">
                {adaSaring
                  ? "Longgarkan saringannya, misalnya dengan mengosongkan luas paling sedikit."
                  : "Ruang baru tampil di sini setelah diperiksa di lokasi oleh pengelola SPBU dan tim Non Fuel Retail. Pemeriksaan di wilayah Anda masih berjalan."}
              </p>
              {adaSaring && (
                <Link href="/ruang-kerja/jelajah" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle">
                  Hapus saringan
                </Link>
              )}
            </section>
          ) : (
            <ul className="grid max-w-4xl gap-3">
              {d.lokasi.map((x) => (
                <li key={x.lahan_id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 rounded-xl border border-line bg-white p-3 shadow-card sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-4">
                  {gambarSiap && x.foto ? (
                    <img src={urlGambar(x.foto, true)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg border border-line bg-canvas object-cover" />
                  ) : (
                    <span className="grid aspect-[4/3] w-full place-items-center rounded-lg border border-line bg-canvas text-xs text-subtle">Belum ada foto</span>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-ink">
                      {luas(x.luas_m2)} di SPBU {x.spbu_nomor}, {x.kota ?? x.provinsi}
                    </h2>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{x.alamat ?? x.provinsi}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">
                      {x.posisi === "Diluar Bangunan" ? "Di luar bangunan" : "Di dalam bangunan"}
                      {x.daya_w ? ` · listrik ${daya(x.daya_w)}` : " · daya listrik belum tercatat"}
                      {x.jumlah_fasilitas > 0 ? ` · ${n(x.jumlah_fasilitas)} fasilitas SPBU` : ""}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      <Lencana warna={x.kesiapan === "siap" ? "hijau" : x.kesiapan === "belum_siap" ? "kuning" : "netral"}>
                        Kesiapan: {(KESIAPAN[x.kesiapan]?.nama ?? "belum diketahui").toLowerCase()}
                      </Lencana>
                      {x.tipe_lokasi && <Lencana>Lingkungan: {namaTipe(x.tipe_lokasi).toLowerCase()}</Lencana>}
                      {x.penduduk_3km != null && <span className="angka text-xs text-subtle">{n(x.penduduk_3km)} jiwa dalam 3 km</span>}
                    </p>
                    <div className="mt-3">
                      {x.penawaran_id ? (
                        <Link
                          href={`/ruang-kerja/penawaran/${x.penawaran_id}`}
                          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle"
                        >
                          Lihat penawaran untuk Anda
                        </Link>
                      ) : x.diminati ? (
                        <p className="text-sm font-semibold text-brand-green-strong">Minat organisasi Anda tercatat pada {tanggal(x.diminati)}.</p>
                      ) : (
                        <MinatiLokasi lahanId={x.lahan_id} lokasi={`ruang ${luas(x.luas_m2)} di SPBU ${x.spbu_nomor}`} />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="max-w-4xl">
            <Halaman
              halaman={d.halaman}
              total={d.total}
              perHalaman={d.per_halaman}
              satuan="ruang"
              href={(h) => alamat("/ruang-kerja/jelajah", { provinsi, kota, luas: luasMin, posisi, halaman: h > 1 ? h : undefined })}
            />
          </div>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-subtle">
            Yang tampil hanya ruang yang datanya sudah dicocokkan di lokasi. Syarat sewa tidak ditampilkan di sini; syarat disampaikan lewat penawaran resmi
            setelah tim Non Fuel Retail menindaklanjuti minat Anda.
          </p>
        </>
      )}
    </>
  );
}
