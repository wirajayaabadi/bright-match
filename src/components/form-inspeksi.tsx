"use client";

/* Foto inspeksi disajikan rute /foto milik aplikasi; tidak lewat pengoptimal next/image. */
/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { hapusFotoInspeksi, simpanInspeksi } from "@/app/aksi-inspeksi";
import { urlGambar } from "@/lib/gambar";
import { type FotoInspeksi, type IsiInspeksi, PILIHAN } from "@/lib/status-lahan";

const kolom =
  "mt-1.5 block min-h-12 w-full rounded-lg border bg-white px-3.5 text-base text-ink focus:border-brand-blue";
const areaTeks = "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-base text-ink focus:border-brand-blue";

type Nilai = Record<string, string>;

/** Mengecilkan foto di peramban menjadi JPEG, sisi terpanjang 1600 px, agar unggahan ringan di jaringan seluler. */
async function kecilkan(berkas: File): Promise<{ blob: Blob; lebar: number; tinggi: number }> {
  const gambar = await createImageBitmap(berkas, { imageOrientation: "from-image" });
  const skala = Math.min(1, 1600 / Math.max(gambar.width, gambar.height));
  const lebar = Math.round(gambar.width * skala);
  const tinggi = Math.round(gambar.height * skala);
  const kanvas = document.createElement("canvas");
  kanvas.width = lebar;
  kanvas.height = tinggi;
  kanvas.getContext("2d")?.drawImage(gambar, 0, 0, lebar, tinggi);
  gambar.close();
  const blob = await new Promise<Blob | null>((selesai) => kanvas.toBlob(selesai, "image/jpeg", 0.82));
  if (!blob) throw new Error("gagal");
  return { blob, lebar, tinggi };
}

type Bantu = {
  nilai: Nilai;
  galat: Nilai;
  ubah: (k: string, v: string) => void;
  periksaAngka: (k: string, wajib: boolean, lebihDariNol: boolean) => void;
};

function Angka({
  nama,
  label,
  satuan,
  wajibIsi,
  positif,
  pembanding,
  nilai,
  galat,
  ubah,
  periksaAngka,
}: Bantu & { nama: string; label: string; satuan: string; wajibIsi: boolean; positif: boolean; pembanding?: string }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label} <span className="font-normal text-muted">({satuan}){wajibIsi ? "" : ", bila diukur"}</span>
      <input
        type="text"
        inputMode="decimal"
        name={nama}
        value={nilai[nama]}
        onChange={(e) => ubah(nama, e.target.value)}
        onBlur={() => periksaAngka(nama, wajibIsi, positif)}
        aria-invalid={galat[nama] ? true : undefined}
        aria-describedby={`bantu-${nama}`}
        className={`${kolom} ${galat[nama] ? "border-brand-red" : "border-line"}`}
      />
      <span id={`bantu-${nama}`} className={`mt-1 block text-xs font-normal ${galat[nama] ? "font-medium text-brand-red-strong" : "text-subtle"}`}>
        {galat[nama] || pembanding || " "}
      </span>
    </label>
  );
}

