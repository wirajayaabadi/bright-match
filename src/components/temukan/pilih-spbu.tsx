"use client";

import { Fuel, LoaderCircle, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cariSpbu } from "@/app/aksi-temukan";
import { alamatSpbu } from "@/lib/temukan/ringkas";
import type { JawabSpbu, SpbuUmum } from "@/lib/temukan/tipe";

const kotak = "block min-h-12 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:border-brand-blue";

function BarisSpbu({ s, terpilih, onPilih }: { s: SpbuUmum; terpilih: boolean; onPilih: () => void }) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue ${
        terpilih ? "border-brand-blue bg-brand-blue-soft/50 shadow-[inset_0_0_0_1px_var(--color-brand-blue)]" : "border-line hover:border-brand-blue/60"
      }`}
    >
      <input type="radio" name="spbu" checked={terpilih} onChange={onPilih} className="sr-only" />
      <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${terpilih ? "bg-brand-blue text-white" : "bg-canvas text-muted"}`}>
        <Fuel aria-hidden="true" strokeWidth={1.75} className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="angka block text-[15px] font-semibold text-ink">SPBU {s.nomor}</span>
        <span className="block text-sm leading-snug text-muted">{alamatSpbu(s)}</span>
      </span>
    </label>
  );
}

/**
 * Pemilih SPBU. Pencarian hanya membuka alamat SPBU. Memilih satu SPBU tidak mengklaim apa pun:
 * jawabannya dicatat sebagai preferensi sampai wewenangnya dipastikan tim NFR.
 */
