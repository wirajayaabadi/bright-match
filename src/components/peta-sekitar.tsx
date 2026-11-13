"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as PetaLeaflet, PathOptions } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { n } from "@/lib/format";
import {
  ATRIBUSI_UBIN,
  KELOMPOK_PETA,
  LAPIS_RUMPUN,
  RADIUS_PETA,
  RUMPUN,
  UBIN_PETA,
  type PetaSpbu,
  type RadiusPeta,
  type Rumpun,
} from "@/lib/peta";

type Leaflet = typeof import("leaflet");

const M_PER_DERAJAT_LINTANG = 110_574;
const M_PER_DERAJAT_BUJUR = 111_320;

const namaRadius = (r: number) => (r >= 1000 ? `${r / 1000} km` : `${r} m`);

const aman = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Tampilan satu titik. Saat satu kelompok disorot, titik kelompok lain diredupkan, bukan dihapus. */
function gaya(kelompok: number, sorot: number | null): PathOptions & { radius: number } {
  const rumpun = KELOMPOK_PETA[kelompok]?.rumpun ?? "lain";
  if (sorot != null && sorot !== kelompok) {
    return { radius: 2.5, stroke: false, fillColor: "#98a2b3", fillOpacity: 0.35 };
  }
  const disorot = sorot === kelompok;
  if (rumpun === "lain") {
    return { radius: disorot ? 5 : 3, stroke: disorot, color: "#ffffff", weight: 1, fillColor: RUMPUN.lain.warna, fillOpacity: disorot ? 0.9 : 0.5 };
  }
  return { radius: disorot ? 6 : 4.5, stroke: true, color: "#ffffff", weight: disorot ? 1.5 : 1, fillColor: RUMPUN[rumpun].warna, fillOpacity: 0.92 };
}

/**
 * Peta tempat usaha dan fasilitas dalam 1 km dari satu SPBU (Overture Maps).
 * Leaflet dimuat hanya di peramban; di server komponen ini menggambar kendali dan wadah kosong.
 */
