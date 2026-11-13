import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getPlaybook } from "@/lib/data-tahap2";
import { luas, n, pct, rp } from "@/lib/format";
import { PLAYBOOK, SURVEI } from "@/lib/playbook";
import { namaTipe } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Playbook jenis usaha" };

export default function DaftarPlaybook() {
  return (
    <>
      <JudulHalaman
        label="Modul 5"
        judul="Playbook jenis usaha"
        keterangan="Untuk tiap jenis usaha: siapa pelanggannya, bagaimana alur kunjungannya di SPBU, berapa lama mereka singgah, dan lokasi seperti apa yang cocok."
      />
      <Suspense fallback={<Rangka baris={6} />}>
        <Isi />
      </Suspense>
      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-subtle">
        Segmen pelanggan dan alur kunjungan adalah usulan awal yang belum divalidasi lewat pengamatan lapangan. Bukti
        permintaan berasal dari {SURVEI}. Angka jaringan dihitung dari lahan yang sedang tersewa.
      </p>
    </>
  );
}

async function Isi() {
  const hasil = await getPlaybook();
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const statistik = new Map((hasil.data ?? []).map((s) => [s.segmen, s]));

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {PLAYBOOK.map((p) => {
        const s = statistik.get(p.segmen);
        const tipe = s?.tipe_lokasi.filter((t) => t.spbu >= 5)[0];
        return (
          <li key={p.slug}>
            <Link
              href={`/playbook/${p.slug}`}
              className="flex h-full flex-col rounded-xl border border-line bg-white p-5 shadow-card transition-colors hover:border-brand-blue"
            >
              <span className="text-lg font-bold text-ink">{p.nama}</span>
              <span className="mt-1 text-sm leading-relaxed text-muted">{p.ringkas}</span>
              {s && (
                <dl className="angka mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-subtle">Ada di</dt>
                    <dd className="font-bold text-ink">{pct(s.spbu_pct)} SPBU</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Luas biasa</dt>
                    <dd className="font-bold text-ink">{luas(s.luas_median)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Sewa biasa</dt>
                    <dd className="font-bold text-ink">{s.tarif_median != null ? `${rp(s.tarif_median)}/th` : "–"}</dd>
                  </div>
                </dl>
              )}
              {s && (
                <span className="mt-3 text-xs leading-relaxed text-subtle">
                  {n(s.tenant)} tenant di {n(s.spbu)} SPBU
                  {tipe ? `. Paling sering di lokasi ${namaTipe(tipe.tipe_lokasi).toLowerCase()} (${tipe.lift.toFixed(2).replace(".", ",")}×).` : "."}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