export default function PilihSpbu({
  nilai,
  spbuSaya,
  galat,
  onUbah,
  onSentuh,
}: {
  nilai: JawabSpbu | undefined;
  /** SPBU yang wewenangnya sudah dipastikan untuk akun yang sedang masuk, bila ada. */
  spbuSaya: SpbuUmum[];
  galat: Record<string, string>;
  onUbah: (nilai: JawabSpbu | undefined) => void;
  onSentuh: (kolom: string) => void;
}) {
  const id = useId();
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState<{ untuk: string; daftar: SpbuUmum[] } | null>(null);
  const [gagal, setGagal] = useState(false);
  const urut = useRef(0);
  const manual = nilai?.terdaftar === false;
  const kunci = cari.trim();
  const mencari = kunci.length >= 3 && hasil?.untuk !== kunci && !gagal;

  useEffect(() => {
    if (kunci.length < 3) return;
    const ini = ++urut.current;
    const tunda = setTimeout(async () => {
      try {
        const daftar = await cariSpbu(kunci);
        if (ini === urut.current) {
          setHasil({ untuk: kunci, daftar });
          setGagal(false);
        }
      } catch {
        if (ini === urut.current) setGagal(true);
      }
    }, 300);
    return () => clearTimeout(tunda);
  }, [kunci]);

  const pilih = (s: SpbuUmum) => onUbah({ terdaftar: true, id: s.id, nomor: s.nomor, alamat: s.alamat, kota: s.kota, provinsi: s.provinsi });
  const terpilih = nilai?.terdaftar === true ? nilai : null;
  const daftar = kunci.length >= 3 && hasil?.untuk === kunci ? hasil.daftar : [];
  const diTampilkan = terpilih && !daftar.some((s) => s.id === terpilih.id) && !spbuSaya.some((s) => s.id === terpilih.id);

  return (
    <div className="space-y-6">
      {spbuSaya.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">SPBU Anda</h2>
          <p className="mt-0.5 text-sm text-muted">Wewenang akun Anda atas SPBU ini sudah tercatat.</p>
          <div className="mt-2.5 grid gap-2.5">
            {spbuSaya.map((s) => (
              <BarisSpbu key={s.id} s={s} terpilih={terpilih?.id === s.id} onPilih={() => pilih(s)} />
            ))}
          </div>
        </div>
      )}

      {!manual && (
        <div>
          <label htmlFor={`${id}-cari`} className="block text-sm font-semibold text-ink">
            {spbuSaya.length > 0 ? "Cari SPBU lain" : "Cari SPBU"}
          </label>
          <div className="relative mt-1.5">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-subtle" />
            <input
              id={`${id}-cari`}
              type="search"
              autoComplete="off"
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setGagal(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              aria-describedby={`${id}-status`}
              className={`${kotak} border-line pl-10`}
            />
          </div>
          <p id={`${id}-status`} role="status" className="mt-1.5 flex min-h-5 items-center gap-2 text-xs leading-relaxed text-subtle">
            {mencari ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> Mencari SPBU…
              </>
            ) : gagal ? (
              "Pencarian belum berhasil. Periksa sambungan Anda, lalu ketik lagi."
            ) : kunci.length < 3 ? (
              "Ketik paling sedikit tiga huruf atau angka, misalnya 3415 atau Fatmawati."
            ) : daftar.length === 0 ? (
              `Tidak ada SPBU yang cocok dengan “${kunci}”. Periksa ejaannya, atau daftarkan sebagai SPBU yang belum terdaftar.`
            ) : (
              `${daftar.length} SPBU teratas. Ketik lebih rinci bila SPBU Anda belum tampil.`
            )}
          </p>
          {(daftar.length > 0 || diTampilkan) && (
            <div className="mt-3 grid gap-2.5">
              {diTampilkan && terpilih && <BarisSpbu s={terpilih} terpilih onPilih={() => {}} />}
              {daftar.map((s) => (
                <BarisSpbu key={s.id} s={s} terpilih={terpilih?.id === s.id} onPilih={() => pilih(s)} />
              ))}
            </div>
          )}
        </div>
      )}

      {manual && nilai?.terdaftar === false && (
        <div className="temukan-masuk rounded-xl border border-line bg-white p-5">
          <h2 className="text-base font-bold text-ink">SPBU yang belum terdaftar</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Kami catat sebagai permintaan penambahan. Tim Non Fuel Retail memeriksanya dulu sebelum SPBU ini tampil di Bright Match.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-nomor`} className="block text-sm font-semibold text-ink">
                Nomor SPBU <span className="font-normal text-subtle">(opsional)</span>
              </label>
              <input
                id={`${id}-nomor`}
                data-kolom="nomor"
                inputMode="numeric"
                maxLength={20}
                autoComplete="off"
                value={nilai.nomor}
                onChange={(e) => onUbah({ ...nilai, nomor: e.target.value })}
                onBlur={() => onSentuh("nomor")}
                aria-invalid={galat.nomor ? true : undefined}
                aria-describedby={galat.nomor ? `${id}-nomor-galat` : undefined}
                className={`${kotak} angka mt-1.5 ${galat.nomor ? "border-brand-red" : "border-line"}`}
              />
              {galat.nomor && (
                <p id={`${id}-nomor-galat`} className="mt-1 text-sm text-brand-red-strong">
                  {galat.nomor}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`${id}-kota`} className="block text-sm font-semibold text-ink">
                Kota atau kabupaten
              </label>
              <input
                id={`${id}-kota`}
                data-kolom="kota"
                maxLength={80}
                autoComplete="address-level2"
                value={nilai.kota}
                onChange={(e) => onUbah({ ...nilai, kota: e.target.value })}
                onBlur={() => onSentuh("kota")}
                aria-invalid={galat.kota ? true : undefined}
                aria-describedby={galat.kota ? `${id}-kota-galat` : undefined}
                className={`${kotak} mt-1.5 ${galat.kota ? "border-brand-red" : "border-line"}`}
              />
              {galat.kota && (
                <p id={`${id}-kota-galat`} className="mt-1 text-sm text-brand-red-strong">
                  {galat.kota}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-catatan`} className="block text-sm font-semibold text-ink">
                Alamat atau catatan <span className="font-normal text-subtle">(opsional)</span>
              </label>
              <input
                id={`${id}-catatan`}
                maxLength={300}
                autoComplete="off"
                value={nilai.catatan}
                onChange={(e) => onUbah({ ...nilai, catatan: e.target.value })}
                className={`${kotak} mt-1.5 border-line`}
              />
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onUbah(manual ? undefined : { terdaftar: false, nomor: /^[0-9. -]{4,20}$/.test(kunci) ? kunci : "", kota: "", catatan: "" })}
        className="inline-flex min-h-11 items-center rounded-lg text-[15px] font-semibold text-brand-blue-strong hover:underline"
      >
        {manual ? "Cari di daftar SPBU" : "SPBU saya belum terdaftar"}
      </button>
    </div>
  );
}