export default function PetaSekitar({ data }: { data: PetaSpbu }) {
  const wadah = useRef<HTMLDivElement>(null);
  const rujukan = useRef<{ L: Leaflet; peta: PetaLeaflet; penanda: (CircleMarker | null)[]; pusat: CircleMarker } | null>(null);
  const [versi, setVersi] = useState(0);
  const [radius, setRadius] = useState<RadiusPeta>(1000);
  const [sorot, setSorot] = useState<number | null>(null);

  const jarak = useMemo(() => data.titik.map(([dx, dy]) => Math.round(Math.hypot(dx, dy))), [data]);

  // Jumlah per kelompok di dalam radius yang dipilih.
  const hitung = useMemo(() => {
    const h = KELOMPOK_PETA.map(() => 0);
    data.titik.forEach(([, , k], i) => {
      if (jarak[i] <= radius && k in h) h[k] += 1;
    });
    return h;
  }, [data, jarak, radius]);
  const total = hitung.reduce((a, b) => a + b, 0);
  const perRumpun = (r: Rumpun) => KELOMPOK_PETA.reduce((a, k, i) => (k.rumpun === r ? a + hitung[i] : a), 0);

  // Kelompok yang disorot bisa menjadi kosong saat radius dipersempit; sorotan lalu dianggap tidak ada.
  const sorotAktif = sorot != null && hitung[sorot] > 0 ? sorot : null;

  const terdekat = useMemo(() => {
    if (sorotAktif == null) return [];
    const hasil: { nama: string; jarak: number }[] = [];
    for (let i = 0; i < data.titik.length && hasil.length < 8; i++) {
      if (data.titik[i][2] === sorotAktif && jarak[i] <= radius) hasil.push({ nama: data.titik[i][3], jarak: jarak[i] });
    }
    return hasil;
  }, [data, jarak, radius, sorotAktif]);

  // Membuat peta sekali per SPBU.
  useEffect(() => {
    let batal = false;
    let peta: PetaLeaflet | null = null;
    (async () => {
      const modul = await import("leaflet");
      const L = ((modul as { default?: Leaflet }).default ?? modul) as Leaflet;
      if (batal || !wadah.current) return;

      const { lat, lng } = data;
      const keLatLng = (dx: number, dy: number): [number, number] => [
        lat + dy / M_PER_DERAJAT_LINTANG,
        lng + dx / (M_PER_DERAJAT_BUJUR * Math.cos((lat * Math.PI) / 180)),
      ];

      peta = L.map(wadah.current, {
        center: [lat, lng],
        zoom: 15,
        minZoom: 13,
        maxZoom: 19,
        preferCanvas: true,
        // Roda tetikus dan geser satu jari tetap menggulung halaman, tidak menjebak pengguna di peta.
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
      });
      peta.attributionControl.setPrefix(false);
      L.tileLayer(UBIN_PETA, { maxZoom: 19, attribution: `${ATRIBUSI_UBIN} · Tempat: Overture Maps Foundation` }).addTo(peta);

      for (const r of RADIUS_PETA) {
        L.circle([lat, lng], { radius: r, color: "#101828", weight: 1, opacity: 0.55, dashArray: "4 5", fill: false, interactive: false }).addTo(peta);
        L.tooltip({ permanent: true, direction: "center", className: "peta-label", interactive: false })
          .setLatLng(keLatLng(0, r))
          .setContent(namaRadius(r))
          .addTo(peta);
      }

      // Titik dibuat per lapis agar tempat makan dan pertokoan tidak tertutup kelompok "lainnya".
      const penanda: (CircleMarker | null)[] = data.titik.map(() => null);
      for (const lapis of LAPIS_RUMPUN) {
        data.titik.forEach(([dx, dy, k, nama], i) => {
          if ((KELOMPOK_PETA[k]?.rumpun ?? "lain") !== lapis) return;
          const m = L.circleMarker(keLatLng(dx, dy), gaya(k, null));
          m.bindTooltip(
            () =>
              `<strong>${aman(nama || "Tanpa nama")}</strong><br>${aman(KELOMPOK_PETA[k]?.nama ?? "Lainnya")} · ${n(Math.round(Math.hypot(dx, dy)))} m`,
            { direction: "top", offset: [0, -4] },
          );
          penanda[i] = m;
        });
      }

      const pusat = L.circleMarker([lat, lng], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#ed1b2f", fillOpacity: 1 });
      pusat.bindTooltip(`<strong>SPBU ${aman(data.nomor)}</strong>`, { direction: "top", offset: [0, -8] });
      pusat.addTo(peta);

      rujukan.current = { L, peta, penanda, pusat };
      setVersi((v) => v + 1);
    })();
    return () => {
      batal = true;
      rujukan.current = null;
      peta?.remove();
    };
  }, [data]);

  // Titik di luar radius dilepas; sisanya diberi gaya sesuai sorotan.
  useEffect(() => {
    const r = rujukan.current;
    if (!r) return;
    const atas: CircleMarker[] = [];
    r.penanda.forEach((m, i) => {
      if (!m) return;
      const k = data.titik[i][2];
      if (jarak[i] > radius) {
        if (r.peta.hasLayer(m)) m.remove();
        return;
      }
      m.setStyle(gaya(k, sorotAktif));
      if (!r.peta.hasLayer(m)) m.addTo(r.peta);
      if (k === sorotAktif) atas.push(m);
    });
    atas.forEach((m) => m.bringToFront());
    r.pusat.bringToFront();
  }, [versi, data, jarak, radius, sorotAktif]);

  // Bingkai mengikuti radius.
  useEffect(() => {
    const r = rujukan.current;
    if (!r) return;
    r.peta.fitBounds(r.L.latLng(data.lat, data.lng).toBounds(radius * 2.15), { animate: false });
  }, [versi, data, radius]);

  const tombol = "rounded-full border px-3 py-1 text-sm transition-colors";
  const hidup = "border-brand-blue bg-brand-blue-soft font-semibold text-brand-blue-strong";
  const mati = "border-line bg-white text-muted hover:border-subtle hover:text-ink";

  return (
    <div className="peta-sekitar rounded-xl border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-sm text-muted">
          <span className="angka text-base font-bold text-ink">{n(total)}</span> tempat dalam {namaRadius(radius)}
          {sorotAktif != null && (
            <>
              {" · "}
              <span className="angka font-semibold text-ink">{n(hitung[sorotAktif])}</span> {KELOMPOK_PETA[sorotAktif].nama.toLowerCase()}
            </>
          )}
        </p>
        <div role="group" aria-label="Radius peta" className="flex items-center gap-2">
          <span className="text-xs text-subtle">Radius</span>
          {RADIUS_PETA.map((r) => (
            <button key={r} type="button" aria-pressed={radius === r} onClick={() => setRadius(r)} className={`${tombol} ${radius === r ? hidup : mati}`}>
              {namaRadius(r)}
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Sorot kelompok tempat" className="mt-3 flex flex-wrap gap-2">
        <button type="button" aria-pressed={sorotAktif == null} onClick={() => setSorot(null)} className={`${tombol} ${sorotAktif == null ? hidup : mati}`}>
          Semua
        </button>
        {KELOMPOK_PETA.map((k, i) =>
          hitung[i] > 0 ? (
            <button
              key={k.kunci}
              type="button"
              aria-pressed={sorotAktif === i}
              onClick={() => setSorot(sorotAktif === i ? null : i)}
              className={`${tombol} inline-flex items-center gap-2 ${sorotAktif === i ? hidup : mati}`}
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: RUMPUN[k.rumpun].warna }} />
              {k.nama}
              <span className="angka text-xs text-subtle">{n(hitung[i])}</span>
            </button>
          ) : null,
        )}
      </div>

      <div
        ref={wadah}
        role="region"
        aria-label={`Peta tempat di sekitar SPBU ${data.nomor}`}
        className="relative isolate z-0 mt-4 h-[380px] overflow-hidden rounded-lg border border-line bg-canvas sm:h-[480px]"
      />

      {total === 0 && (
        <p className="mt-3 text-sm text-subtle">Overture Maps tidak mencatat tempat dalam {namaRadius(radius)} dari SPBU ini.</p>
      )}

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-white bg-brand-red ring-1 ring-line" />
          SPBU {data.nomor}
        </li>
        {(Object.keys(RUMPUN) as Rumpun[]).map((r) =>
          perRumpun(r) > 0 ? (
            <li key={r} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: RUMPUN[r].warna }} />
              {RUMPUN[r].nama}
              {r === "kegiatan" && " (kantor, sekolah, kesehatan, hotel, industri, transportasi)"}
              <span className="angka text-subtle">{n(perRumpun(r))}</span>
            </li>
          ) : null,
        )}
      </ul>

      {sorotAktif != null && terdekat.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">{KELOMPOK_PETA[sorotAktif].nama} terdekat</h3>
          <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-sm md:grid-cols-2">
            {terdekat.map((t, i) => (
              <li key={`${t.nama}-${t.jarak}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-ink">{t.nama || "Tanpa nama"}</span>
                <span className="angka shrink-0 text-xs text-subtle">{n(t.jarak)} m</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-subtle">
        Tempat: Overture Maps Foundation{data.sumber ? ` (${data.sumber.replace(/^Overture Maps\s*/, "rilis ")})` : ""}, hanya yang tingkat keyakinannya 0,5 ke atas.
        Arahkan kursor ke titik untuk melihat namanya. Data terbuka bisa tertinggal dari keadaan di lapangan.
      </p>
    </div>
  );
}
