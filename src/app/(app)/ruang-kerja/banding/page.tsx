/* Foto disajikan rute /foto milik aplikasi; tidak lewat pengoptimal next/image. */
/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import PilihBanding from "@/components/pilih-banding";
import { Jejak, Lencana } from "@/components/tabel";
import { Rangka } from "@/components/ui";
import { TINGKAT_KEYAKINAN } from "@/lib/data-kecocokan";
import { type BarisPenawaranTenant, getBanding, type PenawaranBanding, STATUS_TENANT } from "@/lib/data-portal";
import { daya, luas, n, rp, tanggal } from "@/lib/format";
import { gambarSiap, urlGambar } from "@/lib/gambar";
import { SKEMA, UUID } from "@/lib/istilah";
import { KESIAPAN } from "@/lib/status-lahan";
import { ATRIBUSI_LINGKUNGAN, namaTipe } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Bandingkan lokasi" };

type Props = PageProps<"/ruang-kerja/banding">;

// Pola halaman: Detail. Dua atau tiga penawaran dibaca berdampingan; tidak ada yang diubah di sini.
export default function BandingHalaman({ searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi searchParams={searchParams} />
    </Suspense>
  );
}

/** Satu sel banding. `nilai` hanya untuk baris yang digambar sebagai batang. */
type Sel = { teks: string; catatan?: string; nilai?: number | null; tautan?: { href: string; teks: string } };
type Baris = { nama: string; sel: Sel[]; batang?: boolean; skala?: number };
type Kelompok = { judul: string; sumber: string; baris: Baris[] };

const HURUF = ["A", "B", "C"];
const uang = (v: number | null | undefined) => (v == null ? "–" : v < 0 ? `rugi ${rp(-v)}` : rp(v));
const koma = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

