import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import TabelPeluang from "@/components/tabel-peluang";
import { JudulHalaman, KartuAngka, Rangka } from "@/components/ui";
import { getPeluangProvinsi, getRingkasan } from "@/lib/data";
import { n, pct, rp } from "@/lib/format";
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

async function Ringkasan() {
  const [ringkasan, provinsi] = await Promise.all([getRingkasan(), getPeluangProvinsi()]);
  if (ringkasan.galat) return <PanelGalat galat={ringkasan.galat} />;

  const r = ringkasan.data;
  const kosongPct = r.lahan > 0 ? (100 * r.lahan_kosong) / r.lahan : null;

  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuAngka
          label="Lahan kosong"
          nilai={n(r.lahan_kosong)}
          catatan={`${pct(kosongPct)} dari ${n(r.lahan)} lahan, di ${n(r.spbu_dengan_kosong)} SPBU`}
        />
        <KartuAngka label="Okupansi" nilai={pct(r.okupansi_pct)} catatan={`${n(r.lahan_tersewa)} lahan tersewa`} />
        <KartuAngka
          label="Potensi sewa per tahun"
          nilai={rp(r.potensi_sewa_bertarif)}
          catatan={`Dari ${n(r.kosong_bertarif)} lahan kosong yang tarifnya tercantum`}
        />
        <KartuAngka label="Tenant aktif" nilai={n(r.tenant)} catatan={`Di ${n(r.spbu)} SPBU`} />
      </dl>

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
