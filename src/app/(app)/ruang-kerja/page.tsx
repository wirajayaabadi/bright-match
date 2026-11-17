/* Foto disajikan rute /foto milik aplikasi; tidak lewat pengoptimal next/image. */
/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { Lencana } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { SurveiDealerDaftar } from "@/components/survei";
import { getRingkasanDealer } from "@/lib/data-dealer";
import { getPenawaranTenant, JENIS_TANGGAPAN, STATUS_TENANT } from "@/lib/data-portal";
import { getSurveiDealer } from "@/lib/data-survei";
import { getProfilSaya } from "@/lib/data-validasi";
import { luas, n, rp, tanggal } from "@/lib/format";
import { gambarSiap, urlGambar } from "@/lib/gambar";
import { PERAN } from "@/lib/validasi";

export const metadata: Metadata = { title: "Ruang kerja" };

// Pola halaman: Inbox. Untuk tenant: penawaran yang dibagikan ke organisasinya, yang terbaru di atas.
// Untuk dealer: ringkasan SPBU yang dikelolanya. Akun tanpa organisasi: keterangan, tanpa data tiruan.
export default function RuangKerja() {
  return (
    <Suspense fallback={<Rangka baris={4} />}>
      <Isi />
    </Suspense>
  );
}

async function Isi() {
  const hasil = await getProfilSaya();
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const profil = hasil.data;
  const anggota = profil?.keanggotaan ?? [];
  const tenant = anggota.find((a) => a.jenis === "tenant");

  if (tenant) return <KotakPenawaran organisasi={tenant.organisasi} peran={tenant.peran} demo={tenant.demo} />;
  const dealer = anggota.find((a) => a.jenis === "dealer");
  if (dealer) return <RuangDealer organisasi={dealer.organisasi} peran={dealer.peran} demo={dealer.demo} />;

  return (
    <>
      <JudulHalaman label="Bright Match" judul="Ruang kerja Anda" keterangan="Akun Anda sudah terdaftar." />
      {anggota.length === 0 ? (
        <section className="max-w-2xl rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
          <h2 className="text-base font-bold text-ink">Akun Anda belum terhubung ke organisasi</h2>
          <p className="mt-2">
            Tanpa organisasi, belum ada data yang bisa ditampilkan. Hubungi tim Non Fuel Retail Pertamina dan sebutkan email{" "}
            <strong className="text-ink">{profil?.email ?? "akun Anda"}</strong> agar akun ini dihubungkan.
          </p>
        </section>
      ) : (
        <div className="grid max-w-2xl gap-5">
          {anggota.map((a) => (
            <section key={`${a.organisasi}-${a.peran}`} className="rounded-xl border border-line bg-white p-6 shadow-card">
              <h2 className="text-base font-bold text-ink">{a.organisasi}</h2>
              <p className="mt-1 text-sm text-muted">
                Peran Anda: <strong className="text-ink">{PERAN[a.peran] ?? a.peran}</strong>
                {a.demo && " · organisasi uji, bukan pihak nyata"}
              </p>
              <p className="mt-4 text-sm text-muted">Semua modul NFR tersedia dari menu.</p>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** Pola halaman: Dashboard / Overview. Yang perlu diputuskan lebih dulu, lalu SPBU yang dikelola. */
async function RuangDealer({ organisasi, peran, demo }: { organisasi: string; peran: string; demo: boolean }) {
  const [hasil, hasilSurvei] = await Promise.all([getRingkasanDealer(), getSurveiDealer()]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const { spbu, persetujuan } = hasil.data ?? { spbu: [], persetujuan: [] };
  const survei = hasilSurvei.data ?? [];

  return (
    <>
      <header className="mb-6 max-w-3xl">
        <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">
          {organisasi}
          {demo ? " · organisasi uji" : ""}
        </p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">SPBU Anda</h1>
        <p className="mt-2 text-base leading-relaxed text-muted">
          {spbu.length === 0
            ? "SPBU yang Anda kelola akan muncul di sini setelah tim Non Fuel Retail menautkannya ke organisasi Anda."
            : `${n(spbu.length)} SPBU, ${n(spbu.reduce((a, x) => a + x.kosong, 0))} ruang usaha kosong.`}{" "}
          Anda masuk sebagai {(PERAN[peran] ?? peran).toLowerCase()}.
        </p>
      </header>

      {persetujuan.length > 0 && (
        <section className="mb-8 max-w-3xl">
          <h2 className="text-lg font-bold text-ink">Usulan tenant yang menunggu</h2>
          <ul className="mt-3 grid gap-3">
            {persetujuan.map((u) => (
              <li key={u.peluang_id}>
                <Link
                  href={`/ruang-kerja/persetujuan/${u.peluang_id}`}
                  className="block rounded-xl border border-l-4 border-brand-blue bg-white p-4 shadow-card hover:border-brand-blue-strong"
                >
                  <span className="block text-base font-extrabold text-ink">{u.pihak ?? "Calon tenant"}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {u.segmen ?? "Jenis usaha belum tercatat"} · ruang {u.lahan_kode} di SPBU {u.spbu_nomor}
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-brand-blue-strong">
                    {u.berwenang ? "Tinjau dan putuskan" : "Lihat usulan (diputuskan penyetuju SPBU)"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {survei.length > 0 && (
        <section className="mb-8 max-w-3xl">
          <h2 className="mb-3 text-lg font-bold text-ink">Survei lokasi yang akan datang</h2>
          <SurveiDealerDaftar daftar={survei} tampilSpbu />
        </section>
      )}

      {spbu.length === 0 ? (
        <section className="max-w-2xl rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
          <h2 className="text-base font-bold text-ink">Belum ada SPBU yang ditautkan</h2>
          <p className="mt-2">Hubungi tim Non Fuel Retail Pertamina dan sebutkan nomor SPBU yang Anda kelola.</p>
        </section>
      ) : (
        <section className="max-w-3xl">
          <h2 className="text-lg font-bold text-ink">SPBU yang Anda kelola</h2>
          <ul className="mt-3 grid gap-3">
            {spbu.map((x) => (
              <li key={x.spbu_id}>
                <Link
                  href={`/ruang-kerja/spbu/${x.spbu_id}`}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 rounded-xl border border-line bg-white p-3 shadow-card hover:border-brand-blue sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-4"
                >
                  {gambarSiap && x.foto ? (
                    <img src={urlGambar(x.foto, true)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg border border-line bg-canvas object-cover" />
                  ) : (
                    <span className="grid aspect-[4/3] w-full place-items-center rounded-lg border border-line bg-canvas text-xs text-subtle">Belum ada foto</span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-ink">SPBU {x.nomor}</span>
                    <span className="mt-0.5 block text-sm text-muted">{x.alamat ?? x.kota ?? x.provinsi}</span>
                    <span className="mt-2 block text-sm text-ink">
                      {n(x.kosong)} dari {n(x.ruang)} ruang kosong
                      {x.perlu_konfirmasi > 0 && <span className="font-semibold text-warn"> · {n(x.perlu_konfirmasi)} belum Anda konfirmasi</span>}
                    </span>
                    <span className="mt-2 block text-sm font-semibold text-brand-blue-strong">Buka ruang usaha</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

async function KotakPenawaran({ organisasi, peran, demo }: { organisasi: string; peran: string; demo: boolean }) {
  const hasil = await getPenawaranTenant();
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const daftar = hasil.data ?? [];
  const perluAnda = daftar.filter((p) => p.status === "menunggu_persetujuan").length;

  return (
    <>
      <header className="mb-6 max-w-3xl">
        <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">
          {organisasi}
          {demo ? " · organisasi uji" : ""}
        </p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">Penawaran untuk Anda</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {daftar.length === 0
            ? "Lokasi di SPBU Pertamina yang ditawarkan khusus untuk organisasi Anda akan muncul di sini."
            : `${n(daftar.length)} lokasi di SPBU Pertamina ditawarkan khusus untuk organisasi Anda${perluAnda > 0 ? `, ${n(perluAnda)} menunggu persetujuan Anda` : ""}.`}{" "}
          Anda masuk sebagai {(PERAN[peran] ?? peran).toLowerCase()}.
        </p>
        {daftar.length >= 2 && (
          <Link
            href="/ruang-kerja/banding"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle"
          >
            Bandingkan lokasi
          </Link>
        )}
      </header>

      {daftar.length === 0 ? (
        <section className="max-w-2xl rounded-xl border border-line bg-white p-6 text-sm leading-relaxed text-muted shadow-card">
          <h2 className="text-base font-bold text-ink">Belum ada penawaran</h2>
          <p className="mt-2">
            Tim Non Fuel Retail Pertamina membagikan penawaran setelah lokasinya diperiksa di lapangan dan syarat sewanya disusun. Bila Anda sedang
            menunggu penawaran tertentu, hubungi kontak NFR Anda.
          </p>
        </section>
      ) : (
        <ul className="grid max-w-4xl gap-3">
          {daftar.map((p) => (
            <li key={p.id}>
              <Link
                href={`/ruang-kerja/penawaran/${p.id}`}
                className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 rounded-xl border bg-white p-3 shadow-card hover:border-brand-blue sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:p-4 ${
                  p.status === "menunggu_persetujuan" ? "border-l-4 border-brand-blue" : "border-line"
                }`}
              >
                {gambarSiap && p.foto ? (
                  <img src={urlGambar(p.foto, true)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg border border-line bg-canvas object-cover" />
                ) : (
                  <span className="grid aspect-[4/3] w-full place-items-center rounded-lg border border-line bg-canvas text-xs text-subtle">Belum ada foto</span>
                )}
                <span className="min-w-0">
                  <span className={`block text-base text-ink ${p.status === "menunggu_persetujuan" ? "font-extrabold" : "font-bold"}`}>
                    SPBU {p.spbu_nomor}, {p.kota ?? p.provinsi}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {luas(p.luas_m2)} · {p.posisi === "Diluar Bangunan" ? "di luar bangunan" : "di dalam bangunan"} · {rp(p.sewa_tahunan)} per tahun
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                    <Lencana warna={p.status === "menunggu_persetujuan" ? "biru" : p.status === "berakhir" ? "netral" : "hijau"}>
                      {STATUS_TENANT[p.status] ?? p.status}
                    </Lencana>
                    <span>Dibagikan {tanggal(p.dibagikan)}</span>
                    {p.tanggapan_terakhir && <span>Tanggapan terakhir Anda: {JENIS_TANGGAPAN[p.tanggapan_terakhir]?.toLowerCase()}</span>}
                  </span>
                </span>
                <span className="col-span-2 text-sm font-semibold text-brand-blue-strong sm:col-span-1">Lihat penawaran</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