function susun(daftar: PenawaranBanding[]): Kelompok[] {
  const tiap = (f: (p: PenawaranBanding) => Sel) => daftar.map(f);
  return [
    {
      judul: "Ruang dan SPBU",
      sumber: "Data Brightspace; kesiapan dari pemeriksaan lokasi",
      baris: [
        { nama: "Luas ruang", batang: true, sel: tiap((p) => ({ teks: p.ruang?.luas_m2 != null ? luas(p.ruang.luas_m2) : "Belum tercatat", nilai: p.ruang?.luas_m2 })) },
        { nama: "Daya listrik", batang: true, sel: tiap((p) => ({ teks: p.ruang?.daya_w ? daya(p.ruang.daya_w) : "Belum tercatat", nilai: p.ruang?.daya_w || null })) },
        {
          nama: "Letak ruang",
          sel: tiap((p) => ({
            teks: !p.ruang?.posisi ? "Belum tercatat" : p.ruang.posisi === "Diluar Bangunan" ? "Di luar bangunan" : "Di dalam bangunan",
            catatan: p.ruang?.lantai ? (/^lantai/i.test(p.ruang.lantai) ? p.ruang.lantai : `Lantai ${p.ruang.lantai}`) : undefined,
          })),
        },
        {
          nama: "Kesiapan ruang",
          sel: tiap((p) => {
            const k = KESIAPAN[p.kesiapan?.kesiapan ?? "belum_diketahui"] ?? KESIAPAN.belum_diketahui;
            return { teks: k.nama, catatan: k.arti };
          }),
        },
        {
          nama: "Fasilitas SPBU",
          sel: tiap((p) => {
            const f = p.spbu.fasilitas ?? [];
            return f.length === 0 ? { teks: "Belum tercatat" } : { teks: `${n(f.length)} fasilitas`, catatan: f.slice(0, 4).join(", ") + (f.length > 4 ? ", dan lainnya" : "") };
          }),
        },
      ],
    },
    {
      judul: "Syarat sewa",
      sumber: "Penawaran yang berlaku",
      baris: [
        { nama: "Sewa per tahun", batang: true, sel: tiap((p) => ({ teks: rp(p.syarat.sewa_tahunan), nilai: p.syarat.sewa_tahunan, catatan: `Penawaran versi ${p.syarat.versi}` })) },
        {
          nama: "Sewa per m² per bulan",
          batang: true,
          sel: tiap((p) => {
            const v = p.ruang?.luas_m2 ? p.syarat.sewa_tahunan / 12 / p.ruang.luas_m2 : null;
            return v == null ? { teks: "Tidak bisa dihitung", catatan: "Luas ruang belum tercatat" } : { teks: rp(v), nilai: v, catatan: "Hitungan: sewa dibagi luas" };
          }),
        },
        { nama: "Lama sewa", sel: tiap((p) => ({ teks: `${n(p.syarat.lama_sewa_bulan)} bulan` })) },
        { nama: "Masa bebas sewa", sel: tiap((p) => ({ teks: p.syarat.bebas_sewa_bulan > 0 ? `${n(p.syarat.bebas_sewa_bulan)} bulan` : "Tidak ada" })) },
        { nama: "Deposit", sel: tiap((p) => ({ teks: p.syarat.deposit ? rp(p.syarat.deposit) : "Tidak ada" })) },
        {
          nama: "Skema",
          sel: tiap((p) => ({
            teks: SKEMA[p.syarat.skema] ?? p.syarat.skema,
            catatan: p.syarat.bagi_hasil_pct ? `Bagi hasil ${koma(p.syarat.bagi_hasil_pct)}% dari omzet` : undefined,
          })),
        },
      ],
    },
    {
      judul: "Lingkungan dan persaingan",
      sumber: ATRIBUSI_LINGKUNGAN,
      baris: [
        { nama: "Tipe lokasi", sel: tiap((p) => ({ teks: p.lingkungan ? namaTipe(p.lingkungan.tipe_lokasi) : "Belum terhitung" })) },
        { nama: "Penduduk dalam 3 km", batang: true, sel: tiap((p) => ({ teks: p.lingkungan ? `${n(p.lingkungan.penduduk_3km)} jiwa` : "Belum terhitung", nilai: p.lingkungan?.penduduk_3km })) },
        { nama: "Tempat usaha dalam 1 km", batang: true, sel: tiap((p) => ({ teks: p.lingkungan ? `${n(p.lingkungan.poi_1km)} tempat` : "Belum terhitung", nilai: p.lingkungan?.poi_1km })) },
        {
          nama: "Usaha sejenis di SPBU ini",
          sel: tiap((p) => {
            const ada = (p.usaha_ada ?? []).filter(Boolean);
            const sejenis = p.segmen != null && ada.includes(p.segmen);
            return {
              teks: sejenis ? "Sudah ada" : "Belum ada",
              catatan: ada.length > 0 ? `Usaha yang ada: ${ada.join(", ")}` : "Belum ada penyewa tercatat di SPBU ini",
            };
          }),
        },
      ],
    },
    {
      judul: "Kecocokan dan mutu data",
      sumber: "Hitungan Bright Match. Skor bukan perkiraan omzet atau jaminan keberhasilan",
      baris: [
        {
          nama: "Skor kecocokan",
          batang: true,
          skala: 100,
          sel: tiap((p) => (p.kecocokan?.skor != null ? { teks: `${n(p.kecocokan.skor)} dari 100`, nilai: p.kecocokan.skor } : { teks: "Belum dihitung" })),
        },
        {
          nama: "Keyakinan data",
          sel: tiap((p) =>
            p.keyakinan
              ? { teks: TINGKAT_KEYAKINAN[p.keyakinan.tingkat].nama, catatan: `${p.keyakinan.terpenuhi} dari ${p.keyakinan.total} butir data terpenuhi` }
              : { teks: "Belum dinilai" },
          ),
        },
      ],
    },
    {
      judul: "Hitungan kelayakan Anda",
      sumber: "Skenario dasar dari versi terbaru yang Anda simpan di studio kelayakan. Hanya organisasi Anda yang melihatnya",
      baris: [
        {
          nama: "Skenario",
          sel: tiap((p) =>
            p.kelayakan
              ? {
                  teks: `Versi ${p.kelayakan.versi}: ${p.kelayakan.nama}`,
                  catatan:
                    `Disimpan ${tanggal(p.kelayakan.dibuat)}` +
                    (p.kelayakan.penawaran_versi !== p.syarat.versi ? `. Dihitung dengan syarat versi ${p.kelayakan.penawaran_versi}, kini versi ${p.syarat.versi}` : ""),
                  tautan: { href: `/ruang-kerja/penawaran/${p.id}/kelayakan`, teks: "Buka studio" },
                }
              : { teks: "Belum dihitung", tautan: { href: `/ruang-kerja/penawaran/${p.id}/kelayakan`, teks: "Hitung kelayakan" } },
          ),
        },
        { nama: "Laba operasi per bulan", sel: tiap((p) => ({ teks: p.kelayakan?.dasar?.laba_operasi != null ? uang(p.kelayakan.dasar.laba_operasi) : "–" })) },
        {
          nama: "Balik modal",
          sel: tiap((p) => ({
            teks: !p.kelayakan?.dasar ? "–" : p.kelayakan.dasar.balik_modal_bulan != null ? `${koma(p.kelayakan.dasar.balik_modal_bulan)} bulan` : "Tidak dalam masa sewa",
          })),
        },
        { nama: "Arus kas bersih di akhir masa sewa", sel: tiap((p) => ({ teks: p.kelayakan?.dasar?.kumulatif_akhir != null ? uang(p.kelayakan.dasar.kumulatif_akhir) : "–" })) },
      ],
    },
  ];
}

