import { ArrowRight, BadgeCheck, Info } from "lucide-react";
import Link from "next/link";
import AjukanUsaha from "@/components/temukan/ajukan-usaha";
import CatatLihat from "@/components/temukan/catat-lihat";
import UmpanBalik from "@/components/temukan/umpan-balik";
import { daya, luas, n, tanggal } from "@/lib/format";
import { namaJenisUsaha } from "@/lib/istilah";
import { PLAYBOOK } from "@/lib/playbook";
import { alasanKategori, batasKategori, type KategoriDinilai, keteranganCalon, type PeluangSpbu, urutkanKategori } from "@/lib/temukan/rekomendasi-spbu";
import { alamatSpbu, letakRuang } from "@/lib/temukan/ringkas";
import type { Jawaban } from "@/lib/temukan/tipe";
import { namaTipe } from "@/lib/tipe-lokasi";

const TAMPIL_AWAL = 4;

/** Kartu satu jenis usaha untuk satu ruang (BusinessRecommendationCard), dengan calon tanpa nama bila berwenang. */
function KartuKategori({
  item,
  kota,
  provinsi,
  ajukan,
  umpan,
}: {
  item: KategoriDinilai;
  kota: string | null;
  provinsi: string;
  /** Hanya untuk akun yang wewenangnya atas SPBU ini tercatat. */
  ajukan: { spbuId: string; lahanId: string; kode: string; versiModel: string; tercatat: boolean } | null;
  umpan: { lahanId: string; kode: string; urut: number; versiModel: string; awal: { nilai: "sesuai" | "kurang"; alasan: string | null } | null };
}) {
  const { kategori: c, sesuai } = item;
  const siapkan = PLAYBOOK.find((p) => p.segmen === c.segmen)?.kunci.slice(0, 2) ?? [];
  const batas = batasKategori(c);
  return (
    <li className="py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-base font-bold text-ink">{namaJenisUsaha(c.segmen)}</h4>
          <p className="angka mt-0.5 text-sm text-muted">
            {n(c.jumlah_calon)} calon tenant di jaringan memenuhi syarat untuk ruang ini
          </p>
        </div>
        <dl className="flex shrink-0 gap-6">
          <div>
            <dt className="text-xs font-semibold text-subtle">Kecocokan</dt>
            <dd className="angka text-xl leading-tight font-extrabold text-ink">
              {c.skor} <span className="text-sm font-semibold text-subtle">/ 100</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-subtle">Tujuan Anda</dt>
            <dd className="angka text-xl leading-tight font-extrabold text-ink">
              {sesuai.skor ?? "–"} {sesuai.skor != null && <span className="text-sm font-semibold text-subtle">/ 100</span>}
            </dd>
          </div>
        </dl>
      </div>

      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
        {alasanKategori(c, kota, provinsi).map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>

      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg font-semibold text-brand-blue-strong hover:underline">Rincian penilaian dan yang perlu disiapkan</summary>
        <div className="mt-2 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-ink">Kesesuaian dengan tujuan Anda</p>
            {sesuai.faktor.length === 0 ? (
              <p className="mt-1 leading-relaxed text-muted">Anda terbuka untuk rekomendasi dan belum memilih tujuan yang bisa dinilai, jadi urutannya mengikuti skor kecocokan.</p>
            ) : (
              <ul className="mt-1 space-y-1.5 leading-relaxed text-muted">
                {sesuai.faktor.map((f) => (
                  <li key={f.kunci}>
                    <span className="font-semibold text-ink">{f.nama}</span>
                    <span className="angka"> ({f.nilai == null ? "belum ada data" : `${Math.round(f.nilai * 100)}%`}, bobot {f.bobot})</span>: {f.alasan}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            {siapkan.length > 0 && (
              <>
                <p className="font-semibold text-ink">Yang perlu disiapkan</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed text-muted">
                  {siapkan.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-subtle">Usulan awal dari playbook jenis usaha; belum divalidasi di lapangan.</p>
              </>
            )}
            {batas.length > 0 && (
              <>
                <p className="mt-3 font-semibold text-ink">Keterbatasan data</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed text-muted">
                  {batas.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </details>

      {c.calon && c.calon.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-canvas p-4">
          <p className="text-sm font-bold text-ink">Calon tenant teratas</p>
          <ol className="mt-2 space-y-2 text-sm">
            {c.calon.map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="angka font-semibold text-ink">
                  Calon {i + 1} · kecocokan {x.skor}
                </span>
                <span className="text-muted">{keteranganCalon(x, kota, provinsi).join(" · ")}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs leading-relaxed text-subtle">Nama calon dibuka tim Non Fuel Retail saat ketertarikan Anda ditindaklanjuti.</p>
        </div>
      )}

      {ajukan && (
        <AjukanUsaha
          spbuId={ajukan.spbuId}
          lahanId={ajukan.lahanId}
          kode={ajukan.kode}
          segmen={c.segmen}
          namaUsaha={namaJenisUsaha(c.segmen)}
          tercatat={ajukan.tercatat}
          potret={{ skor: c.skor, preferensi: sesuai.skor ?? undefined, versi_model: ajukan.versiModel, alasan: alasanKategori(c, kota, provinsi).slice(0, 3) }}
        />
      )}

      <UmpanBalik
        peran="dealer"
        lahanId={umpan.lahanId}
        segmen={c.segmen}
        subjek={`${namaJenisUsaha(c.segmen).toLowerCase()} untuk ruang ${umpan.kode}`}
        awal={umpan.awal}
        potret={{ skor: c.skor, preferensi: sesuai.skor ?? undefined, versi_model: umpan.versiModel, urut: umpan.urut }}
      />
    </li>
  );
}

/**
 * Hasil untuk pengelola SPBU: jenis usaha per ruang, lalu calon tenant tanpa nama bila wewenang akunnya
 * tercatat. Pola halaman: rincian satu SPBU dengan bagian per ruang.
 */
export default function HasilSpbu({
  hasil,
  jawaban,
  sudahMasuk,
  minat,
  umpanAwal,
}: {
  hasil: PeluangSpbu;
  jawaban: Jawaban;
  sudahMasuk: boolean;
  /** Ketertarikan yang sudah tercatat: "lahan_id|segmen". */
  minat: string[];
  /** Penilaian yang sudah diberikan sesi ini: "lahan_id|segmen" ke penilaiannya. */
  umpanAwal: Record<string, { nilai: "sesuai" | "kurang"; alasan: string | null }>;
}) {
  const { spbu } = hasil;
  const ajukan = (lahanId: string, kode: string, segmen: string) =>
    hasil.berwenang ? { spbuId: spbu.id, lahanId, kode, versiModel: hasil.versi_model, tercatat: minat.includes(`${lahanId}|${segmen}`) } : null;
  const umpan = (lahanId: string, kode: string, segmen: string, urut: number) => ({ lahanId, kode, urut, versiModel: hasil.versi_model, awal: umpanAwal[`${lahanId}|${segmen}`] ?? null });
  return (
    <div>
      <CatatLihat jumlah={hasil.ruang.length} />
      <p className="angka text-[15px] leading-relaxed text-muted">
        <span className="font-semibold text-ink">SPBU {spbu.nomor}</span> · {alamatSpbu(spbu)}
        {spbu.tipe_lokasi ? ` · Tipe lokasi: ${namaTipe(spbu.tipe_lokasi).toLowerCase()}` : " · Lingkungan belum terhitung"}
      </p>

      {!hasil.berwenang && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm leading-relaxed text-muted shadow-card">
          <Info aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-brand-blue-strong" />
          <p>
            Anda melihat jenis usaha yang cocok dan jumlah calonnya. Profil calon tenant baru tampil untuk akun pengelola SPBU yang wewenangnya atas SPBU ini sudah
            dipastikan tim Non Fuel Retail.{" "}
            {!sudahMasuk && (
              <Link href="/login?lanjut=/temukan/dealer/hasil" className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
                Masuk dengan akun pengelola SPBU
              </Link>
            )}
          </p>
        </div>
      )}

      {hasil.ruang.length === 0 ? (
        <section className="mt-6 rounded-xl border border-line bg-white p-6 shadow-card">
          <h2 className="text-lg font-bold text-ink">Belum ada ruang yang bisa disarankan untuk SPBU ini</h2>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">
            Ruang yang Anda pilih tidak lagi tercatat kosong, sedang ditahan, datanya sedang diperiksa, atau sedang menuju kontrak. Pilih ruang lain, atau usulkan ruang
            baru untuk diperiksa tim Non Fuel Retail.
          </p>
          <Link href="/temukan/dealer?langkah=ruang&ubah=1" className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white hover:bg-brand-blue-strong">
            Pilih ruang lain
          </Link>
        </section>
      ) : (
        <div className="mt-6 space-y-6">
          {hasil.ruang.map((r) => {
            const urut = urutkanKategori(r.kategori, jawaban);
            const rinci = [r.luas_m2 != null ? luas(r.luas_m2) : "Luas belum tercatat", ...letakRuang(r), r.daya_w != null ? daya(r.daya_w) : "Daya belum tercatat"];
            return (
              <section key={r.lahan_id} aria-labelledby={`ruang-${r.lahan_id}`} className="rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2 id={`ruang-${r.lahan_id}`} className="angka text-lg font-bold text-ink">
                    Ruang {r.kode}
                  </h2>
                  <p className="flex items-center gap-1.5 text-sm text-muted">
                    {r.terverifikasi ? (
                      <>
                        <BadgeCheck aria-hidden="true" className="size-4 text-brand-green-strong" /> Sudah diverifikasi di lokasi
                      </>
                    ) : (
                      "Belum diverifikasi di lokasi"
                    )}
                  </p>
                </div>
                <p className="angka mt-1 text-sm text-muted">{rinci.join(" · ")}</p>

                {urut.length === 0 ? (
                  <p className="mt-4 border-t border-line pt-4 text-[15px] leading-relaxed text-muted">
                    Belum ada jenis usaha di jaringan yang memenuhi syarat untuk ruang ini. Biasanya karena ukuran atau daya ruang di luar kebiasaan tenant yang ada.
                  </p>
                ) : (
                  <>
                    <h3 className="mt-4 border-t border-line pt-4 text-sm font-bold text-ink">Jenis usaha yang cocok</h3>
                    <ul className="divide-y divide-line">
                      {urut.slice(0, TAMPIL_AWAL).map((x, i) => (
                        <KartuKategori
                          key={x.kategori.segmen}
                          item={x}
                          kota={spbu.kota}
                          provinsi={spbu.provinsi}
                          ajukan={ajukan(r.lahan_id, r.kode, x.kategori.segmen)}
                          umpan={umpan(r.lahan_id, r.kode, x.kategori.segmen, i + 1)}
                        />
                      ))}
                    </ul>
                    {urut.length > TAMPIL_AWAL && (
                      <details className="border-t border-line pt-2">
                        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg text-[15px] font-semibold text-brand-blue-strong hover:underline">
                          Lihat {urut.length - TAMPIL_AWAL} jenis usaha lain
                        </summary>
                        <ul className="divide-y divide-line">
                          {urut.slice(TAMPIL_AWAL).map((x, i) => (
                            <KartuKategori
                              key={x.kategori.segmen}
                              item={x}
                              kota={spbu.kota}
                              provinsi={spbu.provinsi}
                              ajukan={ajukan(r.lahan_id, r.kode, x.kategori.segmen)}
                              umpan={umpan(r.lahan_id, r.kode, x.kategori.segmen, TAMPIL_AWAL + i + 1)}
                            />
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </section>
            );
          })}
          {hasil.ruang_lain > 0 && (
            <p className="text-sm leading-relaxed text-muted">
              {n(hasil.ruang_lain)} ruang lain di SPBU ini belum dihitung: satu halaman memuat paling banyak enam ruang.{" "}
              <Link href="/temukan/dealer?langkah=ruang&ubah=1" className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
                Pilih ruang tertentu
              </Link>{" "}
              untuk melihatnya.
            </p>
          )}
        </div>
      )}

      <section className="mt-10 rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-lg font-bold text-ink">Ingin menindaklanjuti?</h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">
          {hasil.berwenang
            ? "Ajukan ketertarikan pada jenis usaha yang Anda inginkan di atas. Tim Non Fuel Retail lalu mengusulkan calon tenant dan penawarannya, dan usulan itu tampil di ruang kerja SPBU Anda untuk diputuskan. Ketertarikan tidak mengikat."
            : "Rekomendasi ini bahan pertimbangan, bukan keputusan. Mengajukan ketertarikan dilakukan oleh akun pengelola yang wewenangnya atas SPBU ini sudah dipastikan, dan ditindaklanjuti tim Non Fuel Retail."}
        </p>
        <Link href={hasil.berwenang || sudahMasuk ? "/ruang-kerja" : "/login?lanjut=/temukan/dealer/hasil"} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong">
          {hasil.berwenang || sudahMasuk ? "Buka ruang kerja SPBU" : "Masuk ke ruang kerja SPBU"}
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Link>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-subtle">
        Skor kecocokan menunjukkan kemiripan dengan pola yang sudah ada di jaringan SPBU, bukan peluang berhasil dan bukan perkiraan pendapatan. Model kecocokan versi{" "}
        {hasil.versi_model}. Sumber: {hasil.sumber.map((s) => `${s.nama} per ${tanggal(s.per_tanggal)}`).join("; ")}.
      </p>
    </div>
  );
}
