import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import TabelPeluang from "@/components/tabel-peluang";
import { JudulHalaman, KartuAngka, Rangka } from "@/components/ui";
import { getDasbor, getPeluangProvinsi } from "@/lib/data";
import { n, pct, rp, tanggal } from "@/lib/format";
import { MODUL } from "@/lib/modules";

export const metadata: Metadata = { title: "Beranda" };

export default function Beranda() {
  return (
    <>
      <JudulHalaman
        label="NFR Commercial Intelligence & Partnership Platform"
        judul="Beranda"
        keterangan="Bright Match mencocokkan ruang usaha kosong di SPBU dengan tenant yang tepat, lalu mengawal peluangnya sampai menjadi kontrak."
      />

      <Suspense fallback={<Rangka baris={3} />}>
        <Ringkasan />
      </Suspense>

      <section aria-labelledby="judul-modul" className="mt-12">
        <h2 id="judul-modul" className="text-lg font-bold text-ink">
          Modul
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MODUL.map((m) => (
            <li key={m.slug}>
              <Link
                href={m.href}
                className="flex h-full flex-col rounded-xl border border-line bg-white p-5 shadow-card transition-colors hover:border-brand-blue"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-base font-bold text-ink">{m.nama}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      m.siap ? "bg-brand-green-soft text-brand-green-strong" : "border border-line text-subtle"
                    }`}
                  >
                    {m.siap ? "Tersedia" : `Tahap ${m.tahap}`}
                  </span>
                </span>
                <span className="mt-2 text-sm leading-relaxed text-muted">{m.ringkas}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/**
 * Pola halaman: Dashboard / Overview. Lima angka, corong dari lahan kosong sampai outlet beroperasi,
 * tiga nilai uang yang dipisah tegas, lalu daftar yang perlu perhatian. Semuanya hanya dibaca; tindakan
 * dilakukan di modulnya. Angka yang belum punya sumber data ditulis "belum ada data", bukan nol.
 */
async function Ringkasan() {
  const [dasbor, provinsi] = await Promise.all([getDasbor(), getPeluangProvinsi()]);
  if (dasbor.galat) return <PanelGalat galat={dasbor.galat} />;
  const d = dasbor.data;
  if (!d) return null;

  const okupansi = d.lahan > 0 ? (100 * d.lahan_tersewa) / d.lahan : null;
  const corong = [
    { nama: "Lahan kosong", nilai: d.lahan_kosong, catatan: `dari ${n(d.lahan)} ruang usaha di ${n(d.spbu)} SPBU`, href: "/kecocokan" },
    { nama: "Terverifikasi di lokasi", nilai: d.kosong_terverifikasi, catatan: "inspeksi lokasinya sudah diterima", href: "/inspeksi" },
    { nama: "Boleh ditawarkan resmi", nilai: d.kosong_boleh_ditawarkan, catatan: "terverifikasi, tersedia, dan wewenang SPBU-nya dipastikan", href: "/inspeksi" },
    { nama: "Peluang berjalan", nilai: d.peluang_berjalan, catatan: "lahan yang sedang ditawarkan ke satu pihak", href: "/pipeline?tahap=berjalan" },
    { nama: "Penawaran resmi terbit", nilai: d.peluang_berversi, catatan: "peluang yang sudah punya versi penawaran berlaku", href: "/pipeline?tahap=berjalan" },
    { nama: "Kontrak ditandatangani", nilai: d.kontrak_ditandatangani, catatan: "tanda tangan sudah dicatat", href: "/pipeline?tahap=aktivasi" },
    { nama: "Outlet beroperasi", nilai: d.outlet_beroperasi, catatan: "tanggal mulai beroperasi sudah dicatat", href: "/pipeline?tahap=pemantauan" },
  ];
  const perhatian = [
    { jumlah: d.peluang_terlambat, teks: "peluang melewati tenggatnya", href: "/pipeline?tahap=terlambat" },
    { jumlah: d.persetujuan_menunggu, teks: "persetujuan menunggu keputusan", href: "/pipeline?tahap=persetujuan" },
    { jumlah: d.inspeksi_menunggu, teks: "inspeksi lokasi menunggu tinjauan", href: "/inspeksi?status=diajukan" },
    {
      jumlah: d.peluang_tanpa_versi,
      teks: "peluang di tahap penawaran ke atas belum punya versi penawaran (dibuat sebelum aturan versi berlaku)",
      href: "/pipeline?tahap=berjalan",
    },
    { jumlah: d.peluang_tanpa_pemilik, teks: "peluang berjalan belum punya pemilik", href: "/pipeline?tahap=berjalan" },
    { jumlah: d.peluang_tanpa_tindakan, teks: "peluang berjalan belum punya tindakan berikut", href: "/pipeline?tahap=berjalan" },
    { jumlah: d.tanggapan_tenant_7hari, teks: "tanggapan tenant masuk dalam 7 hari terakhir", href: "/pipeline?tahap=berjalan" },
    {
      jumlah: d.temuan_kritis,
      teks: `temuan data kritis belum diputuskan, menahan ${n(d.kosong_tertahan_temuan)} lahan kosong`,
      href: "/validasi?tingkat=kritis",
    },
  ].filter((p) => p.jumlah > 0);
  const sumber = d.sumber.map((s) => `${s.nama} per ${s.per_tanggal ? tanggal(s.per_tanggal) : "tanggal tidak tercatat"}`).join("; ");

  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KartuAngka
          label="Lahan kosong terverifikasi"
          nilai={n(d.kosong_terverifikasi)}
          catatan={`dari ${n(d.lahan_kosong)} lahan kosong; ${n(d.kosong_boleh_ditawarkan)} boleh ditawarkan resmi`}
        />
        <KartuAngka label="Okupansi" nilai={pct(okupansi)} catatan={`${n(d.lahan_tersewa)} dari ${n(d.lahan)} ruang usaha tersewa`} />
        <KartuAngka
          label="Peluang berjalan"
          nilai={n(d.peluang_berjalan)}
          catatan={d.peluang_terlambat > 0 ? `${n(d.peluang_terlambat)} melewati tenggat` : `${n(d.peluang_berakhir)} sudah berakhir`}
        />
        <KartuAngka label="Persetujuan menunggu" nilai={n(d.persetujuan_menunggu)} catatan="Atas versi penawaran yang berlaku" />
        <KartuAngka label="Kontrak ditandatangani" nilai={n(d.kontrak_ditandatangani)} catatan={`${n(d.outlet_beroperasi)} outlet sudah beroperasi`} />
      </dl>

      <section aria-labelledby="judul-corong" className="mt-12">
        <h2 id="judul-corong" className="text-lg font-bold text-ink">
          Dari lahan kosong sampai outlet beroperasi
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
          Setiap baris adalah syarat untuk baris di bawahnya. Baris yang masih nol menunjukkan di mana alurnya tertahan.
        </p>
        <ol className="mt-4 divide-y divide-line rounded-xl border border-line bg-white shadow-card">
          {corong.map((c, i) => (
            <li key={c.nama} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-3 text-sm">
              <span className="angka text-xs text-subtle">{i + 1}</span>
              <span className="min-w-0">
                <Link href={c.href} className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
                  {c.nama}
                </Link>
                <span className="block text-xs text-subtle">{c.catatan}</span>
              </span>
              <span className={`angka text-lg font-extrabold ${c.nilai === 0 ? "text-subtle" : "text-ink"}`}>{n(c.nilai)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="judul-nilai" className="mt-12">
        <h2 id="judul-nilai" className="text-lg font-bold text-ink">
          Nilai komersial
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
          Empat angka ini berbeda artinya dan tidak boleh dijumlahkan: perkiraan belum tentu laku, yang ditawarkan belum tentu disetujui, dan yang
          terkontrak belum tentu sudah dibayar.
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NilaiUang
            label="Perkiraan"
            nilai={rp(d.nilai.perkiraan_tahunan)}
            satuan="per tahun"
            catatan={`Tarif Brightspace ${n(d.nilai.perkiraan_lahan)} lahan kosong yang tarifnya tercantum. Belum ada pihak yang berminat.`}
          />
          <NilaiUang
            label="Ditawarkan"
            nilai={d.nilai.ditawarkan_peluang > 0 ? rp(d.nilai.ditawarkan_tahunan) : "Belum ada"}
            satuan={d.nilai.ditawarkan_peluang > 0 ? "per tahun" : undefined}
            catatan={`Sewa di versi penawaran yang berlaku pada ${n(d.nilai.ditawarkan_peluang)} peluang berjalan.`}
          />
          <NilaiUang
            label="Terkontrak"
            nilai={d.kontrak_ditandatangani > 0 ? rp(d.nilai.terkontrak_tahunan) : "Belum ada"}
            satuan={d.kontrak_ditandatangani > 0 ? "per tahun" : undefined}
            catatan={
              d.kontrak_ditandatangani > 0
                ? `${n(d.kontrak_ditandatangani)} kontrak ditandatangani, ${rp(d.nilai.terkontrak_masa_sewa)} selama masa sewa.`
                : "Belum ada kontrak yang ditandatangani lewat Bright Match."
            }
          />
          <NilaiUang
            label="Terealisasi"
            nilai={d.nilai.terealisasi != null ? rp(d.nilai.terealisasi) : "Belum ada data"}
            catatan="Bright Match belum menerima data pembayaran sewa, jadi pendapatan nyata tidak ditampilkan."
          />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-subtle">Sumber: {sumber}.</p>
      </section>

      <section aria-labelledby="judul-perhatian" className="mt-12">
        <h2 id="judul-perhatian" className="text-lg font-bold text-ink">
          Perlu perhatian
        </h2>
        {perhatian.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">
            Tidak ada yang menunggu tindakan saat ini.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            {perhatian.map((p) => (
              <li key={p.teks}>
                <Link href={p.href} className="flex min-h-11 items-baseline gap-3 px-4 py-3 hover:bg-canvas/70">
                  <span className="angka w-14 shrink-0 text-right text-base font-extrabold text-ink">{n(p.jumlah)}</span>
                  <span className="min-w-0 text-brand-blue-strong">{p.teks}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {provinsi.data && provinsi.data.length > 0 && (
        <section aria-labelledby="judul-wilayah" className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="judul-wilayah" className="text-lg font-bold text-ink">
              Lima provinsi dengan lahan kosong terbanyak
            </h2>
            <Link
              href="/peluang"
              className="shrink-0 text-sm font-semibold text-brand-blue-strong underline-offset-2 hover:underline"
            >
              Semua provinsi
            </Link>
          </div>
          <div className="mt-4">
            <TabelPeluang
              baris={provinsi.data.slice(0, 5)}
              kolomNama="Provinsi"
              nama={(b) => b.provinsi}
              href={(b) => `/peluang/${encodeURIComponent(b.provinsi)}`}
            />
          </div>
        </section>
      )}
    </>
  );
}

/** Satu nilai uang dengan labelnya sendiri, supaya perkiraan, tawaran, kontrak, dan realisasi tidak tertukar. */
function NilaiUang({ label, nilai, satuan, catatan }: { label: string; nilai: string; satuan?: string; catatan: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-card">
      <dt className="text-xs font-bold tracking-[0.1em] text-brand-blue uppercase">{label}</dt>
      <dd className="angka mt-2 text-2xl leading-none font-extrabold tracking-[-0.02em] text-ink">
        {nilai}
        {satuan && <span className="ml-1.5 text-sm font-medium text-muted">{satuan}</span>}
      </dd>
      <dd className="mt-2 text-xs leading-relaxed text-subtle">{catatan}</dd>
    </div>
  );
}
