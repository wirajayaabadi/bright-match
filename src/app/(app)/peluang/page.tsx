import type { Metadata } from "next";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import TabelPeluang, { CatatanPotensi } from "@/components/tabel-peluang";
import { Bagian, BingkaiTabel, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getPeluangProvinsi } from "@/lib/data";
import { getPeluangTipe } from "@/lib/data-tahap2";
import { n, pct, rp } from "@/lib/format";
import { artiTipe, namaTipe } from "@/lib/tipe-lokasi";

export const metadata: Metadata = { title: "Peta peluang" };

export default function PetaPeluang() {
  return (
    <>
      <JudulHalaman
        label="Modul 1"
        judul="Peta peluang"
        keterangan="Lahan kosong dan nilai sewa yang belum terisi di setiap provinsi. Pilih provinsi untuk melihat rincian per kota."
      />
      <Suspense fallback={<Rangka baris={8} />}>
        <Isi />
      </Suspense>
    </>
  );
}

async function Isi() {
  const [hasil, tipe] = await Promise.all([getPeluangProvinsi(), getPeluangTipe()]);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;

  return (
    <>
      <TabelPeluang
        baris={hasil.data}
        kolomNama="Provinsi"
        nama={(b) => b.provinsi}
        href={(b) => `/peluang/${encodeURIComponent(b.provinsi)}`}
      />
      <CatatanPotensi />

      {tipe.data && tipe.data.length > 0 && (
        <Bagian
          judul="Lahan kosong per tipe lokasi"
          keterangan="Tipe lokasi diperkirakan dari data terbuka di sekitar tiap SPBU. SPBU tanpa koordinat yang bisa dipakai tidak masuk tabel ini."
        >
          <BingkaiTabel>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  Tipe lokasi
                </th>
                <th scope="col" className={thKanan}>
                  SPBU
                </th>
                <th scope="col" className={thKanan}>
                  Lahan kosong
                </th>
                <th scope="col" className={thKanan}>
                  Okupansi
                </th>
                <th scope="col" className={thKanan}>
                  Potensi sewa/tahun
                </th>
                <th scope="col" className={thKanan}>
                  Rata-rata penduduk 3 km
                </th>
              </tr>
            </thead>
            <tbody>
              {tipe.data.map((t) => (
                <tr key={t.tipe_lokasi} className="border-b border-line last:border-b-0">
                  <th scope="row" className={`${td} text-left font-normal`}>
                    <span className="font-semibold text-ink">{namaTipe(t.tipe_lokasi)}</span>
                    <p className="mt-0.5 max-w-md text-xs leading-relaxed text-subtle">{artiTipe(t.tipe_lokasi)}</p>
                  </th>
                  <td className={`${tdAngka} text-muted`}>{n(t.spbu)}</td>
                  <td className={`${tdAngka} font-semibold text-ink`}>{n(t.lahan_kosong)}</td>
                  <td className={`${tdAngka} text-muted`}>{pct(t.okupansi_pct)}</td>
                  <td className={`${tdAngka} font-semibold text-ink`}>{rp(t.potensi_sewa_bertarif)}</td>
                  <td className={`${tdAngka} text-muted`}>{n(t.penduduk_3km_rata)}</td>
                </tr>
              ))}
            </tbody>
          </BingkaiTabel>
        </Bagian>
      )}
    </>
  );
}