const pilihan = (p: BarisPenawaranTenant) => ({
  id: p.id,
  judul: `SPBU ${p.spbu_nomor}, ${p.kota ?? p.provinsi ?? ""}`,
  rinci: `${luas(p.luas_m2)} · ${rp(p.sewa_tahunan)} per tahun`,
  berakhir: p.status === "berakhir",
});

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const mentah = sp.id == null ? [] : Array.isArray(sp.id) ? sp.id : [sp.id];
  const diminta = [...new Set(mentah.filter((x) => UUID.test(x)))];
  const hasil = await getBanding(diminta);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const { daftar, banding, sumber } = hasil.data ?? { daftar: [], banding: [], sumber: [] };
  const kepala = (
    <>
      <Jejak induk={[{ href: "/ruang-kerja", nama: "Penawaran untuk Anda" }]} kini="Bandingkan lokasi" />
      <header className="mb-6 max-w-3xl">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Bandingkan lokasi</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Lihat dua atau tiga penawaran berdampingan. Halaman ini hanya menyandingkan angka yang ada; tidak ada peringkat, karena yang terbaik bergantung pada
          usaha Anda.
        </p>
      </header>
    </>
  );

  if (daftar.length < 2)
    return (
      <>
        {kepala}
        <section className="max-w-2xl rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
          <h2 className="text-base font-bold text-ink">{daftar.length === 0 ? "Belum ada penawaran untuk dibandingkan" : "Baru ada satu penawaran"}</h2>
          <p className="mt-2">Banding butuh paling sedikit dua penawaran. Halaman ini terisi begitu tim Non Fuel Retail membagikan penawaran berikutnya.</p>
          <Link
            href={daftar.length === 1 ? `/ruang-kerja/penawaran/${daftar[0].id}` : "/ruang-kerja"}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle"
          >
            {daftar.length === 1 ? "Lihat penawaran itu" : "Kembali ke penawaran"}
          </Link>
        </section>
      </>
    );

  const terpilih = banding.map((p) => p.id);
  const pemilih = <PilihBanding key={terpilih.join(",")} pilihan={daftar.map(pilihan)} terpilih={terpilih} />;

  if (banding.length < 2)
    return (
      <>
        {kepala}
        <section className="max-w-4xl">
          <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm font-medium text-warn">Pilih paling sedikit dua lokasi untuk dibandingkan.</p>
          {pemilih}
        </section>
      </>
    );

  const kelompok = susun(banding);
  return (
    <>
      {kepala}
      {diminta.length > banding.length && (
        <p className="mb-4 max-w-3xl rounded-lg bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
          {diminta.length > 3 ? "Paling banyak tiga lokasi sekaligus; yang tampil tiga pilihan pertama." : "Sebagian pilihan tidak ditemukan di penawaran Anda, jadi tidak ditampilkan."}
        </p>
      )}
      {daftar.length > 2 && (
        <details className="mb-6 max-w-4xl rounded-xl border border-line bg-white shadow-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-brand-blue-strong">Ganti lokasi yang dibandingkan</summary>
          <div className="border-t border-line px-4 py-4">{pemilih}</div>
        </details>
      )}

      {/* Layar lebar: satu tabel, satu kolom per lokasi. */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[22%]" />
            {banding.map((p) => (
              <col key={p.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-line align-top">
              <th scope="col" className="px-4 py-4 text-left text-xs font-semibold tracking-wide text-subtle uppercase">
                Yang dibandingkan
              </th>
              {banding.map((p, i) => (
                <th key={p.id} scope="col" className="px-4 py-4 text-left font-normal">
                  <KartuLokasi p={p} huruf={HURUF[i]} />
                </th>
              ))}
            </tr>
          </thead>
          {kelompok.map((k) => (
            <tbody key={k.judul}>
              <tr className="border-b border-line bg-canvas/60">
                <th scope="colgroup" colSpan={banding.length + 1} className="px-4 py-2.5 text-left">
                  <span className="text-xs font-bold tracking-wide text-ink uppercase">{k.judul}</span>
                  <span className="ml-2 text-xs font-normal text-subtle">{k.sumber}</span>
                </th>
              </tr>
              {k.baris.map((b) => {
                const maks = b.skala ?? Math.max(0, ...b.sel.map((s) => s.nilai ?? 0));
                return (
                  <tr key={b.nama} className="border-b border-line align-top last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                      {b.nama}
                    </th>
                    {b.sel.map((s, i) => (
                      <td key={i} className="px-4 py-3">
                        <IsiSel s={s} batang={b.batang} maks={maks} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {/* Layar sempit: lokasi di atas, lalu tiap hal dengan satu baris per lokasi. */}
      <div className="md:hidden">
        <ul className="grid gap-3">
          {banding.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-line bg-white p-3 shadow-card">
              <KartuLokasi p={p} huruf={HURUF[i]} datar />
            </li>
          ))}
        </ul>
        {kelompok.map((k) => (
          <section key={k.judul} className="mt-7">
            <h2 className="text-base font-bold text-ink">{k.judul}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-subtle">{k.sumber}</p>
            <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-white shadow-card">
              {k.baris.map((b) => {
                const maks = b.skala ?? Math.max(0, ...b.sel.map((s) => s.nilai ?? 0));
                return (
                  <div key={b.nama} className="px-4 py-3">
                    <h3 className="text-sm font-semibold text-muted">{b.nama}</h3>
                    <ul className="mt-2 grid gap-2.5">
                      {b.sel.map((s, i) => (
                        <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 text-sm">
                          <Huruf h={HURUF[i]} />
                          <IsiSel s={s} batang={b.batang} maks={maks} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-subtle">
        Panjang batang menunjukkan besar angka dibanding lokasi lain di halaman ini, bukan penilaian baik atau buruk.
        {sumber.length > 0 && ` Sumber data: ${sumber.map((s) => (s.per_tanggal ? `${s.nama} per ${tanggal(s.per_tanggal)}` : s.nama)).join("; ")}.`}
      </p>
    </>
  );
}

function Huruf({ h }: { h: string }) {
  return (
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">
      {h}
    </span>
  );
}

/** Kepala satu lokasi: foto, nama, status, dan jalan ke penawarannya. */
function KartuLokasi({ p, huruf, datar = false }: { p: PenawaranBanding; huruf: string; datar?: boolean }) {
  const foto = p.foto_lahan?.[0];
  return (
    <div className={datar ? "grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3" : "grid gap-3"}>
      {gambarSiap && foto ? (
        <img src={urlGambar(foto.kunci, true)} alt="" loading="lazy" className="aspect-[4/3] w-full max-w-64 rounded-lg border border-line bg-canvas object-cover" />
      ) : (
        <span className="grid aspect-[4/3] w-full max-w-64 place-items-center rounded-lg border border-line bg-canvas text-xs text-subtle">Belum ada foto</span>
      )}
      <div className="min-w-0">
        <p className="flex items-start gap-2 text-base leading-snug font-bold text-ink">
          <Huruf h={huruf} />
          <span className="min-w-0">
            <span className="sr-only">Lokasi {huruf}: </span>SPBU {p.spbu.nomor}, {p.spbu.kota ?? p.spbu.provinsi}
          </span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {p.lahan_kode}
          {p.spbu.alamat ? ` · ${p.spbu.alamat}` : ""}
        </p>
        <p className="mt-2">
          <Lencana warna={p.status === "menunggu_persetujuan" ? "biru" : p.status === "berakhir" ? "netral" : "hijau"}>{STATUS_TENANT[p.status] ?? p.status}</Lencana>
        </p>
        <Link href={`/ruang-kerja/penawaran/${p.id}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
          Lihat penawaran
        </Link>
      </div>
    </div>
  );
}

function IsiSel({ s, batang, maks }: { s: Sel; batang?: boolean; maks: number }) {
  return (
    <div className="min-w-0">
      <p className="angka font-semibold text-ink">{s.teks}</p>
      {batang && s.nilai != null && maks > 0 && (
        <span aria-hidden="true" className="mt-1.5 block h-2 rounded-full bg-canvas">
          <span className="block h-2 rounded-full bg-brand-blue" style={{ width: `${Math.max(2, (100 * s.nilai) / maks)}%` }} />
        </span>
      )}
      {s.catatan && <p className="mt-1 text-xs leading-relaxed text-subtle">{s.catatan}</p>}
      {s.tautan && (
        <Link href={s.tautan.href} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
          {s.tautan.teks}
        </Link>
      )}
    </div>
  );
}
