import type { Pasangan } from "@/lib/data-tahap1";
import { alasan, kelasSkor, KOMPONEN, perluDicek } from "@/lib/kecocokan";

/** Lencana skor 0–100. */
export function Skor({ nilai }: { nilai: number }) {
  return (
    <span
      className={`angka inline-flex min-w-12 items-center justify-center self-start rounded-lg px-2 py-1.5 text-base font-extrabold ${kelasSkor(nilai)}`}
      title="Skor kecocokan 0–100"
    >
      {nilai}
    </span>
  );
}

/** Rincian poin per komponen, alasan dalam kalimat, dan hal yang perlu dicek. */
export function RincianSkor({ p }: { p: Pasangan }) {
  const cek = perluDicek(p);

  return (
    <div className="text-sm leading-relaxed text-muted">
      <ul className="list-disc space-y-1 pl-5">
        {alasan(p).map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <p className="angka mt-2 text-xs text-subtle">
        {KOMPONEN.map((k) => `${k.nama} ${String(p[k.kunci]).replace(".", ",")}/${k.maks}`).join(" · ")}
      </p>
      {cek.length > 0 && (
        <p className="mt-2 inline-block rounded-md bg-warn-soft px-2 py-1 text-xs font-medium text-warn">
          Perlu dicek di lapangan: {cek.join(", ")} (datanya belum tercatat).
        </p>
      )}
    </div>
  );
}

/** Catatan tetap tentang cakupan skor versi 2. */
export function CatatanVersi() {
  return (
    <p className="mt-4 max-w-3xl text-xs leading-relaxed text-subtle">
      Skor versi 2 memakai enam komponen (100 poin): tipe lokasi 25, bukti dari jaringan 20, permintaan 20, melengkapi
      jenis usaha yang ada 15, kecocokan harga 10, dan kesiapan lahan 10. Tipe lokasi dan permintaan dihitung dari data terbuka
      (Overture Maps dan WorldPop) dan belum diuji lapangan. Jumlah usaha sejenis dalam 500 m ditampilkan sebagai
      konteks, tetapi belum masuk skor. Bobotnya masih usulan dan akan disesuaikan dengan hasil pilot.
    </p>
  );
}
