import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import DokumenPanel from "@/components/dokumen";
import Galeri from "@/components/galeri";
import { IsiKeyakinan } from "@/components/keyakinan-data";
import PanelGalat from "@/components/panel-galat";
import { KeputusanTenant, TanggapanTenant } from "@/components/portal";
import { SurveiTenantPanel } from "@/components/survei";
import { Jejak, Lencana, tautan } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getPenawaranTenantRinci, JENIS_TANGGAPAN, STATUS_TENANT, type PenawaranTenant } from "@/lib/data-portal";
import { daya, luas, n, rp, tanggal } from "@/lib/format";
import { PENERIMA_SEWA, SKEMA, STATUS_SETUJU, UUID } from "@/lib/istilah";
import { getDokumenPeluang } from "@/lib/data-dokumen";
import { getSurveiTenant } from "@/lib/data-survei";
import { alasan } from "@/lib/kecocokan";
import { berjalan, hariWib } from "@/lib/survei";
import { KESIAPAN } from "@/lib/status-lahan";
import { artiTipe, namaTipe } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Penawaran lokasi" };

type Props = PageProps<"/ruang-kerja/penawaran/[id]">;

// Pola halaman: Detail / Record. Layar pertama menjawab lima hal: di mana, mengapa cocok, berapa biayanya,
// apa yang perlu diwaspadai, dan apa langkah berikutnya. Rincian lain dibuka bila diperlukan.
export default function PenawaranUntukTenant({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

const judul = "text-base font-bold text-ink";

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) return <TidakDitemukan apa="Penawaran ini" />;
  const [hasil, hasilSurvei, hasilDokumen] = await Promise.all([getPenawaranTenantRinci(id), getSurveiTenant(id), getDokumenPeluang(id)]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Penawaran ini" />;

  const p = hasil.data;
  const s = p.syarat;
  const berakhir = p.status === "berakhir";
  const foto = [...p.foto_lahan, ...p.foto_spbu];
  const bulanBayar = Math.max(0, s.lama_sewa_bulan - s.bebas_sewa_bulan);
  const waspada = halWaspada(p);
  const cocok = p.kecocokan?.rinci ? alasan(p.kecocokan.rinci).slice(0, 3) : [];
  const survei = hasilSurvei.data ?? [];
  const adaSurvei = berjalan(survei) != null;
  const dokumen = hasilDokumen.data ?? { peran: null, boleh_unggah: null, dokumen: [] };

  return (
    <>
      <Jejak induk={[{ href: "/ruang-kerja", nama: "Penawaran untuk Anda" }]} kini={`SPBU ${p.spbu.nomor}`} />

      <header className="mb-6">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
          {luas(p.ruang?.luas_m2)} di SPBU {p.spbu.nomor}, {p.spbu.kota ?? p.spbu.provinsi}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.spbu.alamat ?? `${p.spbu.kota ?? ""}, ${p.spbu.provinsi}`}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <Lencana warna={p.status === "menunggu_persetujuan" ? "biru" : berakhir ? "netral" : "hijau"}>{STATUS_TENANT[p.status] ?? p.status}</Lencana>
          <span>
            Penawaran versi {s.versi}, terbit {tanggal(s.diterbitkan)}
          </span>
          {p.spbu.lat != null && p.spbu.lng != null && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${p.spbu.lat},${p.spbu.lng}`} target="_blank" rel="noreferrer" className={tautan}>
              Buka lokasi di Google Maps
            </a>
          )}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid grid-cols-1 gap-8">
          {foto.length > 0 && <Galeri gambar={foto} subjek={`lokasi di SPBU ${p.spbu.nomor}`} maks={6} segera kisi="grid-cols-2 sm:grid-cols-3" />}

          <section>
            <h2 className={judul}>Mengapa lokasi ini cocok untuk usaha Anda</h2>
            {cocok.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
                {cocok.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Lokasi ini dipilih tim Non Fuel Retail untuk usaha {p.segmen ?? "Anda"}. Rincian kecocokannya belum tersedia; tanyakan lewat tombol
                pertanyaan.
              </p>
            )}
            {p.kecocokan?.skor != null && (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Skor kecocokan <strong className="angka text-ink">{p.kecocokan.skor} dari 100</strong>. Skor membandingkan lokasi ini dengan pola usaha
                sejenis di jaringan SPBU. Skor bukan perkiraan omzet atau jaminan keberhasilan.
              </p>
            )}
          </section>

          <section>
            <h2 className={judul}>Yang perlu Anda pertimbangkan</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              {waspada.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>

          <details className="rounded-xl border border-line bg-white shadow-card">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-bold text-ink">Rincian ruang dan SPBU</summary>
            <dl className="divide-y divide-line border-t border-line text-sm">
              <Baris nama="Kode ruang" nilai={p.lahan_kode} />
              <Baris nama="Luas" nilai={luas(p.ruang?.luas_m2)} />
              <Baris
                nama="Panjang × lebar × tinggi"
                nilai={
                  p.ruang && [p.ruang.panjang_m, p.ruang.lebar_m, p.ruang.tinggi_m].every((v) => v != null)
                    ? `${[p.ruang.panjang_m, p.ruang.lebar_m, p.ruang.tinggi_m].map((v) => String(v).replace(".", ",")).join(" × ")} m`
                    : "Belum tercatat"
                }
              />
              <Baris nama="Posisi" nilai={`${p.ruang?.posisi === "Diluar Bangunan" ? "Di luar bangunan" : "Di dalam bangunan"}${p.ruang?.lantai ? `, ${p.ruang.lantai}` : ""}`} />
              <Baris nama="Daya listrik tersedia" nilai={p.ruang?.daya_w != null ? daya(p.ruang.daya_w) : "Belum tercatat"} />
              <Baris nama="Fasilitas SPBU" nilai={p.spbu.fasilitas.length > 0 ? p.spbu.fasilitas.join(", ") : "Belum tercatat"} />
              <Baris nama="Usaha yang sudah ada di SPBU" nilai={p.usaha_ada.length > 0 ? p.usaha_ada.join(", ") : "Belum ada"} />
            </dl>
          </details>

          <details className="rounded-xl border border-line bg-white shadow-card">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-bold text-ink">Lingkungan sekitar</summary>
            <div className="border-t border-line px-4 py-3.5 text-sm leading-relaxed text-muted">
              {p.lingkungan ? (
                <>
                  <p>
                    <strong className="text-ink">{namaTipe(p.lingkungan.tipe_lokasi)}.</strong> {artiTipe(p.lingkungan.tipe_lokasi)}
                  </p>
                  <p className="mt-2">
                    Sekitar {n(Math.round(p.lingkungan.penduduk_3km / 1000) * 1000)} penduduk dalam 3 km dan {n(p.lingkungan.poi_1km)} tempat usaha dalam 1
                    km. Angka ini dari data terbuka (Overture Maps dan WorldPop) dan belum diuji di lapangan.
                  </p>
                </>
              ) : (
                <p>Lingkungan SPBU ini belum terhitung.</p>
              )}
              {p.terdekat.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {p.terdekat.map((t) => (
                    <li key={`${t.nama}-${t.jarak_m}`} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 text-ink">
                        {t.nama} <span className="text-xs text-subtle">· {t.jenis}</span>
                      </span>
                      <span className="angka shrink-0 text-xs text-subtle">{n(t.jarak_m)} m</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          {p.keyakinan && (
            <details className="rounded-xl border border-line bg-white shadow-card">
              <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-bold text-ink">Seberapa bisa data ini dipercaya</summary>
              <div className="border-t border-line p-4">
                <IsiKeyakinan k={p.keyakinan} judul="Keyakinan data lokasi" />
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  Sumber: {p.sumber.map((x) => `${x.nama} per ${x.per_tanggal ? tanggal(x.per_tanggal) : "tanggal tidak tercatat"}`).join("; ")}.
                </p>
              </div>
            </details>
          )}

          {(!berakhir || survei.length > 0) && (
            <section id="survei" className="scroll-mt-6">
              <h2 className={`${judul} mb-3`}>Survei lokasi</h2>
              <SurveiTenantPanel
                peluangId={p.id}
                lokasi={`SPBU ${p.spbu.nomor}`}
                daftar={survei}
                berakhir={berakhir}
                besok={hariWib(1)}
                maks={hariWib(90)}
              />
            </section>
          )}

          {(dokumen.boleh_unggah != null || dokumen.dokumen.length > 0) && (
            <section id="dokumen" className="scroll-mt-6">
              <h2 className={`${judul} mb-1`}>Dokumen</h2>
              <p className="mb-3 text-sm leading-relaxed text-muted">
                Dokumen dari tim Non Fuel Retail untuk penawaran ini, dan dokumen usaha yang Anda kirimkan. Mengunggah dokumen tidak mengikat.
              </p>
              <DokumenPanel peluangId={p.id} data={dokumen} />
            </section>
          )}

          {p.tanggapan.length > 0 && (
            <section>
              <h2 className={judul}>Tanggapan organisasi Anda</h2>
              <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
                {p.tanggapan.map((t, i) => (
                  <li key={`${t.waktu}-${i}`} className="px-4 py-3">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-semibold text-ink">{JENIS_TANGGAPAN[t.jenis] ?? t.jenis}</span>
                      <span className="angka text-xs text-subtle">
                        {tanggal(t.waktu)} · {t.oleh ?? "–"}
                      </span>
                    </p>
                    {t.pesan && <p className="mt-0.5 leading-relaxed text-muted">{t.pesan}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="grid gap-5 lg:sticky lg:top-6">
          <section className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 className={judul}>Biaya yang ditawarkan</h2>
            <p className="angka mt-2 text-3xl leading-none font-extrabold text-ink">
              {rp(s.sewa_tahunan)} <span className="text-sm font-medium text-muted">per tahun</span>
            </p>
            <dl className="mt-3 divide-y divide-line text-sm">
              <Baris rapat nama="Setara per bulan" nilai={rp(s.sewa_tahunan / 12)} />
              <Baris rapat nama="Lama sewa" nilai={`${n(s.lama_sewa_bulan)} bulan`} />
              {s.bebas_sewa_bulan > 0 && <Baris rapat nama="Masa bebas sewa" nilai={`${n(s.bebas_sewa_bulan)} bulan`} />}
              <Baris rapat nama="Skema" nilai={SKEMA[s.skema] ?? s.skema} />
              {s.bagi_hasil_pct != null && <Baris rapat nama="Bagi hasil" nilai={`${String(s.bagi_hasil_pct).replace(".", ",")}% dari omzet`} />}
              {s.deposit != null && <Baris rapat nama="Deposit" nilai={rp(s.deposit)} />}
              {s.mulai_rencana && <Baris rapat nama="Rencana mulai sewa" nilai={tanggal(s.mulai_rencana)} />}
              <Baris rapat nama="Sewa dibayar kepada" nilai={PENERIMA_SEWA[s.penerima_sewa] ?? s.penerima_sewa} />
              <Baris rapat nama="Sewa tetap selama masa sewa" nilai={rp((s.sewa_tahunan * bulanBayar) / 12)} />
            </dl>
            {s.catatan && <p className="mt-3 text-sm leading-relaxed text-muted">{s.catatan}</p>}
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              Angka di atas adalah syarat yang ditawarkan, belum termasuk biaya renovasi, listrik, dan operasional usaha Anda.
            </p>
            {!berakhir && (
              <Link
                href={`/ruang-kerja/penawaran/${p.id}/kelayakan`}
                className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle"
              >
                Hitung kelayakan usaha Anda
              </Link>
            )}
          </section>

          <section className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 className={judul}>Langkah Anda berikutnya</h2>
            <div className="mt-3">
              {berakhir ? (
                <p className="text-sm leading-relaxed text-muted">Penawaran ini sudah berakhir. Hubungi tim Non Fuel Retail bila Anda masih berminat.</p>
              ) : p.persetujuan && p.persetujuan.status !== "menunggu" ? (
                <p className="text-sm leading-relaxed text-muted">
                  Organisasi Anda sudah memutuskan versi ini: <strong className="text-ink">{STATUS_SETUJU[p.persetujuan.status]?.toLowerCase()}</strong> pada{" "}
                  {tanggal(p.persetujuan.diputuskan)}. {p.persetujuan.alasan ?? ""}
                </p>
              ) : p.boleh_putuskan && p.peran_saya === "tenant_admin" ? (
                <KeputusanTenant id={p.id} versi={s.versi} />
              ) : p.boleh_putuskan ? (
                <p className="text-sm leading-relaxed text-muted">
                  Penawaran ini menunggu keputusan organisasi Anda. Keputusan diambil admin organisasi Anda; Anda tetap bisa bertanya di bawah.
                </p>
              ) : (
                <TanggapanTenant id={p.id} adaSurvei={adaSurvei} />
              )}
            </div>
            {p.boleh_putuskan && !berakhir && p.persetujuan?.status === "menunggu" && p.peran_saya !== "tenant_admin" && (
              <div className="mt-4">
                <TanggapanTenant id={p.id} adaSurvei={adaSurvei} />
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

/** Hal yang jujur perlu diketahui tenant sebelum memutuskan, dari data yang ada. */
function halWaspada(p: PenawaranTenant): string[] {
  const hal: string[] = [];
  const k = p.kesiapan;
  if (k?.kesiapan === "belum_siap") hal.push("Menurut pemeriksaan lokasi, ruang ini belum siap dipakai dan masih perlu pekerjaan sebelum usaha bisa buka.");
  else if (k?.kesiapan === "siap") hal.push("Menurut pemeriksaan lokasi, ruang ini siap dipakai.");
  else hal.push(`Kesiapan ruang: ${(KESIAPAN[k?.kesiapan ?? "belum_diketahui"]?.nama ?? "belum diketahui").toLowerCase()}. Minta survei lokasi untuk melihatnya sendiri.`);
  if (k?.pembatasan) hal.push(`Pembatasan di lokasi: ${k.pembatasan}`);
  if (p.ruang?.daya_w == null) hal.push("Daya listrik yang tersedia belum tercatat. Pastikan cukup untuk peralatan Anda.");
  if (p.usaha_ada.includes(p.segmen ?? "")) hal.push(`Di SPBU ini sudah ada usaha berjenis ${p.segmen}. Pertimbangkan persaingannya.`);
  if (p.syarat.penerima_sewa === "dibagi") hal.push("Sewa dibagi antara Pertamina dan pemilik SPBU; rinciannya ada di kontrak.");
  if (p.keyakinan && p.keyakinan.tingkat !== "tinggi") hal.push("Sebagian data lokasi ini belum lengkap. Lihat bagian keyakinan data di bawah.");
  hal.push("Belum ada perkiraan omzet untuk lokasi ini. Skor kecocokan tidak boleh dibaca sebagai perkiraan keuntungan.");
  return hal;
}

function Baris({ nama, nilai, rapat = false }: { nama: string; nilai: string; rapat?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${rapat ? "py-2" : "px-4 py-2.5"}`}>
      <dt className="shrink-0 text-muted">{nama}</dt>
      <dd className="angka text-right font-semibold text-ink">{nilai}</dd>
    </div>
  );
}
