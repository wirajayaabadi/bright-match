"use client";

import { BadgeCheck, ChevronDown, CircleAlert, Columns3 } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { Keyakinan } from "@/lib/data-kecocokan";
import { daya, luas } from "@/lib/format";
import { namaJenisUsaha } from "@/lib/istilah";
import { alasanLengkap, alasanUtama, catatanLokasi, KOMPONEN_SKOR, type LokasiDinilai } from "@/lib/temukan/rekomendasi";
import { alamatSpbu, letakRuang, rpRingkas } from "@/lib/temukan/ringkas";
import type { Jawaban } from "@/lib/temukan/tipe";

const NAMA_KEYAKINAN = { tinggi: "Tinggi", sedang: "Sedang", rendah: "Rendah" } as const;
const WARNA_KEYAKINAN = {
  tinggi: "bg-brand-green-soft text-brand-green-strong",
  sedang: "bg-warn-soft text-warn",
  rendah: "bg-brand-red-soft text-brand-red-strong",
} as const;

/** Dua angka yang sengaja dipisah: kecocokan dari mesin, dan kesesuaian dengan preferensi pengguna. */
function Angka({ nama, nilai, ket }: { nama: string; nilai: number | null; ket: string }) {
  return (
    <div className="min-w-[5.5rem]">
      <dt className="text-xs font-semibold text-subtle">{nama}</dt>
      <dd className="angka mt-0.5 text-2xl leading-none font-extrabold tracking-[-0.02em] text-ink">
        {nilai ?? "–"}
        {nilai != null && <span className="text-sm font-semibold text-subtle"> / 100</span>}
      </dd>
      <dd className="mt-1 text-xs text-subtle">{ket}</dd>
    </div>
  );
}

/**
 * Kartu rekomendasi lokasi (LocationRecommendationCard). Yang tampil hanya data yang boleh dilihat umum:
 * alamat SPBU, ukuran ruang, dan tarif acuan Brightspace. Rinciannya dibuka di tempat, tanpa pindah halaman.
 */
