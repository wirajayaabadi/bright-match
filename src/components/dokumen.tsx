"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { aturTampakDokumen, tarikDokumen } from "@/app/aksi-dokumen";
import { Lencana } from "@/components/tabel";
import {
  type Dokumen,
  type DokumenPeluang,
  JENIS_DOKUMEN,
  JENIS_TENANT,
  type JenisDokumen,
  kelompokkan,
  kenaliBerkas,
  MAKS_BESAR,
  MAKS_BYTES,
  UKURAN_BAGIAN,
  ukuranBerkas,
} from "@/lib/dokumen";
import { tanggal } from "@/lib/format";
import { namaTahap } from "@/lib/istilah";

const tombolUtama =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60";
const tombolKedua =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle disabled:opacity-60";
const tombolBatal =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-brand-red-strong hover:border-brand-red-strong";
const tombolBahaya =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-red-strong px-4 text-sm font-semibold text-white hover:bg-brand-red disabled:opacity-60";
const kolom = "mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3.5 text-base font-normal text-ink focus:border-brand-blue";
const area = "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-base font-normal text-ink focus:border-brand-blue";
const label = "block text-sm font-semibold text-ink";
const kartu = "rounded-xl border border-line bg-white shadow-card";

function Pesan({ ok, pesan }: { ok: boolean; pesan: string }) {
  return (
    <p role={ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm font-medium ${ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"}`}>
      {pesan}
    </p>
  );
}

const PIHAK: Record<Dokumen["pihak_unggah"], string> = { nfr: "tim Non Fuel Retail", tenant: "tenant" };

/**
 * Dokumen satu peluang. Isinya sudah disaring basis data sesuai peran pengguna; komponen ini hanya menampilkan
 * tindakan yang memang boleh: mengunggah, mengunggah versi baru, menarik, dan (tim NFR) mengatur siapa yang melihat.
 */
export default function DokumenPanel({ peluangId, data }: { peluangId: string; data: DokumenPeluang }) {
  const [ganti, setGanti] = useState<Dokumen | null>(null);
  // Formulirnya ada di bawah daftar; saat mengganti versi, bawa ke layar supaya jelas apa yang sedang diisi.
  const mulaiGanti = (d: Dokumen) => {
    setGanti(d);
    requestAnimationFrame(() => document.getElementById("form-unggah-dokumen")?.scrollIntoView({ block: "center" }));
  };
  const rangkaian = kelompokkan(data.dokumen);
  const unggah = data.boleh_unggah;

  return (
    <div className="grid max-w-3xl gap-5">
      {rangkaian.length === 0 ? (
        <p className={`${kartu} px-4 py-6 text-sm leading-relaxed text-muted`}>
          {data.peran === "tenant"
            ? "Belum ada dokumen. Dokumen dari tim Non Fuel Retail dan yang Anda unggah akan tampil di sini."
            : data.peran === "dealer"
              ? "Belum ada dokumen yang dibuka untuk pengelola SPBU."
              : "Belum ada dokumen di peluang ini."}
        </p>
      ) : (
        <ul className={`${kartu} divide-y divide-line`}>
          {rangkaian.map(({ terbaru, lama }) => (
            <li key={terbaru.rangkaian} className="px-4 py-4">
              <Butir d={terbaru} peran={data.peran} unggah={unggah} mulaiGanti={mulaiGanti} />
              {lama.length > 0 && (
                <details className="mt-3">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-blue-strong">
                    {lama.length} versi sebelumnya
                  </summary>
                  <ul className="mt-1 grid gap-3 border-l-2 border-line pl-4">
                    {lama.map((d) => (
                      <li key={d.id}>
                        <Butir d={d} peran={data.peran} unggah={unggah} mulaiGanti={mulaiGanti} lama />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {unggah && <FormUnggah key={ganti?.id ?? "baru"} peluangId={peluangId} sebagai={unggah} ganti={ganti} batalGanti={() => setGanti(null)} />}
    </div>
  );
}

function Butir({
  d,
  peran,
  unggah,
  mulaiGanti,
  lama = false,
}: {
  d: Dokumen;
  peran: DokumenPeluang["peran"];
  unggah: DokumenPeluang["boleh_unggah"];
  mulaiGanti: (d: Dokumen) => void;
  lama?: boolean;
}) {
  const bolehUbah = d.milik_saya && unggah != null && !d.ditarik;
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`${lama ? "text-sm" : "text-base"} font-bold text-ink`}>{d.judul}</span>
        <Lencana>{JENIS_DOKUMEN[d.jenis]}</Lencana>
        <span className="angka text-xs text-subtle">versi {d.versi}</span>
        {d.ditarik && <Lencana warna="merah">Ditarik</Lencana>}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {d.nama_berkas} · {ukuranBerkas(d.bytes)} · diunggah {tanggal(d.diunggah)} oleh {d.diunggah_oleh ?? PIHAK[d.pihak_unggah]}
        {peran === "nfr" && d.tahap ? ` saat tahap ${namaTahap(d.tahap).toLowerCase()}` : ""}
      </p>
      {peran === "nfr" && !d.ditarik && (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {d.pihak_unggah === "tenant"
            ? "Unggahan tenant: terlihat oleh tenant itu dan tim NFR saja."
            : `Terlihat oleh tim NFR${d.tampak_tenant ? ", tenant" : ""}${d.tampak_dealer ? ", pengelola SPBU" : ""}${!d.tampak_tenant && !d.tampak_dealer ? " saja" : ""}.`}
        </p>
      )}
      {d.ditarik && (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Ditarik {tanggal(d.ditarik)}
          {d.ditarik_oleh ? ` oleh ${d.ditarik_oleh}` : ""}
          {d.alasan_tarik ? `: ${d.alasan_tarik}` : "."} Berkasnya tidak bisa dibuka lagi.
        </p>
      )}
      {(d.boleh_buka || bolehUbah) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {d.boleh_buka && (
            <a href={`/dokumen/${d.id}`} target="_blank" rel="noopener" className={tombolKedua}>
              Buka dokumen
            </a>
          )}
          {bolehUbah && d.terkini && (
            <button type="button" onClick={() => mulaiGanti(d)} className={tombolKedua}>
              Unggah versi baru
            </button>
          )}
          {bolehUbah && <DialogTarik d={d} wajibAlasan={unggah === "nfr"} />}
        </div>
      )}
      {peran === "nfr" && unggah === "nfr" && d.pihak_unggah === "nfr" && !d.ditarik && d.terkini && <AturTampak d={d} />}
    </div>
  );
}

/** Siapa di luar tim NFR yang melihat rangkaian dokumen ini. Berlaku untuk semua versinya. */
function AturTampak({ d }: { d: Dokumen }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(aturTampakDokumen, null);
  return (
    <details className="mt-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-blue-strong">Atur siapa yang melihat</summary>
      <form action={kirim} className="mt-1 grid gap-2 rounded-lg border border-line bg-canvas/60 p-3">
        <input type="hidden" name="id" value={d.id} />
        <Centang nama="tampak_tenant" awal={d.tampak_tenant === true} teks="Tenant penerima penawaran" />
        <Centang nama="tampak_dealer" awal={d.tampak_dealer === true} teks="Pengelola SPBU" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={menunggu} className={tombolKedua}>
            {menunggu ? "Menyimpan…" : "Simpan keterlihatan"}
          </button>
          {status && <Pesan ok={status.ok} pesan={status.pesan} />}
        </div>
      </form>
    </details>
  );
}

function Centang({ nama, awal, teks }: { nama: string; awal: boolean; teks: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
      <input type="checkbox" name={nama} value="ya" defaultChecked={awal} />
      {teks}
    </label>
  );
}

function DialogTarik({ d, wajibAlasan }: { d: Dokumen; wajibAlasan: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await tarikDokumen(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const idJudul = `judul-tarik-${d.id}`;
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={tombolBatal}>
        Tarik dokumen
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={idJudul}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form action={kirim} key={status?.urut ?? 0} className="p-5 sm:p-6">
          <input type="hidden" name="id" value={d.id} />
          <h2 id={idJudul} className="text-lg font-bold text-ink">
            Tarik &quot;{d.judul}&quot; versi {d.versi}?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Setelah ditarik, berkas ini tidak bisa dibuka lagi oleh siapa pun, termasuk Anda. Catatannya tetap tersimpan. Versi lain dokumen ini tidak ikut
            ditarik.
          </p>
          <label className={`${label} mt-4`}>
            Alasan {wajibAlasan ? "" : <span className="font-normal text-muted">(opsional)</span>}
            <textarea
              name="alasan"
              rows={3}
              maxLength={500}
              defaultValue={status && !status.ok && typeof status.nilai?.alasan === "string" ? status.nilai.alasan : ""}
              className={area}
            />
          </label>
          {status && !status.ok && (
            <div className="mt-3">
              <Pesan ok={false} pesan={status.pesan} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => dialog.current?.close()} className={tombolKedua}>
              Kembali
            </button>
            <button type="submit" disabled={menunggu} className={tombolBahaya}>
              {menunggu ? "Menarik…" : "Tarik dokumen"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function FormUnggah({
  peluangId,
  sebagai,
  ganti,
  batalGanti,
}: {
  peluangId: string;
  sebagai: "nfr" | "tenant";
  ganti: Dokumen | null;
  batalGanti: () => void;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<{ ok: boolean; pesan: string } | null>(null);
  const jenis = (sebagai === "tenant" ? JENIS_TENANT : (Object.keys(JENIS_DOKUMEN) as JenisDokumen[]));

  const [kemajuan, setKemajuan] = useState<string | null>(null);
  const gagal = "Dokumen belum bisa diunggah. Periksa sambungan lalu coba lagi.";

  /** Berkas di atas 4 MB: dikirim sebagian demi sebagian, lalu diselesaikan. Mengembalikan jawaban rute penyelesaian. */
  async function kirimBertahap(berkas: File, fd: FormData): Promise<{ ok: boolean; pesan?: string } | null> {
    const unggahan = crypto.randomUUID();
    const jumlah = Math.ceil(berkas.size / UKURAN_BAGIAN);
    const batal = () => fetch(`/api/peluang/${peluangId}/dokumen/bagian?unggahan=${unggahan}`, { method: "DELETE" }).catch(() => null);
    for (let n = 1; n <= jumlah; n++) {
      setKemajuan(`Mengunggah bagian ${n} dari ${jumlah}…`);
      const bagian = new FormData();
      bagian.set("unggahan", unggahan);
      bagian.set("urut", String(n));
      bagian.set("bagian", new File([berkas.slice((n - 1) * UKURAN_BAGIAN, n * UKURAN_BAGIAN)], "bagian"));
      const jawab = await fetch(`/api/peluang/${peluangId}/dokumen/bagian`, { method: "POST", body: bagian }).catch(() => null);
      const data = jawab ? ((await jawab.json().catch(() => null)) as { ok: boolean; pesan?: string } | null) : null;
      if (!data?.ok) {
        await batal();
        return { ok: false, pesan: data?.pesan ?? gagal };
      }
    }
    setKemajuan("Memeriksa dan menyimpan dokumen…");
    fd.delete("berkas");
    fd.set("unggahan", unggahan);
    fd.set("bagian", String(jumlah));
    fd.set("nama_berkas", berkas.name);
    const jawab = await fetch(`/api/peluang/${peluangId}/dokumen/selesai`, { method: "POST", body: fd }).catch(() => null);
    return jawab ? ((await jawab.json().catch(() => null)) as { ok: boolean; pesan?: string } | null) : null;
  }

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const berkas = fd.get("berkas");
    if (!(berkas instanceof File) || berkas.size === 0) return setHasil({ ok: false, pesan: "Pilih berkasnya dulu." });
    // Judul diperiksa lebih dulu supaya berkas besar tidak terkirim sia-sia; server tetap memeriksanya lagi.
    if (String(fd.get("judul") ?? "").trim().length < 3) return setHasil({ ok: false, pesan: 'Beri judul dokumennya dulu, misalnya "NIB perusahaan".' });
    if (berkas.size > MAKS_BESAR) return setHasil({ ok: false, pesan: `Berkas ini ${ukuranBerkas(berkas.size)}. Batasnya 24 MB; kecilkan atau pisahkan berkasnya.` });
    // Jenis berkas dikenali dari isinya sebelum apa pun dikirim, supaya berkas besar yang salah jenis tidak sempat diunggah.
    if (!kenaliBerkas(new Uint8Array(await berkas.slice(0, 8).arrayBuffer()))) {
      return setHasil({ ok: false, pesan: "Berkas ini bukan PDF, JPEG, atau PNG. Simpan dulu sebagai PDF, lalu unggah lagi." });
    }
    setSibuk(true);
    setHasil(null);
    try {
      let data: { ok: boolean; pesan?: string } | null;
      if (berkas.size > MAKS_BYTES) data = await kirimBertahap(berkas, fd);
      else {
        const jawab = await fetch(`/api/peluang/${peluangId}/dokumen`, { method: "POST", body: fd });
        data = (await jawab.json().catch(() => null)) as { ok: boolean; pesan?: string } | null;
      }
      if (data?.ok) {
        setHasil({ ok: true, pesan: data.pesan ?? "Dokumen tersimpan." });
        form.current?.reset();
        if (ganti) batalGanti();
        router.refresh();
      } else setHasil({ ok: false, pesan: data?.pesan ?? gagal });
    } catch {
      setHasil({ ok: false, pesan: gagal });
    }
    setKemajuan(null);
    setSibuk(false);
  }

  return (
    <form id="form-unggah-dokumen" ref={form} onSubmit={kirim} noValidate className={`${kartu} grid gap-4 p-4 sm:grid-cols-2 sm:p-5`}>
      <h3 className="text-base font-bold text-ink sm:col-span-2">{ganti ? "Unggah versi baru" : "Unggah dokumen"}</h3>
      {ganti && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-blue-soft px-3.5 py-2.5 text-sm text-ink sm:col-span-2">
          <span>
            Versi baru untuk <strong>{ganti.judul}</strong> (kini versi {ganti.versi}). Versi lama tetap bisa dibuka, dan jenis serta keterlihatannya tetap.
          </span>
          <button type="button" onClick={batalGanti} className={tombolKedua}>
            Batal mengganti
          </button>
          <input type="hidden" name="menggantikan" value={ganti.id} />
        </div>
      )}
      {!ganti && (
        <label className={label}>
          Jenis dokumen
          <select name="jenis" defaultValue={jenis[0]} className={kolom}>
            {jenis.map((j) => (
              <option key={j} value={j}>
                {JENIS_DOKUMEN[j]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={`${label} ${ganti ? "sm:col-span-2" : ""}`}>
        Judul
        <input type="text" name="judul" maxLength={150} defaultValue={ganti?.judul ?? ""} className={kolom} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Berkas
        <input
          type="file"
          name="berkas"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white text-sm text-ink file:mr-3 file:min-h-11 file:cursor-pointer file:border-0 file:bg-canvas file:px-4 file:text-sm file:font-semibold file:text-ink"
        />
        <span className="mt-1 block text-xs font-normal text-subtle">PDF, JPEG, atau PNG, paling besar 24 MB. Berkas di atas 4 MB diunggah bertahap.</span>
      </label>
      {sebagai === "nfr" && !ganti && (
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold text-ink">Selain tim NFR, siapa yang boleh melihat</legend>
          <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
            <Centang nama="tampak_tenant" awal={false} teks="Tenant penerima penawaran" />
            <Centang nama="tampak_dealer" awal={false} teks="Pengelola SPBU" />
          </div>
        </fieldset>
      )}
      {sebagai === "tenant" && (
        <p className="text-xs leading-relaxed text-subtle sm:col-span-2">Dokumen yang Anda unggah terlihat oleh organisasi Anda dan tim Non Fuel Retail saja.</p>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={sibuk} className={tombolUtama}>
          {sibuk ? "Mengunggah…" : ganti ? "Unggah versi baru" : "Unggah dokumen"}
        </button>
        {kemajuan && (
          <p role="status" className="text-sm font-medium text-muted">
            {kemajuan}
          </p>
        )}
        {hasil && <Pesan ok={hasil.ok} pesan={hasil.pesan} />}
      </div>
    </form>
  );
}
