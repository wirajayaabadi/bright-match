import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { JudulHalaman, KartuAngka, Rangka } from "@/components/ui";
import { alamat, n, satu } from "@/lib/format";
import { ALASAN_UMPAN, type AnalitikPeran, corong, persen, pilihanTeratas, SESI_MINIMUM, teksLama, teksPersen } from "@/lib/temukan/analitik";
import { getAnalitikTemukan } from "@/lib/temukan/data-rekomendasi";
import { kuesioner, NAMA_PERAN } from "@/lib/temukan/kuesioner";
import type { Peran } from "@/lib/temukan/tipe";

export const metadata: Metadata = { title: "Analitik Temukan peluang" };

type Props = PageProps<"/analitik-temukan">;

const JENDELA = [7, 30, 90] as const;

/** Batang proporsi di dalam sel tabel. Angkanya selalu tertulis di sampingnya; batang hanya memudahkan membandingkan. */
function Batang({ pct }: { pct: number | null }) {
  return (
    <span aria-hidden="true" className="block h-2 w-full min-w-16 overflow-hidden rounded-full bg-line">
      <span className="block h-full rounded-full bg-brand-blue" style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
    </span>
  );
}

// Pola halaman: Analitik. Satu saringan (jendela waktu), lalu angka per peran: corong kuesioner, rekomendasi, pilihan, umpan balik.
export default function AnalitikTemukan({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Temukan peluang"
        judul="Analitik Temukan peluang"
        keterangan="Di mana pengunjung berhenti menjawab, seberapa sering rekomendasi kosong, dan apakah rekomendasinya dinilai sesuai. Dihitung dari peristiwa tanpa identitas: tidak ada akun, kontak, alamat IP, atau teks bebas."
      />
      <Suspense fallback={<Rangka baris={6} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function BagianPeran({ peran, a }: { peran: Peran; a: AnalitikPeran }) {
  const k = kuesioner(peran);
  const baris = corong(k, a);
  const pilihan = pilihanTeratas(k, a);
  const r = a.rekomendasi;
  const sedikit = a.mulai > 0 && a.mulai < SESI_MINIMUM;
  const jumlahUmpan = a.umpan.sesuai + a.umpan.kurang;

  return (
    <section aria-labelledby={`judul-${peran}`} className="mt-10 first:mt-0">
      <h2 id={`judul-${peran}`} className="text-xl font-extrabold tracking-[-0.01em] text-ink">
        {NAMA_PERAN[peran].judul}
      </h2>
      {a.mulai === 0 ? (
        <p className="mt-1 text-sm leading-relaxed text-muted">Belum ada sesi yang mulai menjawab dalam jendela waktu ini. Tabel di bawah tetap ditampilkan agar bentuknya terlihat.</p>
      ) : sedikit ? (
        <p className="mt-1 text-sm leading-relaxed text-warn">
          Baru {n(a.mulai)} sesi. Di bawah {SESI_MINIMUM} sesi, persentase lebih menggambarkan kebetulan daripada pola: baca sebagai arah, bukan kesimpulan.
        </p>
      ) : null}

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuAngka label="Sesi yang mulai menjawab" nilai={n(a.mulai)} catatan="Sesi dihitung sejak jawaban pertama disimpan, bukan sejak halaman dibuka." />
        <KartuAngka label="Menyelesaikan kuesioner" nilai={teksPersen(persen(a.selesai, a.mulai))} catatan={`${n(a.selesai)} dari ${n(a.mulai)} sesi sampai ke ringkasan.`} />
        <KartuAngka label="Median lama pengisian" nilai={teksLama(a.detik_median)} catatan="Dari jawaban pertama sampai ringkasan, untuk sesi yang selesai." />
        <KartuAngka label="Rekomendasi tanpa hasil" nilai={teksPersen(persen(r.kosong, r.dibuat))} catatan={`${n(r.kosong)} dari ${n(r.dibuat)} kali rekomendasi disusun.`} />
      </dl>

      <h3 className="mt-8 text-base font-bold text-ink">Corong per pertanyaan</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
        Bagian sesi yang menjawab tiap pertanyaan, mengikuti urutan kuesioner. Pertanyaan lanjutan wajar lebih kecil: ia hanya tampil untuk sebagian jawaban.
        “Berhenti di sini” adalah sesi yang tidak selesai dan pertanyaan ini yang terakhir disentuhnya.
      </p>
      {/* Bingkai gulir bisa difokus agar tabel bisa digulung dengan papan ketik di layar sempit. */}
      <div tabIndex={0} role="region" aria-label={`Corong per pertanyaan, ${NAMA_PERAN[peran].singkat.toLowerCase()}; bisa digulung ke samping`} className="mt-3 overflow-x-auto rounded-xl border border-line bg-white shadow-card">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold tracking-wide whitespace-nowrap text-subtle uppercase">
              <th scope="col" className="px-4 py-2.5">Pertanyaan</th>
              <th scope="col" className="px-4 py-2.5 text-right">Dijawab</th>
              <th scope="col" className="w-1/4 px-4 py-2.5">Dari sesi yang mulai</th>
              <th scope="col" className="px-4 py-2.5 text-right">Dilewati</th>
              <th scope="col" className="px-4 py-2.5 text-right">Berhenti di sini</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => (
              <tr key={b.id} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink">
                  {b.nama}
                  <span className="block text-xs font-normal text-subtle">{b.inti ? "Pertanyaan inti" : "Tambahan"}</span>
                </th>
                <td className="angka px-4 py-2.5 text-right text-ink">{n(b.dijawab)}</td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-3">
                    <Batang pct={b.pct} />
                    <span className="angka w-14 shrink-0 text-right text-muted">{teksPersen(b.pct)}</span>
                  </span>
                </td>
                <td className="angka px-4 py-2.5 text-right text-muted">{n(b.dilewati)}</td>
                <td className={`angka px-4 py-2.5 text-right ${b.berhenti > 0 ? "font-semibold text-ink" : "text-muted"}`}>{n(b.berhenti)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-base font-bold text-ink">Dari rekomendasi ke minat</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">Dihitung per sesi, terhadap sesi yang melihat rekomendasi.</p>
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white px-4 text-sm shadow-card">
            {[
              ["Sesi yang melihat rekomendasi", n(r.sesi_melihat), teksPersen(persen(r.sesi_melihat, a.mulai)) + " dari yang mulai"],
              ["Membuka rincian, membandingkan, atau menandai", n(r.sesi_klik), teksPersen(persen(r.sesi_klik, r.sesi_melihat))],
              ["Menyatakan minat atau ketertarikan", n(r.sesi_minat), teksPersen(persen(r.sesi_minat, r.sesi_melihat))],
              ["Mengubah jawaban setelah mengisi", n(r.sesi_ubah), teksPersen(persen(r.sesi_ubah, a.mulai)) + " dari yang mulai"],
            ].map(([nama, nilai, bagian]) => (
              <div key={nama} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-muted">{nama}</dt>
                <dd className="angka shrink-0 text-right">
                  <span className="font-semibold text-ink">{nilai}</span> <span className="text-subtle">({bagian})</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="text-base font-bold text-ink">Umpan balik rekomendasi</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">Penilaian pengguna pada kartu rekomendasi. Skor rata-rata menunjukkan apakah skor tinggi memang lebih sering dinilai sesuai.</p>
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white px-4 text-sm shadow-card">
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-muted">Dinilai sesuai</dt>
              <dd className="angka shrink-0 text-right">
                <span className="font-semibold text-ink">{n(a.umpan.sesuai)}</span> <span className="text-subtle">({teksPersen(persen(a.umpan.sesuai, jumlahUmpan))})</span>
                {a.umpan.skor_sesuai != null && <span className="block text-xs text-subtle">skor kecocokan rata-rata {a.umpan.skor_sesuai}</span>}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-muted">Dinilai kurang sesuai</dt>
              <dd className="angka shrink-0 text-right">
                <span className="font-semibold text-ink">{n(a.umpan.kurang)}</span> <span className="text-subtle">({teksPersen(persen(a.umpan.kurang, jumlahUmpan))})</span>
                {a.umpan.skor_kurang != null && <span className="block text-xs text-subtle">skor kecocokan rata-rata {a.umpan.skor_kurang}</span>}
              </dd>
            </div>
            {a.umpan.alasan.map((x) => (
              <div key={x.alasan} className="flex items-baseline justify-between gap-4 py-2.5 pl-4">
                <dt className="text-muted">{ALASAN_UMPAN[x.alasan] ?? x.alasan}</dt>
                <dd className="angka shrink-0 text-ink">{n(x.n)}</dd>
              </div>
            ))}
          </dl>
          {jumlahUmpan === 0 && <p className="mt-2 text-sm text-muted">Belum ada penilaian dalam jendela waktu ini.</p>}
        </div>
      </div>

      <h3 className="mt-8 text-base font-bold text-ink">Pilihan yang paling sering</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
        Jawaban terakhir tiap sesi, hanya untuk pertanyaan pilihan. Wilayah dicatat sampai provinsi; anggaran sebagai rentang. Persentase terhadap sesi yang menjawab pertanyaan itu.
      </p>
      {pilihan.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line bg-white p-4 text-sm text-muted shadow-card">Belum ada jawaban pilihan dalam jendela waktu ini.</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pilihan.map((p) => (
            <div key={p.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
              <h4 className="text-sm font-bold text-ink">{p.nama}</h4>
              <ul className="mt-2 space-y-2 text-sm">
                {p.butir.map((b) => (
                  <li key={b.nama}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-ink">{b.nama}</span>
                      <span className="angka shrink-0 text-muted">
                        {n(b.sesi)} ({teksPersen(b.pct)})
                      </span>
                    </span>
                    <span className="mt-1 block">
                      <Batang pct={b.pct} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const hari = JENDELA.find((j) => String(j) === satu(sp.hari)) ?? 30;
  const hasil = await getAnalitikTemukan(hari);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const a = hasil.data;

  return (
    <>
      <nav aria-label="Jendela waktu" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {JENDELA.map((j) => (
          <Link
            key={j}
            href={alamat("/analitik-temukan", { hari: j === 30 ? undefined : j })}
            aria-current={hari === j ? "page" : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap ${
              hari === j ? "border-brand-blue font-semibold text-brand-blue-strong" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {j} hari terakhir
          </Link>
        ))}
      </nav>

      {!a ? (
        <section className="max-w-2xl rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
          <h2 className="text-base font-bold text-ink">Angka ini hanya untuk tim Non Fuel Retail</h2>
          <p className="mt-2">Akun Anda tidak terdaftar sebagai anggota tim Non Fuel Retail, jadi tidak ada yang ditampilkan.</p>
        </section>
      ) : (
        <>
          <BagianPeran peran="tenant" a={a.tenant} />
          <BagianPeran peran="dealer" a={a.dealer} />
          <p className="mt-10 max-w-3xl text-xs leading-relaxed text-subtle">
            Kohort: sesi yang mulai menjawab dalam {a.hari} hari terakhir; semua angka lain dihitung untuk sesi-sesi itu. Peristiwa dan umpan balik dihapus setelah{" "}
            {a.retensi_hari} hari. Sesi dikenali lewat pseudonim, bukan akun; satu orang di dua peramban terhitung dua sesi. Halaman depan yang hanya dibuka tanpa menjawab
            tidak tercatat.
          </p>
        </>
      )}
    </>
  );
}
