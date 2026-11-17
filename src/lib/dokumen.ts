/** Dokumen per peluang (migrasi 20261202_dokumen). Tanpa ketergantungan server, jadi aman dipakai komponen klien. */

export type JenisDokumen = "legalitas" | "proposal" | "survei" | "penawaran" | "persetujuan" | "kontrak" | "lainnya";

export const JENIS_DOKUMEN: Record<JenisDokumen, string> = {
  legalitas: "Legalitas usaha",
  proposal: "Proposal atau profil usaha",
  survei: "Berita acara survei",
  penawaran: "Surat penawaran",
  persetujuan: "Bukti persetujuan",
  kontrak: "Naskah kontrak",
  lainnya: "Lainnya",
};

/** Jenis yang boleh diunggah tenant; sisanya diunggah tim NFR. */
export const JENIS_TENANT: JenisDokumen[] = ["legalitas", "proposal", "lainnya"];

/** Batas berkas yang dikirim dalam satu permintaan. Dijaga di bawah batas badan permintaan fungsi server di Vercel (4,5 MB). */
export const MAKS_BYTES = 4_000_000;

/** Berkas di atas MAKS_BYTES dipotong menjadi bagian sebesar ini dan dikirim satu per satu. */
export const UKURAN_BAGIAN = 3_500_000;

/** Batas keseluruhan berkas besar: paling banyak tujuh bagian. */
export const MAKS_BESAR = 24_000_000;
export const MAKS_BAGIAN = Math.ceil(MAKS_BESAR / UKURAN_BAGIAN);

/** Alamat objek satu bagian berkas besar. `kunci` boleh dengan atau tanpa ekstensi. */
export const kunciBagian = (kunci: string, urut: number) => `${kunci.replace(/\.(pdf|jpg|png)$/, "")}.bagian-${urut}`;

export type Dokumen = {
  id: string;
  rangkaian: string;
  versi: number;
  terkini: boolean;
  jenis: JenisDokumen;
  judul: string;
  nama_berkas: string;
  tipe: "application/pdf" | "image/jpeg" | "image/png";
  bytes: number;
  pihak_unggah: "nfr" | "tenant";
  diunggah: string;
  /** null bila pengunggahnya staf NFR dan yang melihat bukan tim NFR. */
  diunggah_oleh: string | null;
  /** Berikut ini hanya terisi untuk tim NFR. */
  tahap: string | null;
  tampak_tenant: boolean | null;
  tampak_dealer: boolean | null;
  sha256: string | null;
  ditarik: string | null;
  ditarik_oleh: string | null;
  alasan_tarik: string | null;
  boleh_buka: boolean;
  milik_saya: boolean;
};

export type DokumenPeluang = {
  peran: "nfr" | "tenant" | "dealer" | null;
  /** Sebagai siapa pengguna boleh mengunggah; null = hanya membaca. */
  boleh_unggah: "nfr" | "tenant" | null;
  dokumen: Dokumen[];
};

/** 1536000 → "1,5 MB"; 340000 → "332 KB" */
export function ukuranBerkas(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Mengenali jenis berkas dari byte awalnya, bukan dari nama atau tipe kiriman peramban. */
export function kenaliBerkas(isi: Uint8Array): { tipe: Dokumen["tipe"]; ekstensi: "pdf" | "jpg" | "png" } | null {
  const awal = (...b: number[]) => b.every((v, i) => isi[i] === v);
  if (isi.length < 8) return null;
  if (awal(0x25, 0x50, 0x44, 0x46, 0x2d)) return { tipe: "application/pdf", ekstensi: "pdf" };
  if (awal(0xff, 0xd8, 0xff)) return { tipe: "image/jpeg", ekstensi: "jpg" };
  if (awal(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { tipe: "image/png", ekstensi: "png" };
  return null;
}

/** Rangkaian dokumen: versi terbaru di depan, versi lamanya menyusul. Urutan rangkaian mengikuti unggahan terbaru. */
export function kelompokkan(dokumen: Dokumen[]): { terbaru: Dokumen; lama: Dokumen[] }[] {
  const peta = new Map<string, Dokumen[]>();
  for (const d of dokumen) peta.set(d.rangkaian, [...(peta.get(d.rangkaian) ?? []), d]);
  return [...peta.values()].map((v) => {
    const urut = [...v].sort((a, b) => b.versi - a.versi);
    return { terbaru: urut[0], lama: urut.slice(1) };
  });
}
