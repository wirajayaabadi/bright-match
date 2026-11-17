"use client";

import { useActionState, useRef, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { mulaiInspeksi, tinjauInspeksi, ubahStatusRuang } from "@/app/aksi-inspeksi";

const tombolUtama =
  "inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60";
const tombolKedua =
  "inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle disabled:opacity-60";
const kolom = "mt-1.5 block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm font-normal text-ink focus:border-brand-blue";

function Gagal({ status }: { status: StatusAksi }) {
  if (!status || status.ok) return null;
  return (
    <p role="alert" className="rounded-md bg-brand-red-soft px-2.5 py-1.5 text-sm font-medium text-brand-red-strong">
      {status.pesan}
    </p>
  );
}

/** Memulai inspeksi lokasi satu lahan, atau membuka inspeksi yang masih berjalan. */
export function TombolInspeksi({
  lahanId,
  label,
  utama = true,
  dealer = false,
}: {
  lahanId: string;
  label: string;
  utama?: boolean;
  /** true bila dipakai di portal dealer: formulir dibuka di ruang kerja dealer. */
  dealer?: boolean;
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(mulaiInspeksi, null);
  return (
    <form action={kirim} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="lahan_id" value={lahanId} />
      {dealer && <input type="hidden" name="asal" value="dealer" />}
      <button type="submit" disabled={menunggu} className={utama ? tombolUtama : tombolKedua}>
        {menunggu ? "Membuka inspeksi…" : label}
      </button>
      <Gagal status={status} />
    </form>
  );
}

/** Kerangka dialog dengan satu kolom alasan yang divalidasi saat ditinggalkan dan saat simpan diklik. */
function DialogAlasan({
  pemicu,
  pemicuUtama = false,
  judul,
  keterangan,
  labelAlasan,
  petunjuk,
  minimal,
  wajib,
  simpan,
  aksi,
  children,
}: {
  pemicu: string;
  pemicuUtama?: boolean;
  judul: string;
  keterangan: string;
  labelAlasan: string;
  petunjuk: string;
  minimal: number;
  /** Menentukan dari isi formulir apakah alasan wajib. */
  wajib: (fd: FormData) => boolean;
  simpan: string;
  aksi: (sebelum: StatusAksi, fd: FormData) => Promise<StatusAksi>;
  children: (nilai: Record<string, string | string[]> | undefined) => React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await aksi(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const [galat, setGalat] = useState<string | null>(null);
  const nilai = status && !status.ok ? status.nilai : undefined;
  const periksa = (fd: FormData) => {
    const isi = String(fd.get("alasan") ?? fd.get("catatan") ?? "").trim();
    return wajib(fd) && isi.length < minimal ? `Tulis dulu ${labelAlasan.toLowerCase()}, paling sedikit ${minimal} huruf.` : null;
  };
  const namaKolom = labelAlasan === "Catatan untuk pemeriksa" ? "catatan" : "alasan";

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={pemicuUtama ? tombolUtama : tombolKedua}>
        {pemicu}
      </button>
      {status?.ok && (
        <p role="status" className="rounded-md bg-brand-green-soft px-2.5 py-1.5 text-sm font-medium text-brand-green-strong">
          {status.pesan}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={`judul-${namaKolom}-${judul.length}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form
          action={kirim}
          key={status?.urut ?? 0}
          noValidate
          onSubmit={(e) => {
            const g = periksa(new FormData(e.currentTarget));
            setGalat(g);
            if (g) {
              e.preventDefault();
              e.currentTarget.querySelector("textarea")?.focus();
            }
          }}
          className="p-5 sm:p-6"
        >
          <h2 id={`judul-${namaKolom}-${judul.length}`} className="text-lg font-bold text-ink">
            {judul}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{keterangan}</p>
          {children(nilai)}
          <label className="mt-4 block text-sm font-semibold text-ink">
            {labelAlasan}
            <textarea
              name={namaKolom}
              rows={3}
              maxLength={1000}
              defaultValue={typeof nilai?.[namaKolom] === "string" ? (nilai[namaKolom] as string) : ""}
              aria-invalid={galat ? true : undefined}
              onBlur={(e) => e.currentTarget.form && setGalat(periksa(new FormData(e.currentTarget.form)))}
              onChange={(e) => {
                if (galat && e.currentTarget.form && !periksa(new FormData(e.currentTarget.form))) setGalat(null);
              }}
              className={`${kolom} ${galat ? "border-brand-red" : "border-line"}`}
            />
          </label>
          {galat ? (
            <p className="mt-1.5 text-sm font-medium text-brand-red-strong">{galat}</p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-subtle">{petunjuk}</p>
          )}
          <div className="mt-3">
            <Gagal status={status} />
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className={tombolKedua}>
              Batal
            </button>
            <button type="submit" disabled={menunggu} className={tombolUtama}>
              {menunggu ? "Menyimpan…" : simpan}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Menahan lahan kosong, menandainya tidak tersedia, atau melepasnya kembali. */
export function DialogTahan({ lahanId, kode, statusRuang }: { lahanId: string; kode: string; statusRuang: string }) {
  const lepas = statusRuang !== "tersedia";
  return (
    <DialogAlasan
      pemicu={lepas ? "Lepas penahanan" : "Tahan lahan"}
      judul={lepas ? `Lepas penahanan lahan ${kode}` : `Tahan lahan ${kode}`}
      keterangan={
        lepas
          ? "Lahan kembali tersedia dan bisa diproses seperti biasa."
          : "Lahan yang ditahan tetap tercatat kosong di Brightspace, tetapi tidak bisa ditawarkan resmi sampai dilepas."
      }
      labelAlasan="Alasan"
      petunjuk={lepas ? "Boleh dikosongkan." : "Tulis siapa yang memakai lahan ini atau mengapa ditahan, dan sampai kapan."}
      minimal={5}
      wajib={(fd) => fd.get("status") !== "tersedia"}
      simpan={lepas ? "Lepas penahanan" : "Tahan lahan"}
      aksi={ubahStatusRuang}
    >
      {(nilai) => (
        <>
          <input type="hidden" name="lahan_id" value={lahanId} />
          {lepas ? (
            <input type="hidden" name="status" value="tersedia" />
          ) : (
            <Pilihan
              nama="status"
              legenda="Ketersediaan"
              awal={typeof nilai?.status === "string" ? nilai.status : "ditahan"}
              pilihan={[
                { nilai: "ditahan", nama: "Ditahan sementara", arti: "Misalnya sedang dipakai gudang atau menunggu renovasi." },
                { nilai: "tidak_tersedia", nama: "Tidak tersedia", arti: "Lahan tidak bisa disewakan." },
              ]}
            />
          )}
        </>
      )}
    </DialogAlasan>
  );
}

/** Meninjau inspeksi yang diajukan: terima (lahan menjadi terverifikasi) atau kembalikan untuk diperbaiki. */
export function DialogTinjau({ id, kode }: { id: string; kode: string }) {
  return (
    <DialogAlasan
      pemicu="Tinjau inspeksi"
      pemicuUtama
      judul={`Tinjau inspeksi lahan ${kode}`}
      keterangan="Periksa jawaban dan foto buktinya dulu. Bila diterima, lahan menjadi terverifikasi dan boleh ditawarkan resmi."
      labelAlasan="Catatan untuk pemeriksa"
      petunjuk="Wajib bila inspeksi dikembalikan: tulis apa yang perlu diperbaiki."
      minimal={10}
      wajib={(fd) => fd.get("keputusan") === "ditolak"}
      simpan="Simpan tinjauan"
      aksi={tinjauInspeksi}
    >
      {(nilai) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Pilihan
            nama="keputusan"
            legenda="Hasil tinjauan"
            awal={typeof nilai?.keputusan === "string" ? nilai.keputusan : "diterima"}
            pilihan={[
              { nilai: "diterima", nama: "Terima", arti: "Bukti cukup. Lahan menjadi terverifikasi." },
              { nilai: "ditolak", nama: "Kembalikan", arti: "Bukti belum cukup. Pemeriksa memperbaiki lalu mengajukan lagi." },
            ]}
          />
        </>
      )}
    </DialogAlasan>
  );
}

function Pilihan({
  nama,
  legenda,
  awal,
  pilihan,
}: {
  nama: string;
  legenda: string;
  awal: string;
  pilihan: { nilai: string; nama: string; arti: string }[];
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-semibold text-ink">{legenda}</legend>
      <div className="mt-2 grid gap-2">
        {pilihan.map((p) => (
          <label
            key={p.nilai}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue-soft"
          >
            <input type="radio" name={nama} value={p.nilai} defaultChecked={awal === p.nilai} className="mt-1" />
            <span>
              <span className="font-semibold text-ink">{p.nama}</span>
              <span className="block text-muted">{p.arti}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
