"use client";

import "leaflet/dist/leaflet.css";
import type { Map as PetaLeaflet } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { ATRIBUSI_UBIN, UBIN_PETA } from "@/lib/peta";
import type { LokasiDinilai } from "@/lib/temukan/rekomendasi";

type Leaflet = typeof import("leaflet");

const aman = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * Peta hasil: satu titik per SPBU yang punya lokasi di daftar saat ini. Mengeklik titik menyaring daftar
 * ke SPBU itu. Titik peta tidak bisa dijangkau papan ketik, jadi daftar tetap menjadi tampilan utama.
 */
export default function PetaHasil({ daftar, onPilih }: { daftar: LokasiDinilai[]; onPilih: (spbuNomor: string) => void }) {
  const wadah = useRef<HTMLDivElement>(null);
  const pilih = useRef(onPilih);
  useEffect(() => {
    pilih.current = onPilih;
  }, [onPilih]);

  const titik = useMemo(() => {
    const per = new Map<string, { nomor: string; kota: string; lat: number; lng: number; ruang: number; skor: number }>();
    for (const { lokasi: l } of daftar) {
      if (l.lat == null || l.lng == null) continue;
      const t = per.get(l.spbu_nomor);
      if (t) {
        t.ruang += 1;
        t.skor = Math.max(t.skor, l.skor);
      } else per.set(l.spbu_nomor, { nomor: l.spbu_nomor, kota: l.kota ?? l.provinsi, lat: l.lat, lng: l.lng, ruang: 1, skor: l.skor });
    }
    return [...per.values()];
  }, [daftar]);
  const tanpaKoordinat = daftar.filter(({ lokasi: l }) => l.lat == null || l.lng == null).length;

  useEffect(() => {
    let batal = false;
    let peta: PetaLeaflet | null = null;
    (async () => {
      const modul = await import("leaflet");
      const L = ((modul as { default?: Leaflet }).default ?? modul) as Leaflet;
      if (batal || !wadah.current || titik.length === 0) return;
      peta = L.map(wadah.current, { preferCanvas: true, scrollWheelZoom: false, dragging: !L.Browser.mobile, maxZoom: 17 });
      peta.attributionControl.setPrefix(false);
      L.tileLayer(UBIN_PETA, { maxZoom: 19, attribution: ATRIBUSI_UBIN }).addTo(peta);
      for (const t of titik) {
        const m = L.circleMarker([t.lat, t.lng], { radius: Math.min(7 + t.ruang, 14), color: "#ffffff", weight: 2, fillColor: "#006cb8", fillOpacity: 0.9 });
        m.bindTooltip(`<strong>SPBU ${aman(t.nomor)}</strong><br>${aman(t.kota)}<br>${t.ruang} ruang · skor kecocokan tertinggi ${t.skor}`, { direction: "top", offset: [0, -6] });
        m.on("click", () => pilih.current(t.nomor));
        m.addTo(peta);
      }
      peta.fitBounds(L.latLngBounds(titik.map((t) => [t.lat, t.lng] as [number, number])), { padding: [32, 32], maxZoom: 14 });
    })();
    return () => {
      batal = true;
      peta?.remove();
    };
  }, [titik]);

  return (
    <div>
      <div className="peta-sekitar overflow-hidden rounded-xl border border-line bg-white shadow-card">
        {titik.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Lokasi di daftar ini belum punya koordinat yang bisa dipetakan. Buka tampilan daftar untuk melihatnya.</p>
        ) : (
          <div ref={wadah} role="application" aria-label={`Peta ${titik.length} SPBU yang punya lokasi sesuai`} className="h-[420px] w-full sm:h-[520px]" />
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        {titik.length} SPBU di peta. Pilih satu titik untuk melihat ruangnya di daftar.
        {tanpaKoordinat > 0 ? ` ${tanpaKoordinat} lokasi tanpa koordinat hanya tampil di daftar.` : ""}
      </p>
    </div>
  );
}
