import type { Lingkungan } from "@/lib/data-tahap1";
import { n } from "@/lib/format";
import { artiTipe, ATRIBUSI_LINGKUNGAN, namaTipe } from "@/lib/tipe-lokasi";
import { Lencana } from "./tabel";

const ribuan = (v: number) => (v >= 1000 ? `${n(Math.round(v / 1000))} rb` : n(Math.round(v)));

/** Tipe lokasi sebagai lencana. */
export function LencanaTipe({ tipe }: { tipe: string | null | undefined }) {
  return <Lencana warna={tipe ? "biru" : "netral"}>{namaTipe(tipe)}</Lencana>;
}

/**
 * Lingkungan satu SPBU dari data terbuka: tipe lokasi, penduduk, bauran tempat dalam 1 km,
 * usaha sejenis di dekatnya, dan tempat penting terdekat.
 */
export function PanelLingkungan({
  l,
  poi,
  ringkas = false,
}: {
  l: Lingkungan | null;
  poi?: { nama: string; jenis: string; jarak_m: number }[];
  ringkas?: boolean;
}) {
  if (!l) {
    return (
      <p className="rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">
        Lingkungan SPBU ini belum terhitung karena koordinatnya tidak lengkap atau meragukan di data sumber.
      </p>
    );
  }

  const bauran = [
    ["Tempat makan", l.kuliner_1km],
    ["Pertokoan", l.belanja_1km],
    ["Perkantoran", l.kantor_1km],
    ["Sekolah", l.sekolah_1km],
    ["Hotel & wisata", l.wisata_1km],
    ["Kesehatan", l.kesehatan_1km],
    ["Kampus", l.kampus_1km],
    ["Industri & gudang", l.industri_1km],
    ["Stasiun, terminal, bandara", l.transportasi_1km],
  ] as const;
  const sejenis = [
    ["Minimarket", l.minimarket_500m, "500 m"],
    ["Kopi & makanan cepat", l.fnb_500m, "500 m"],
    ["Bank & ATM", l.bank_500m, "500 m"],
    ["Bengkel & perawatan", l.otomotif_500m, "500 m"],
    ["Apotek & klinik", l.apotek_500m, "500 m"],
    ["Jasa kirim paket", l.logistik_500m, "500 m"],
    ["SPBU lain", l.spbu_lain_1km, "1 km"],
    ["Pengisian daya EV", l.ev_1km, "1 km"],
  ] as const;

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-base font-bold text-ink">{namaTipe(l.tipe_lokasi)}</span>
        {l.tipe_kedua && <Lencana>juga {namaTipe(l.tipe_kedua).toLowerCase()}</Lencana>}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{artiTipe(l.tipe_lokasi)}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Angka label="Penduduk dalam 3 km" nilai={ribuan(l.penduduk_3km)} />
        <Angka label="Kepadatan" nilai={`${n(l.penduduk_km2)}/km²`} />
        <Angka label="Tempat usaha dalam 1 km" nilai={n(l.poi_1km)} />
        <Angka label="Tempat usaha dalam 500 m" nilai={n(l.poi_500m)} />
      </dl>

      {!ringkas && (
        <div className="mt-5 grid gap-x-8 gap-y-5 border-t border-line pt-4 md:grid-cols-2">
          <Daftar judul="Dalam 1 km" baris={bauran.map(([nama, v]) => [nama, n(v)])} />
          <Daftar judul="Usaha sejenis di dekat SPBU" baris={sejenis.map(([nama, v, r]) => [`${nama} (${r})`, n(v)])} />
        </div>
      )}

      {!ringkas && poi && poi.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">Tempat penting terdekat</h3>
          <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-sm md:grid-cols-2">
            {poi.map((p) => (
              <li key={`${p.nama}-${p.jarak_m}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-ink">{p.nama}</span> <span className="text-xs text-subtle">· {p.jenis}</span>
                </span>
                <span className="angka shrink-0 text-xs text-subtle">{n(p.jarak_m)} m</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-subtle">
        {ATRIBUSI_LINGKUNGAN} Tipe lokasi adalah perkiraan dari data terbuka dan belum diuji lapangan.
      </p>
    </div>
  );
}

function Angka({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="angka mt-0.5 text-lg font-bold text-ink">{nilai}</dd>
    </div>
  );
}

function Daftar({ judul, baris }: { judul: string; baris: (readonly [string, string])[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">{judul}</h3>
      <dl className="mt-2 space-y-1 text-sm">
        {baris.map(([nama, nilai]) => (
          <div key={nama} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{nama}</dt>
            <dd className="angka font-semibold text-ink">{nilai}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
