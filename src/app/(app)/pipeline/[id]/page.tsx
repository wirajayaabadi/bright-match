import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setSyarat } from "@/app/aksi";
import { DialogPersetujuan, FormAktif, FormPenawaran, FormTandaTangan, FormTindakLanjut, TombolTerbitkan } from "@/components/alur-peluang";
import DokumenPanel from "@/components/dokumen";
import { CatatanPeluang, KendaliTahap } from "@/components/kendali-peluang";
import PanelGalat from "@/components/panel-galat";
import PeringatanData from "@/components/peringatan-data";
import PotretSkorPeluang from "@/components/potret-skor";
import { FormBagikan } from "@/components/portal";
import StatusLahanPanel from "@/components/status-lahan";
import { SurveiNfrPanel } from "@/components/survei";
import { BarisKosong, BingkaiTabel, Jejak, Lencana, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { Rangka, TidakDitemukan } from "@/components/ui";
import { getDokumenPeluang } from "@/lib/data-dokumen";
import { getPortalPeluang, JENIS_TANGGAPAN } from "@/lib/data-portal";
import { getPeluang, type PeluangRinci, type Persetujuan, type Syarat } from "@/lib/data-tahap3";
import { getSurveiPeluang } from "@/lib/data-survei";
import { getProfilSaya } from "@/lib/data-validasi";
import { alamat, daya, luas, n, rp, satu, tanggal } from "@/lib/format";
import {
  KANAL,
  namaTahap,
  PENERIMA_SEWA,
  PIHAK,
  PIHAK_SETUJU,
  SKEMA,
  STATUS_SETUJU,
  STATUS_VERSI,
  TAHAP,
  tahapBerakhir,
  UUID,
} from "@/lib/istilah";
import { berjalan, hariWib } from "@/lib/survei";
import { bolehUbah } from "@/lib/validasi";

export const metadata: Metadata = { title: "Peluang" };

type Props = PageProps<"/pipeline/[id]">;

// Pola halaman: Detail / Record. Nama peluang, status dan metadata, lalu lima tab.
export default function HalamanPeluang({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const TAB = [
  { nilai: "tahap", nama: "Tahap" },
  { nilai: "penawaran", nama: "Penawaran" },
  { nilai: "survei", nama: "Survei" },
  { nilai: "persetujuan", nama: "Persetujuan" },
  { nilai: "persyaratan", nama: "Persyaratan" },
  { nilai: "dokumen", nama: "Dokumen" },
  { nilai: "riwayat", nama: "Riwayat" },
] as const;

const PERISTIWA: Record<string, string> = {
  peluang_dibuat: "Peluang dibuat",
  tindak_lanjut_diubah: "Tindak lanjut diubah",
  penawaran_diterbitkan: "Versi penawaran diterbitkan",
  persetujuan_diputuskan: "Persetujuan dicatat",
  kontrak_ditandatangani: "Kontrak ditandatangani",
  outlet_aktif: "Outlet mulai beroperasi",
  survei_diminta: "Tenant meminta survei lokasi",
  survei_dijadwalkan: "Jadwal survei ditetapkan",
  survei_dijadwalkan_ulang: "Jadwal survei diubah",
  survei_selesai: "Survei lokasi selesai",
  survei_dibatalkan: "Survei lokasi dibatalkan",
  survei_diketahui_dealer: "Pengelola SPBU mengetahui jadwal survei",
  dokumen_diunggah: "Dokumen diunggah",
  dokumen_ditarik: "Dokumen ditarik",
  dokumen_tampak_diubah: "Keterlihatan dokumen diubah",
};

async function Isi({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) return <TidakDitemukan apa="Peluang ini" />;
  const [hasil, profil, hasilSurvei, hasilDokumen] = await Promise.all([getPeluang(id), getProfilSaya(), getSurveiPeluang(id), getDokumenPeluang(id)]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Peluang ini" />;

  const d = hasil.data;
  const { peluang: p, calon, tenant } = d;
  const namaPihak = calon?.nama_usaha ?? p.tenant_nama ?? "Pihak tidak tercatat";
  const tab = TAB.find((t) => t.nilai === satu(sp.tab))?.nilai ?? "tahap";
  const ubah = bolehUbah(profil.data);
  const peran = profil.data?.peran_nfr ?? null;
  const berlaku = d.penawaran.find((v) => v.status === "diterbitkan") ?? null;
  const diputuskan = d.persetujuan.filter((s) => !s.gugur && s.status !== "menunggu").length;
  const terpenuhi = d.syarat.filter((s) => s.terpenuhi).length;
  const survei = hasilSurvei.data ?? [];
  const surveiAktif = berjalan(survei);
  const dokumen = hasilDokumen.data ?? { peran: null, boleh_unggah: null, dokumen: [] };
  const dokumenBerlaku = dokumen.dokumen.filter((x) => x.terkini && !x.ditarik).length;
  const terlambat = p.tenggat != null && p.tenggat < new Date().toISOString().slice(0, 10) && !tahapBerakhir(p.tahap);
  const jumlah: Record<string, string | null> = {
    tahap: null,
    penawaran: d.penawaran.length > 0 ? n(d.penawaran.length) : null,
    survei: surveiAktif ? (surveiAktif.status === "diminta" ? "perlu jadwal" : "terjadwal") : null,
    persetujuan: berlaku ? `${diputuskan}/4` : null,
    persyaratan: `${terpenuhi}/${d.syarat.length}`,
    dokumen: dokumenBerlaku > 0 ? n(dokumenBerlaku) : null,
    riwayat: null,
  };
  const kartu = alamat(`/penawaran/${p.lahan_id}`, { calon: p.calon_id ?? undefined, tenant: tenant?.id });

  return (
    <>
      <Jejak induk={[{ href: "/pipeline", nama: "Pipeline" }]} kini={`${namaPihak} · ${p.lahan_kode}`} />

      <header className="mb-6">
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
          {namaPihak} di lahan {p.lahan_kode}
        </h1>
        <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <div>
            <dt className="sr-only">Tahap</dt>
            <dd>
              <Lencana warna={tahapBerakhir(p.tahap) ? "netral" : p.tahap === "pemantauan" ? "hijau" : "biru"}>{namaTahap(p.tahap)}</Lencana>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>SPBU:</dt>
            <dd>
              <Link href={`/lokasi/${p.spbu_id}`} className={tautan}>
                {p.spbu_nomor}
              </Link>
              {p.kota ? `, ${p.kota}` : ""}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Pemilik:</dt>
            <dd className={p.pemilik ? "text-ink" : "font-semibold text-brand-red-strong"}>{p.pemilik ?? "belum ada"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Tenggat:</dt>
            <dd className={terlambat ? "font-semibold text-brand-red-strong" : "text-ink"}>
              {p.tenggat ? `${tanggal(p.tenggat)}${terlambat ? ", sudah lewat" : ""}` : "belum diisi"}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Skor kecocokan:</dt>
            <dd className="angka text-ink">{p.skor ?? "–"}</dd>
          </div>
        </dl>
        {p.tindakan_berikut && (
          <p className="mt-2 text-sm text-ink">
            <span className="text-muted">Tindakan berikut:</span> {p.tindakan_berikut}
          </p>
        )}
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href={kartu} className={tautan}>
            Kartu penawaran
          </Link>
          <Link href={`/kecocokan/lahan/${p.lahan_id}`} className={tautan}>
            Kartu lahan
          </Link>
          {calon && (
            <Link href={`/pipeline/calon/${calon.id}`} className={tautan}>
              Profil calon tenant
            </Link>
          )}
          {tenant && (
            <Link href={`/tenant/${tenant.id}`} className={tautan}>
              Profil tenant
            </Link>
          )}
        </p>
      </header>

      <nav aria-label="Bagian peluang" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TAB.map((t) => (
          <Link
            key={t.nilai}
            href={alamat(`/pipeline/${p.id}`, { tab: t.nilai === "tahap" ? undefined : t.nilai })}
            aria-current={tab === t.nilai ? "page" : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap ${
              tab === t.nilai ? "border-brand-blue font-semibold text-brand-blue-strong" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.nama}
            {jumlah[t.nilai] && <span className="angka ml-1.5 text-xs text-subtle">{jumlah[t.nilai]}</span>}
          </Link>
        ))}
      </nav>

      {tab === "tahap" && <TabTahap d={d} ubah={ubah} peran={peran} namaPihak={namaPihak} />}
      {tab === "penawaran" && <TabPenawaran d={d} ubah={ubah} />}
      {tab === "survei" && (
        <section>
          <h2 className="mb-1 text-base font-bold text-ink">Survei lokasi</h2>
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted">
            Tenant mengusulkan waktu dari portalnya, tim NFR menetapkan jadwal dan pendampingnya. Survei tidak memindahkan tahap peluang.
          </p>
          <SurveiNfrPanel
            key={survei.map((x) => `${x.id}${x.status}${x.jadwal_tanggal}${x.jadwal_jam}`).join()}
            peluangId={p.id}
            lokasi={`SPBU ${p.spbu_nomor}`}
            daftar={survei}
            ubah={ubah}
            berakhir={tahapBerakhir(p.tahap)}
            hariIni={hariWib()}
          />
        </section>
      )}
      {tab === "persetujuan" && <TabPersetujuan d={d} ubah={ubah} />}
      {tab === "persyaratan" && <TabPersyaratan d={d} />}
      {tab === "dokumen" && (
        <section>
          <h2 className="mb-1 text-base font-bold text-ink">Dokumen peluang</h2>
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted">
            Berkas pendukung peluang ini. Versi baru tidak menimpa versi lama. Mengunggah naskah kontrak tidak mencatat tanda tangan; tanda tangan dicatat
            di tab Tahap.
          </p>
          <DokumenPanel peluangId={p.id} data={dokumen} />
        </section>
      )}
      {tab === "riwayat" && <TabRiwayat d={d} />}
    </>
  );
}

const judul = "text-base font-bold text-ink";

function TabTahap({ d, ubah, peran, namaPihak }: { d: PeluangRinci; ubah: boolean; peran: string | null; namaPihak: string }) {
  const { peluang: p, calon, tenant, lahan, kontrak } = d;
  const hasilTerakhir = d.riwayat.find((r) => tahapBerakhir(r.tahap_ke));
  const bolehTandaTangan = peran === "nfr_admin" || peran === "nfr_penyetuju";

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid gap-4">
        <Suspense fallback={null}>
          <PeringatanData lahanId={p.lahan_id} />
        </Suspense>
        <Suspense fallback={null}>
          <StatusLahanPanel lahanId={p.lahan_id} ringkas />
        </Suspense>
      </div>

      <section>
        <h2 className={judul}>Tahap</h2>
        <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
          Peluang berpindah satu tahap setiap kali, dan hanya bila syarat tahap berikutnya terpenuhi. Setiap perpindahan tercatat atas nama Anda.
        </p>
        <KendaliTahap
          id={p.id}
          tahap={p.tahap}
          sebelumBerakhir={hasilTerakhir?.tahap_dari ?? null}
          syaratBerikut={d.syarat_berikut}
          bolehUbah={ubah}
        />
      </section>

      <Suspense fallback={null}>
        <PotretSkorPeluang peluangId={p.id} bolehUbah={ubah} />
      </Suspense>

      {(p.tahap === "kontrak" || kontrak) && (
        <section>
          <h2 className={judul}>Kontrak</h2>
          <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
            Tanda tangan dan mulai beroperasi dicatat sebagai dua peristiwa terpisah. Kelengkapan persyaratan belum berarti kontrak ditandatangani.
          </p>
          {kontrak ? (
            <dl className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
              <Butir nama="Nomor kontrak" nilai={kontrak.nomor} />
              <Butir nama="Ditandatangani" nilai={`${tanggal(kontrak.tanggal_tanda_tangan)}, dicatat ${kontrak.dicatat_oleh ?? "–"}`} />
              <Butir nama="Versi penawaran yang ditandatangani" nilai={`Versi ${kontrak.versi}`} />
              <Butir
                nama="Mulai beroperasi"
                nilai={kontrak.aktif_sejak ? `${tanggal(kontrak.aktif_sejak)}, dicatat ${kontrak.aktif_dicatat_oleh ?? "–"}` : "Belum dicatat"}
              />
            </dl>
          ) : bolehTandaTangan ? (
            <FormTandaTangan id={p.id} />
          ) : (
            <p className="rounded-xl border border-line bg-white px-4 py-3.5 text-sm text-muted shadow-card">
              Tanda tangan kontrak dicatat admin atau penyetuju NFR.
            </p>
          )}
          {kontrak && !kontrak.aktif_sejak && p.tahap === "aktivasi" && ubah && (
            <div className="mt-4">
              <FormAktif id={p.id} />
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className={judul}>Tindak lanjut</h2>
        <div className="mt-4">
          {ubah ? (
            <FormTindakLanjut id={p.id} pemilik={p.pemilik} tindakan={p.tindakan_berikut} tenggat={p.tenggat} anggota={d.anggota} />
          ) : (
            <dl className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
              <Butir nama="Pemilik" nilai={p.pemilik ?? "Belum ada"} />
              <Butir nama="Tindakan berikut" nilai={p.tindakan_berikut ?? "Belum diisi"} />
              <Butir nama="Tenggat" nilai={p.tenggat ? tanggal(p.tenggat) : "Belum diisi"} />
            </dl>
          )}
        </div>
      </section>

      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-2">
        <section>
          <h2 className={judul}>Catatan</h2>
          <div className="mt-4 rounded-xl border border-line bg-white p-4 shadow-card">
            <CatatanPeluang id={p.id} catatan={p.catatan} />
          </div>
        </section>
        <section>
          <h2 className={judul}>{calon ? "Calon tenant" : "Tenant"} dan lahan</h2>
          <dl className="mt-4 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            <Butir nama="Nama" nilai={namaPihak} />
            <Butir nama="Jenis usaha" nilai={p.segmen ?? "–"} />
            {calon && <Butir nama="Kontak" nilai={[calon.kontak_nama, calon.kontak_email, calon.kontak_telepon].filter(Boolean).join(" · ")} />}
            {calon && <Butir nama="Kanal" nilai={KANAL[calon.kanal] ?? calon.kanal} />}
            {calon && <Butir nama="Anggaran sewa" nilai={calon.anggaran_tahunan != null ? `${rp(calon.anggaran_tahunan)}/th` : "Tidak disebut"} />}
            {tenant && <Butir nama="Jaringan saat ini" nilai={`${n(tenant.lahan)} lahan di ${n(tenant.spbu)} SPBU`} />}
            <Butir
              nama="Lahan"
              nilai={lahan ? `${luas(lahan.luas_m2)} · ${lahan.posisi ?? "–"} · ${daya(lahan.daya_w)}` : "Tidak lagi ada di data"}
            />
            <Butir nama="Tarif di Brightspace" nilai={lahan?.tarif_tahunan != null ? `${rp(lahan.tarif_tahunan)}/th` : "Tidak tercantum"} />
          </dl>
        </section>
      </div>
    </div>
  );
}

/** Nilai sewa selama masa sewa, setelah dikurangi masa bebas sewa. Perkiraan dari syarat yang ditawarkan, bukan pendapatan. */
const nilaiMasaSewa = (v: { sewa_tahunan: number; lama_sewa_bulan: number; bebas_sewa_bulan: number }) =>
  (v.sewa_tahunan * Math.max(0, v.lama_sewa_bulan - v.bebas_sewa_bulan)) / 12;

function TabPenawaran({ d, ubah }: { d: PeluangRinci; ubah: boolean }) {
  const { peluang: p, lahan } = d;
  const draf = d.penawaran.find((v) => v.status === "draf") ?? null;
  const berlaku = d.penawaran.find((v) => v.status === "diterbitkan") ?? null;
  const posisi = TAHAP.findIndex((t) => t.nilai === p.tahap);
  const bisaSusun = ubah && posisi >= 5 && posisi <= 8;
  const versiBerikut = Math.max(0, ...d.penawaran.map((v) => v.versi)) + 1;

  return (
    <div className="grid grid-cols-1 gap-8">
      <section>
        <h2 className={judul}>Versi penawaran</h2>
        <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
          Setiap perubahan syarat komersial menjadi versi baru. Versi yang sudah terbit tidak pernah diubah, dan persetujuan selalu terikat pada satu versi.
        </p>
        <BingkaiTabel lebarMin="min-w-[860px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>
                Versi
              </th>
              <th scope="col" className={thKanan}>
                Sewa/tahun
              </th>
              <th scope="col" className={thKanan}>
                Lama sewa
              </th>
              <th scope="col" className={th}>
                Skema
              </th>
              <th scope="col" className={th}>
                Penerima sewa
              </th>
              <th scope="col" className={thKanan}>
                Nilai selama masa sewa
              </th>
              <th scope="col" className={th}>
                Terbit
              </th>
            </tr>
          </thead>
          <tbody>
            {d.penawaran.length === 0 && (
              <BarisKosong
                kolom={7}
                pesan={
                  bisaSusun
                    ? "Belum ada versi penawaran. Susun versi pertama di bawah."
                    : "Belum ada versi penawaran. Penawaran disusun sejak tahap survei lokasi."
                }
              />
            )}
            {d.penawaran.map((v) => (
              <tr key={v.id} className="border-b border-line last:border-b-0">
                <th scope="row" className={`${td} text-left font-normal whitespace-nowrap`}>
                  <span className="font-semibold text-ink">Versi {v.versi}</span>{" "}
                  <Lencana warna={v.status === "diterbitkan" ? "hijau" : v.status === "draf" ? "kuning" : "netral"}>{STATUS_VERSI[v.status]}</Lencana>
                </th>
                <td className={`${tdAngka} text-ink`}>{rp(v.sewa_tahunan)}</td>
                <td className={`${tdAngka} text-muted`}>
                  {n(v.lama_sewa_bulan)} bln
                  {v.bebas_sewa_bulan > 0 && <p className="text-xs text-subtle">bebas sewa {n(v.bebas_sewa_bulan)} bln</p>}
                </td>
                <td className={`${td} min-w-44 text-muted`}>
                  {SKEMA[v.skema] ?? v.skema}
                  {v.bagi_hasil_pct != null && <p className="text-xs text-subtle">{String(v.bagi_hasil_pct).replace(".", ",")}% dari omzet</p>}
                </td>
                <td className={`${td} text-muted`}>{PENERIMA_SEWA[v.penerima_sewa] ?? v.penerima_sewa}</td>
                <td className={`${tdAngka} text-muted`}>{rp(nilaiMasaSewa(v))}</td>
                <td className={`${td} text-muted`}>
                  {v.diterbitkan ? tanggal(v.diterbitkan) : <span className="text-subtle">Belum</span>}
                  <p className="text-xs text-subtle">{v.diterbitkan_oleh ?? v.dibuat_oleh ?? ""}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </BingkaiTabel>
        <p className="mt-2 text-xs leading-relaxed text-subtle">
          Nilai selama masa sewa adalah perkiraan dari syarat yang ditawarkan (sewa tetap, dikurangi masa bebas sewa). Itu bukan nilai kontrak sampai
          ditandatangani, dan bukan pendapatan sampai terealisasi.
        </p>
      </section>

      <Suspense fallback={null}>
        <PortalTenant id={p.id} ubah={ubah} adaVersiBerlaku={berlaku != null} />
      </Suspense>

      {bisaSusun ? (
        <section className="grid gap-4">
          <FormPenawaran
            key={draf?.id ?? `baru-${versiBerikut}`}
            peluangId={p.id}
            draf={draf}
            acuan={berlaku ?? { sewa_tahunan: lahan?.tarif_tahunan ?? undefined }}
            versiBerikut={versiBerikut}
          />
          {draf && <TombolTerbitkan id={draf.id} versi={draf.versi} adaVersiBerlaku={berlaku != null} />}
        </section>
      ) : (
        ubah && (
          <p className="text-sm text-muted">
            {posisi < 5
              ? "Versi penawaran bisa disusun setelah peluang mencapai tahap survei lokasi."
              : "Peluang sudah melewati tahap persetujuan. Mundurkan tahapnya bila syarat komersial perlu diubah."}
          </p>
        )
      )}
    </div>
  );
}

/** Membagikan penawaran ke organisasi tenant dan menampilkan tanggapan yang masuk dari portalnya. */
async function PortalTenant({ id, ubah, adaVersiBerlaku }: { id: string; ubah: boolean; adaVersiBerlaku: boolean }) {
  const hasil = await getPortalPeluang(id);
  const d = hasil.data;
  if (!d) return null;
  return (
    <section>
      <h2 className={judul}>Portal tenant</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
        {d.organisasi
          ? `Dibagikan ke ${d.organisasi.nama}${d.organisasi.demo ? " (organisasi uji)" : ""} pada ${tanggal(d.dibagikan)} oleh ${d.dibagikan_oleh ?? "–"}. Anggotanya melihat versi yang berlaku, lokasi, foto, dan alasan kecocokan; tidak ada catatan internal.`
          : adaVersiBerlaku
            ? "Belum dibagikan. Setelah dibagikan, anggota organisasi tenant melihat versi yang berlaku di portalnya dan bisa menanggapi."
            : "Penawaran bisa dibagikan ke organisasi tenant setelah satu versi diterbitkan."}
      </p>
      {ubah && adaVersiBerlaku && <FormBagikan id={id} organisasi={d.organisasi} pilihan={d.pilihan} />}
      {d.tanggapan.length > 0 && (
        <ol className="mt-4 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
          {d.tanggapan.map((t, i) => (
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
      )}
    </section>
  );
}

function TabPersetujuan({ d, ubah }: { d: PeluangRinci; ubah: boolean }) {
  const berlaku = d.persetujuan.filter((s) => !s.gugur);
  const gugur = d.persetujuan.filter((s) => s.gugur);
  const versi = d.penawaran.find((v) => v.status === "diterbitkan");
  const diTahap = d.peluang.tahap === "persetujuan";
  const warna = (s: Persetujuan) => (s.status === "disetujui" ? "hijau" : s.status === "menunggu" ? "netral" : s.status === "minta_revisi" ? "kuning" : "merah");

  if (!versi) {
    return (
      <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-subtle shadow-card">
        Belum ada versi penawaran yang diterbitkan, jadi belum ada yang perlu disetujui. Terbitkan dulu di tab Penawaran.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      <section>
        <h2 className={judul}>Persetujuan atas versi {versi.versi}</h2>
        <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
          Kontrak baru bisa ditandatangani setelah keempat pihak menyetujui versi ini.{" "}
          {diTahap
            ? "Sampai portal tenant dan dealer tersedia, keputusan pihak di luar NFR dicatat tim NFR atas nama mereka, dengan rujukan bukti."
            : "Keputusan dicatat saat peluang berada di tahap persetujuan."}
        </p>
        <ul className="grid gap-3 lg:grid-cols-2">
          {berlaku.map((s) => (
            <li key={s.id} className="rounded-xl border border-line bg-white p-4 text-sm shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold text-ink">{PIHAK_SETUJU[s.pihak]}</h3>
                <Lencana warna={warna(s)}>{STATUS_SETUJU[s.status]}</Lencana>
              </div>
              {s.status === "menunggu" ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {ubah && diTahap ? (
                    <DialogPersetujuan id={s.id} pihak={s.pihak} versi={s.versi} />
                  ) : (
                    <span className="text-muted">{diTahap ? "Peran Anda hanya membaca." : "Belum saatnya diputuskan."}</span>
                  )}
                </div>
              ) : (
                <dl className="mt-3 space-y-1.5 leading-relaxed text-muted">
                  <div>
                    <dt className="inline">Diputuskan: </dt>
                    <dd className="inline text-ink">{tanggal(s.diputuskan)}</dd>
                  </div>
                  <div>
                    <dt className="inline">{s.atas_nama ? "Yang memutuskan: " : "Oleh: "}</dt>
                    <dd className="inline text-ink">{s.atas_nama ? s.wewenang : s.penyetuju_email}</dd>
                  </div>
                  {s.atas_nama && (
                    <div>
                      <dt className="inline">Dicatat atas nama oleh: </dt>
                      <dd className="inline text-ink">{s.penyetuju_email}</dd>
                    </div>
                  )}
                  {s.bukti && (
                    <div>
                      <dt className="inline">Bukti: </dt>
                      <dd className="inline text-ink">{s.bukti}</dd>
                    </div>
                  )}
                  {s.alasan && (
                    <div>
                      <dt className="inline">Alasan: </dt>
                      <dd className="inline text-ink">{s.alasan}</dd>
                    </div>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </section>

      {gugur.length > 0 && (
        <section>
          <h2 className={judul}>Persetujuan atas versi sebelumnya</h2>
          <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
            Sudah gugur karena versinya digantikan. Disimpan sebagai riwayat dan tidak dihitung lagi.
          </p>
          <BingkaiTabel lebarMin="min-w-[640px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  Versi
                </th>
                <th scope="col" className={th}>
                  Pihak
                </th>
                <th scope="col" className={th}>
                  Keputusan saat itu
                </th>
                <th scope="col" className={th}>
                  Alasan
                </th>
              </tr>
            </thead>
            <tbody>
              {gugur.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-b-0">
                  <td className={`${td} whitespace-nowrap text-muted`}>Versi {s.versi}</td>
                  <th scope="row" className={`${td} text-left font-normal text-ink`}>
                    {PIHAK_SETUJU[s.pihak]}
                  </th>
                  <td className={`${td} text-muted`}>
                    {STATUS_SETUJU[s.status]}
                    {s.diputuskan && <p className="text-xs text-subtle">{tanggal(s.diputuskan)}</p>}
                  </td>
                  <td className={`${td} text-muted`}>{s.alasan ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </BingkaiTabel>
        </section>
      )}
    </div>
  );
}

function TabPersyaratan({ d }: { d: PeluangRinci }) {
  return (
    <section>
      <h2 className={judul}>Persyaratan tiap pihak</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
        Centang butir yang sudah terpenuhi. Kelengkapan daftar ini adalah salah satu syarat masuk tahap tanda tangan kontrak, bukan tanda bahwa kontrak
        sudah ditandatangani.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {(["tenant", "spbu", "pertamina"] as const).map((pihak) => (
          <DaftarSyarat key={pihak} judul={PIHAK[pihak]} butir={d.syarat.filter((s) => s.pihak === pihak)} />
        ))}
      </div>
    </section>
  );
}

function TabRiwayat({ d }: { d: PeluangRinci }) {
  // Perpindahan tahap dan peristiwa komersial digabung dalam satu garis waktu, yang terbaru di atas.
  const butir = [
    ...d.riwayat.map((r) => ({
      waktu: r.waktu,
      oleh: r.oleh,
      judul: r.tahap_dari ? `${namaTahap(r.tahap_dari)} ke ${namaTahap(r.tahap_ke)}` : `Peluang dibuat di tahap ${namaTahap(r.tahap_ke)}`,
      rinci: r.catatan,
    })),
    ...d.audit
      .filter((a) => a.peristiwa !== "peluang_dibuat")
      .map((a) => {
        const data = a.data as Record<string, string | number | boolean | null | undefined>;
        const rinci =
          a.peristiwa === "persetujuan_diputuskan"
            ? `${PIHAK_SETUJU[String(data.pihak)] ?? data.pihak}: ${STATUS_SETUJU[String(data.keputusan)] ?? data.keputusan}, versi ${data.versi}${data.atas_nama ? " (dicatat atas nama)" : ""}`
            : a.peristiwa === "penawaran_diterbitkan"
              ? `Versi ${data.versi}${Number(data.persetujuan_gugur) > 0 ? `; ${data.persetujuan_gugur} persetujuan lama gugur` : ""}`
              : a.peristiwa === "kontrak_ditandatangani"
                ? `Nomor ${data.nomor}, tanggal ${tanggal(String(data.tanggal))}, versi ${data.versi}`
                : a.peristiwa === "outlet_aktif"
                  ? `Sejak ${tanggal(String(data.aktif_sejak))}`
                  : a.peristiwa === "dokumen_diunggah" || a.peristiwa === "dokumen_ditarik" || a.peristiwa === "dokumen_tampak_diubah"
                    ? `${data.judul}${data.versi ? `, versi ${data.versi}` : ""}`
                  : a.peristiwa === "tindak_lanjut_diubah"
                    ? [data.pemilik_ke ? `pemilik ${data.pemilik_ke}` : null, data.tenggat ? `tenggat ${tanggal(String(data.tenggat))}` : null].filter(Boolean).join(", ") || null
                    : null;
        return { waktu: a.waktu, oleh: a.oleh, judul: PERISTIWA[a.peristiwa] ?? a.peristiwa, rinci };
      }),
  ].sort((a, b) => (a.waktu < b.waktu ? 1 : -1));

  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
      {butir.map((b, i) => (
        <li key={`${b.waktu}-${i}`} className="px-4 py-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-semibold text-ink">{b.judul}</span>
            <span className="angka text-xs text-subtle">
              {tanggal(b.waktu)}
              {b.oleh ? ` · ${b.oleh}` : ""}
            </span>
          </p>
          {b.rinci && <p className="mt-0.5 leading-relaxed text-muted">{b.rinci}</p>}
        </li>
      ))}
    </ol>
  );
}

function Butir({ nama, nilai }: { nama: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-muted">{nama}</dt>
      <dd className="text-right text-ink">{nilai}</dd>
    </div>
  );
}

/** Butir persyaratan satu pihak. Tiap butir adalah formulir kecil: mengklik kotaknya membalik statusnya. */
function DaftarSyarat({ judul: nama, butir }: { judul: string; butir: Syarat[] }) {
  const selesai = butir.filter((s) => s.terpenuhi).length;
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{nama}</h3>
        <Lencana warna={selesai === butir.length ? "hijau" : "netral"}>
          {selesai} dari {butir.length}
        </Lencana>
      </div>
      <ul className="mt-3 space-y-1">
        {butir.map((s) => (
          <li key={s.id}>
            <form action={setSyarat}>
              <input type="hidden" name="syarat_id" value={s.id} />
              <input type="hidden" name="terpenuhi" value={s.terpenuhi ? "0" : "1"} />
              <button
                type="submit"
                role="checkbox"
                aria-checked={s.terpenuhi}
                className="flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-canvas"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[11px] leading-none font-bold ${
                    s.terpenuhi ? "border-brand-green-strong bg-brand-green-strong text-white" : "border-subtle bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={s.terpenuhi ? "text-muted" : "text-ink"}>{s.butir}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