function Pilih({
  nama,
  legenda,
  kelompok,
  nilai,
  ubah,
}: Pick<Bantu, "nilai" | "ubah"> & { nama: string; legenda: string; kelompok: keyof typeof PILIHAN }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{legenda}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {PILIHAN[kelompok].map((p) => (
          <label
            key={p.nilai}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-3.5 text-base text-ink has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue-soft has-[:checked]:font-semibold"
          >
            <input type="radio" name={nama} value={p.nilai} checked={nilai[nama] === p.nilai} onChange={() => ubah(nama, p.nilai)} />
            {p.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Daftar periksa kesiapan lokasi. Dirancang untuk ponsel: satu kolom, kolom isian besar, pilihan berupa
 * tombol lebar. Draf disimpan kapan saja; pengajuan ditolak server selama butir wajib belum lengkap.
 */
export default function FormInspeksi({
  id,
  isi,
  hasil,
  foto,
  sumber,
}: {
  id: string;
  isi: IsiInspeksi;
  hasil: string | null;
  foto: FotoInspeksi[];
  /** Nilai menurut Brightspace, sebagai pembanding di samping kolom. */
  sumber: { luas_m2: number | null; daya_w: number | null };
}) {
  const router = useRouter();
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(simpanInspeksi, null);
  const [nilai, setNilai] = useState<Nilai>(() => ({
    panjang_m: isi.panjang_m?.toString() ?? "",
    lebar_m: isi.lebar_m?.toString() ?? "",
    luas_m2: isi.luas_m2?.toString() ?? "",
    daya_w: isi.daya_w?.toString() ?? "",
    air: isi.air ?? "",
    akses: isi.akses ?? "",
    parkir: isi.parkir ?? "",
    pembatasan: isi.pembatasan ?? "",
    pembatasan_rinci: isi.pembatasan_rinci ?? "",
    infrastruktur: isi.infrastruktur ?? "",
    perubahan: isi.perubahan ?? "",
    catatan: isi.catatan ?? "",
    hasil: hasil ?? "",
  }));
  const [galat, setGalat] = useState<Nilai>({});
  const [unggah, setUnggah] = useState<{ sibuk: boolean; pesan: string | null }>({ sibuk: false, pesan: null });
  const pilihBerkas = useRef<HTMLInputElement>(null);

  const ubah = (k: string, v: string) => {
    setNilai((n) => ({ ...n, [k]: v }));
    if (galat[k]) setGalat((g) => ({ ...g, [k]: "" }));
  };
  const angkaSah = (v: string) => /^[0-9]{1,7}([.,][0-9]{1,2})?$/.test(v.trim());
  const periksaAngka = (k: string, wajib: boolean, lebihDariNol: boolean) => {
    const v = nilai[k].trim();
    let pesan = "";
    if (v === "") pesan = wajib ? "Isi angkanya dulu." : "";
    else if (!angkaSah(v)) pesan = "Tulis angka saja, misalnya 12 atau 12,5.";
    else if (lebihDariNol && Number(v.replace(",", ".")) <= 0) pesan = "Angkanya harus lebih dari nol.";
    setGalat((g) => ({ ...g, [k]: pesan }));
  };

  const wajib = [
    angkaSah(nilai.luas_m2) && Number(nilai.luas_m2.replace(",", ".")) > 0,
    angkaSah(nilai.daya_w),
    nilai.air !== "",
    nilai.akses !== "",
    nilai.parkir !== "",
    nilai.pembatasan === "tidak_ada" || (nilai.pembatasan === "ada" && nilai.pembatasan_rinci.trim() !== ""),
    foto.length >= 2,
    nilai.hasil !== "",
  ];
  const terisi = wajib.filter(Boolean).length;

  async function tambahFoto(berkas: FileList | null) {
    if (!berkas?.length) return;
    setUnggah({ sibuk: true, pesan: null });
    let pesan: string | null = null;
    for (const b of Array.from(berkas)) {
      try {
        const { blob, lebar, tinggi } = await kecilkan(b);
        const fd = new FormData();
        fd.set("foto", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        fd.set("lebar", String(lebar));
        fd.set("tinggi", String(tinggi));
        const jawab = await fetch(`/api/inspeksi/${id}/foto`, { method: "POST", body: fd });
        const data = (await jawab.json().catch(() => null)) as { ok: boolean; pesan?: string } | null;
        if (!data?.ok) pesan = data?.pesan ?? "Foto belum bisa diunggah. Periksa sambungan lalu coba lagi.";
      } catch {
        pesan = "Foto ini tidak bisa dibaca. Pilih foto JPG atau PNG, atau ambil ulang dengan kamera.";
      }
    }
    if (pilihBerkas.current) pilihBerkas.current.value = "";
    setUnggah({ sibuk: false, pesan });
    router.refresh();
  }

  async function hapusFoto(f: FotoInspeksi, urut: number) {
    if (!window.confirm(`Hapus foto ${urut} dari inspeksi ini?`)) return;
    setUnggah({ sibuk: true, pesan: null });
    const hasilHapus = await hapusFotoInspeksi(f.id);
    setUnggah({ sibuk: false, pesan: hasilHapus.ok ? null : (hasilHapus.pesan ?? null) });
    router.refresh();
  }

  const k = { nilai, galat, ubah, periksaAngka };

  return (
    <form action={kirim} noValidate className="grid max-w-2xl grid-cols-1 gap-8">
      <input type="hidden" name="id" value={id} />

      <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-canvas/95 px-4 py-3 sm:mx-0 sm:rounded-lg sm:border sm:bg-white">
        <p className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
          <span>
            {terisi} dari {wajib.length} butir wajib terisi
          </span>
          <span className="text-xs font-normal text-subtle">{terisi === wajib.length ? "Siap diajukan" : "Draf bisa disimpan kapan saja"}</span>
        </p>
        <div
          role="progressbar"
          aria-label="Kelengkapan inspeksi"
          aria-valuemin={0}
          aria-valuemax={wajib.length}
          aria-valuenow={terisi}
          className="mt-2 h-2 rounded-full bg-line"
        >
          <div className="h-2 rounded-full bg-brand-blue" style={{ width: `${(100 * terisi) / wajib.length}%` }} />
        </div>
      </div>

      <section className="grid gap-4">
        <h2 className="text-lg font-bold text-ink">1. Ukuran ruang</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Angka {...k} nama="panjang_m" label="Panjang" satuan="m" wajibIsi={false} positif />
          <Angka {...k} nama="lebar_m" label="Lebar" satuan="m" wajibIsi={false} positif />
          <Angka {...k}
            nama="luas_m2"
            label="Luas terukur"
            satuan="m²"
            wajibIsi
            positif
            pembanding={sumber.luas_m2 != null ? `Brightspace: ${String(sumber.luas_m2).replace(".", ",")} m²` : "Brightspace: tidak tercatat"}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-bold text-ink">2. Listrik dan air</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Angka {...k}
            nama="daya_w"
            label="Daya listrik tersedia"
            satuan="watt; 0 bila tidak ada"
            wajibIsi
            positif={false}
            pembanding={sumber.daya_w != null ? `Brightspace: ${new Intl.NumberFormat("id-ID").format(sumber.daya_w)} W` : "Brightspace: tidak tercatat"}
          />
        </div>
        <Pilih nilai={nilai} ubah={ubah} nama="air" legenda="Air bersih" kelompok="air" />
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-bold text-ink">3. Akses dan parkir</h2>
        <Pilih nilai={nilai} ubah={ubah} nama="akses" legenda="Akses kendaraan ke lahan" kelompok="akses" />
        <Pilih nilai={nilai} ubah={ubah} nama="parkir" legenda="Tempat parkir untuk pelanggan" kelompok="parkir" />
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-bold text-ink">4. Keselamatan dan kondisi</h2>
        <Pilih nilai={nilai} ubah={ubah} nama="pembatasan" legenda="Pembatasan keselamatan di lahan ini" kelompok="pembatasan" />
        {nilai.pembatasan === "ada" && (
          <label className="block text-sm font-semibold text-ink">
            Pembatasannya apa?
            <textarea
              name="pembatasan_rinci"
              rows={3}
              maxLength={1000}
              value={nilai.pembatasan_rinci}
              onChange={(e) => ubah("pembatasan_rinci", e.target.value)}
              className={areaTeks}
            />
            <span className="mt-1 block text-xs font-normal text-subtle">Contoh: dekat tangki pendam, jadi tidak boleh ada api terbuka.</span>
          </label>
        )}
        <label className="block text-sm font-semibold text-ink">
          Yang sudah ada di lahan <span className="font-normal text-muted">(boleh dikosongkan)</span>
          <textarea name="infrastruktur" rows={2} maxLength={1000} value={nilai.infrastruktur} onChange={(e) => ubah("infrastruktur", e.target.value)} className={areaTeks} />
        </label>
        <label className="block text-sm font-semibold text-ink">
          Pekerjaan yang masih diperlukan <span className="font-normal text-muted">(boleh dikosongkan)</span>
          <textarea name="perubahan" rows={2} maxLength={1000} value={nilai.perubahan} onChange={(e) => ubah("perubahan", e.target.value)} className={areaTeks} />
        </label>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold text-ink">5. Foto bukti</h2>
        <p className="text-sm leading-relaxed text-muted">
          Paling sedikit dua foto: tampak lahan dari depan dan titik listriknya. Foto dikecilkan di ponsel sebelum dikirim.
        </p>
        {foto.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {foto.map((f, i) => (
              <li key={f.id} className="relative">
                <img
                  src={urlGambar(f.kunci)}
                  alt={`Foto bukti ${i + 1} dari ${foto.length}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-lg border border-line bg-canvas object-cover"
                />
                <button
                  type="button"
                  onClick={() => hapusFoto(f, i + 1)}
                  disabled={unggah.sibuk}
                  className="mt-1.5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-brand-red-strong hover:border-brand-red disabled:opacity-60"
                >
                  Hapus foto {i + 1}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-lg border border-line bg-white px-4 text-base font-semibold text-ink hover:border-subtle has-[:disabled]:opacity-60">
            {unggah.sibuk ? "Mengunggah foto…" : "Tambah foto"}
            <input
              ref={pilihBerkas}
              type="file"
              accept="image/*"
              multiple
              disabled={unggah.sibuk}
              onChange={(e) => tambahFoto(e.currentTarget.files)}
              className="sr-only"
            />
          </label>
          <span className="text-sm text-muted">{foto.length} foto terunggah</span>
        </div>
        {unggah.pesan && (
          <p role="alert" className="rounded-md bg-brand-red-soft px-2.5 py-1.5 text-sm font-medium text-brand-red-strong">
            {unggah.pesan}
          </p>
        )}
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-bold text-ink">6. Kesimpulan</h2>
        <Pilih nilai={nilai} ubah={ubah} nama="hasil" legenda="Menurut pemeriksaan ini, lahan" kelompok="hasil" />
        <label className="block text-sm font-semibold text-ink">
          Catatan inspeksi <span className="font-normal text-muted">(boleh dikosongkan)</span>
          <textarea name="catatan" rows={3} maxLength={1000} value={nilai.catatan} onChange={(e) => ubah("catatan", e.target.value)} className={areaTeks} />
        </label>
      </section>

      <div className="grid gap-3 border-t border-line pt-5">
        {status && (
          <p
            role={status.ok ? "status" : "alert"}
            className={`rounded-md px-3 py-2 text-sm font-medium ${status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"}`}
          >
            {status.pesan}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            name="niat"
            value="ajukan"
            disabled={menunggu}
            className="inline-flex min-h-12 items-center rounded-lg bg-brand-blue px-5 text-base font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60"
          >
            {menunggu ? "Menyimpan…" : "Ajukan untuk ditinjau"}
          </button>
          <button
            type="submit"
            name="niat"
            value="simpan"
            disabled={menunggu}
            className="inline-flex min-h-12 items-center rounded-lg border border-line bg-white px-5 text-base font-semibold text-ink hover:border-subtle disabled:opacity-60"
          >
            Simpan draf
          </button>
        </div>
        <p className="text-xs leading-relaxed text-subtle">
          Setelah diajukan, inspeksi tidak bisa diubah dan ditinjau oleh admin atau penyetuju NFR. Lahan baru terverifikasi setelah tinjauan itu.
        </p>
      </div>
    </form>
  );
}
