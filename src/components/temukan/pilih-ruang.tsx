"use client";

import { BadgeCheck } from "lucide-react";
import { useId } from "react";
import { KartuPilihan } from "@/components/temukan/kartu-pilihan";
import { Rangka } from "@/components/ui";
import { daya, luas } from "@/lib/format";
import { letakRuang } from "@/lib/temukan/ringkas";
import type { JawabRuang, JawabSpbu, SpbuRinci } from "@/lib/temukan/tipe";

const KOSONG: JawabRuang = { semua: false, lahan: [], usul: "" };

/** Rincian SPBU yang sedang dimuat, sudah ada, atau gagal dimuat. */
export type MuatanSpbu = { status: "memuat" } | { status: "gagal" } | { status: "ada"; spbu: SpbuRinci | null };

/**
 * Pemilih ruang usaha. Hanya ruang kosong yang tercatat di Brightspace yang tampil; ruang yang sudah
 * tersewa dan penyewanya tidak dibuka di sini. Ruang yang belum ada bisa diusulkan untuk diperiksa.
 */
export default function PilihRuang({
  spbu,
  muatan,
  nilai,
  onUbah,
  onMuatLagi,
}: {
  spbu: JawabSpbu | undefined;
  muatan: MuatanSpbu;
  nilai: JawabRuang | undefined;
  onUbah: (nilai: JawabRuang) => void;
  onMuatLagi: () => void;
}) {
  const v = nilai ?? KOSONG;
  const id = useId();
  const ruang = muatan.status === "ada" ? (muatan.spbu?.ruang ?? []) : [];

  return (
    <div className="space-y-5">
      {spbu?.terdaftar && (
        <p className="angka text-sm font-semibold text-ink">
          SPBU {spbu.nomor}
          <span className="font-normal text-muted"> · {[spbu.kota, spbu.provinsi].filter(Boolean).join(", ")}</span>
        </p>
      )}

      {muatan.status === "memuat" && <Rangka baris={3} />}

      {muatan.status === "gagal" && (
        <div role="alert" className="rounded-xl border border-line bg-white p-5">
          <p className="text-[15px] font-semibold text-ink">Daftar ruang belum bisa dimuat</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">Periksa sambungan Anda, lalu muat lagi. Anda juga bisa mengusulkan ruang di bawah.</p>
          <button type="button" onClick={onMuatLagi} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:border-brand-blue/60">
            Muat lagi daftar ruang
          </button>
        </div>
      )}

      {muatan.status === "ada" && ruang.length === 0 && (
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-[15px] font-semibold text-ink">Belum ada ruang kosong yang tercatat untuk SPBU ini</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Bila ada ruang yang bisa dipakai, tuliskan di bawah. Tim Non Fuel Retail memeriksanya dulu sebelum ruang itu ditawarkan.
          </p>
        </div>
      )}

      {ruang.length > 0 && (
        <>
          {ruang.length > 1 && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={v.semua}
                onChange={(e) => onUbah({ ...v, semua: e.target.checked, lahan: [] })}
                className="size-5 shrink-0 accent-[var(--color-brand-blue)]"
              />
              Semua {ruang.length} ruang kosong
            </label>
          )}
          <div className="grid gap-2.5">
            {ruang.map((r) => {
              const terpilih = v.semua || v.lahan.some((l) => l.lahan_id === r.lahan_id);
              const rinci = [r.luas_m2 != null ? luas(r.luas_m2) : null, ...letakRuang(r), r.daya_w != null ? daya(r.daya_w) : null].filter(Boolean);
              return (
                <div key={r.lahan_id} className="relative">
                  <KartuPilihan
                    pilihan={{ nilai: r.lahan_id, nama: r.kode, ket: rinci.length > 0 ? rinci.join(" · ") : "Ukuran dan daya belum tercatat" }}
                    nama={`${id}-ruang`}
                    jenis="checkbox"
                    padat
                    terpilih={terpilih}
                    onUbah={() => {
                      const dasar = v.semua ? ruang.map((x) => ({ lahan_id: x.lahan_id, kode: x.kode })) : v.lahan;
                      const baru = terpilih ? dasar.filter((l) => l.lahan_id !== r.lahan_id) : [...dasar, { lahan_id: r.lahan_id, kode: r.kode }];
                      onUbah({ ...v, semua: false, lahan: baru });
                    }}
                  />
                  <p className="mt-1 flex items-center gap-1.5 pl-4 text-xs text-subtle">
                    {r.terverifikasi ? (
                      <>
                        <BadgeCheck aria-hidden="true" className="size-3.5 text-brand-green-strong" /> Sudah diverifikasi di lokasi
                      </>
                    ) : (
                      "Belum diverifikasi di lokasi"
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {muatan.status !== "memuat" && (
        <div>
          <label htmlFor={`${id}-usul`} className="block text-sm font-semibold text-ink">
            Ruang yang belum ada di daftar <span className="font-normal text-subtle">(opsional)</span>
          </label>
          <input
            id={`${id}-usul`}
            maxLength={300}
            autoComplete="off"
            value={v.usul}
            onChange={(e) => onUbah({ ...v, usul: e.target.value })}
            aria-describedby={`${id}-usul-bantu`}
            className="mt-1.5 block min-h-12 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink focus:border-brand-blue"
          />
          <p id={`${id}-usul-bantu`} className="mt-1 text-xs leading-relaxed text-subtle">
            Sebutkan letak dan perkiraan luasnya. Ruang baru ditambahkan setelah diperiksa tim Non Fuel Retail.
          </p>
        </div>
      )}
    </div>
  );
}