export default function KartuLokasi({
  item,
  jawaban,
  keyakinan,
  terbuka,
  onBuka,
  dibandingkan,
  bandingPenuh,
  onBanding,
  aksi,
  umpan,
}: {
  item: LokasiDinilai;
  jawaban: Jawaban;
  /** undefined = sedang dimuat; null = tidak tersedia. */
  keyakinan: Keyakinan | null | undefined;
  terbuka: boolean;
  onBuka: () => void;
  dibandingkan: boolean;
  /** Sudah tiga lokasi dipilih: lokasi lain belum bisa ditambahkan. */
  bandingPenuh: boolean;
  onBanding: () => void;
  /** Tindakan minat: berbeda untuk pengunjung tanpa akun dan tenant berakun. */
  aksi?: ReactNode;
  /** Penilaian pengguna atas rekomendasi ini. */
  umpan?: ReactNode;
}) {
  const { lokasi: l, sesuai } = item;
  const id = useId();
  const catatan = catatanLokasi(l, jawaban);
  const rinci = [l.luas_m2 != null ? luas(l.luas_m2) : "Luas belum tercatat", ...letakRuang(l), l.daya_w != null ? daya(l.daya_w) : "Daya belum tercatat"];

  return (
    <article aria-labelledby={`${id}-judul`} className="rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id={`${id}-judul`} className="angka text-lg leading-snug font-bold text-ink">
            SPBU {l.spbu_nomor} <span className="ml-1 text-sm font-semibold text-subtle">ruang {l.kode}</span>
          </h3>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{alamatSpbu(l)}</p>
        </div>
        <dl className="flex shrink-0 gap-6">
          <Angka nama="Kecocokan" nilai={l.skor} ket="pola jaringan" />
          <Angka nama="Preferensi" nilai={sesuai.skor} ket={sesuai.skor == null ? "belum bisa dinilai" : "prioritas Anda"} />
        </dl>
      </div>

      <ul className="mt-4 flex flex-wrap gap-1.5 text-sm">
        {rinci.map((x) => (
          <li key={x} className="angka rounded-md border border-line bg-canvas px-2.5 py-1 text-ink">
            {x}
          </li>
        ))}
        <li className="angka rounded-md border border-line bg-canvas px-2.5 py-1 text-ink">
          {l.tarif_tahunan != null ? `Tarif acuan ${rpRingkas(l.tarif_tahunan)} per tahun` : "Tarif acuan belum tercatat"}
        </li>
      </ul>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          {l.terverifikasi ? (
            <>
              <BadgeCheck aria-hidden="true" className="size-4 text-brand-green-strong" /> Sudah diverifikasi di lokasi
            </>
          ) : (
            "Belum diverifikasi di lokasi"
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          Keyakinan data:
          {keyakinan === undefined ? (
            <span role="status" className="inline-block h-5 w-24 animate-pulse rounded bg-line/70" aria-label="Memuat keyakinan data" />
          ) : keyakinan === null ? (
            <span>belum tersedia</span>
          ) : (
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${WARNA_KEYAKINAN[keyakinan.tingkat]}`}>
              {NAMA_KEYAKINAN[keyakinan.tingkat]}, {keyakinan.terpenuhi} dari {keyakinan.total} butir
            </span>
          )}
        </span>
      </p>

      <div className="mt-4 border-t border-line pt-4">
        <h4 className="text-sm font-bold text-ink">Mengapa lokasi ini disarankan untuk usaha {namaJenisUsaha(l.segmen).toLowerCase()}</h4>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          {alasanUtama(l, sesuai).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      {catatan.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm leading-relaxed text-warn">
          {catatan.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {c}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-2.5">
        <button
          type="button"
          onClick={onBuka}
          aria-expanded={terbuka}
          aria-controls={`${id}-rinci`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-brand-blue/60"
        >
          {terbuka ? "Tutup detail" : "Lihat detail"}
          <span className="sr-only"> ruang {l.kode}</span>
          <ChevronDown aria-hidden="true" className={`size-4.5 transition-transform duration-150 ${terbuka ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onBanding}
          aria-pressed={dibandingkan}
          aria-disabled={bandingPenuh && !dibandingkan}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-[15px] font-semibold transition-colors duration-150 ${
            dibandingkan ? "border-brand-blue bg-brand-blue-soft text-brand-blue-strong" : bandingPenuh ? "border-line bg-white text-subtle" : "border-line bg-white text-ink hover:border-brand-blue/60"
          }`}
        >
          <Columns3 aria-hidden="true" className="size-4.5" />
          {dibandingkan ? "Dibandingkan" : "Bandingkan"}
          <span className="sr-only">: ruang {l.kode}</span>
        </button>
        {aksi}
      </div>
      {umpan}

      {terbuka && (
        <div id={`${id}-rinci`} className="temukan-masuk mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-2">
          <section>
            <h4 className="text-sm font-bold text-ink">Skor kecocokan: {l.skor} dari 100</h4>
            <p className="mt-1 text-xs leading-relaxed text-subtle">Dihitung mesin kecocokan dari pola yang sudah ada di jaringan SPBU. Bukan perkiraan hasil usaha.</p>
            <dl className="mt-3 divide-y divide-line text-sm">
              {KOMPONEN_SKOR.map((k) => (
                <div key={k.kunci} className="flex items-baseline justify-between gap-4 py-1.5">
                  <dt className="text-muted">{k.nama}</dt>
                  <dd className="angka font-semibold text-ink">
                    {String(l[k.kunci]).replace(".", ",")} <span className="font-normal text-subtle">dari {k.maks}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              {alasanLengkap(l).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-sm font-bold text-ink">Kesesuaian preferensi: {sesuai.skor == null ? "belum bisa dinilai" : `${sesuai.skor} dari 100`}</h4>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Rata-rata berbobot dari hal yang Anda sebut penting: prioritas pertama berbobot 3, kedua 2, ketiga 1, yang lain 1. Yang belum ada datanya tidak dihitung.
            </p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {sesuai.faktor.map((f) => (
                <li key={f.kunci} className="py-2">
                  <p className="flex items-baseline justify-between gap-4">
                    <span className="font-semibold text-ink">{f.nama}</span>
                    <span className="angka shrink-0 text-muted">
                      {f.nilai == null ? "belum ada data" : `${Math.round(f.nilai * 100)}%`} · bobot {f.bobot}
                    </span>
                  </p>
                  <p className="mt-0.5 leading-relaxed text-muted">{f.alasan}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="lg:col-span-2">
            <h4 className="text-sm font-bold text-ink">Keyakinan data</h4>
            <p className="mt-1 text-xs leading-relaxed text-subtle">Menilai mutu data di balik rekomendasi ini, terpisah dari kecocokan. Aturannya sama dengan yang dipakai tim Non Fuel Retail.</p>
            {keyakinan ? (
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {keyakinan.butir.map((b) => (
                  <li key={b.nama} className="flex gap-2 leading-relaxed">
                    <span className={`shrink-0 font-semibold ${b.ok ? "text-brand-green-strong" : "text-brand-red-strong"}`}>{b.ok ? "Ada:" : "Belum:"}</span>
                    <span className="text-ink">{b.nama}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">{keyakinan === undefined ? "Memuat keyakinan data…" : "Keyakinan data untuk ruang ini belum bisa dimuat."}</p>
            )}
            {l.fasilitas.length > 0 && (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                <span className="font-semibold text-ink">Fasilitas SPBU:</span> {l.fasilitas.join(", ")}
              </p>
            )}
          </section>
        </div>
      )}
    </article>
  );
}
