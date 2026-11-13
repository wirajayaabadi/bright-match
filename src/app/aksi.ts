"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getEmailPengguna, rpc } from "@/lib/data";
import { JENIS_USAHA, UUID } from "@/lib/istilah";

/**
 * Semua penulisan data tahap 3. Tiap aksi memanggil satu fungsi basis data; aturan dan
 * validasi akhirnya ada di sana (supabase/migrations/…_tahap3.sql), bukan di sini.
 *
 * Aksi yang mengubah data tanpa berpindah halaman memanggil refresh(): tanpa itu, halaman
 * tetap menampilkan data lama sampai dimuat ulang.
 */
export type StatusAksi = {
  ok: boolean;
  pesan: string;
  /** Isian yang dikirim, dikembalikan saat gagal: React mengosongkan formulir setelah aksi selesai. */
  nilai?: Record<string, string | string[]>;
  /** Berubah di tiap kegagalan, agar formulir dipasang ulang dengan isian tadi. */
  urut?: number;
} | null;

const teks = (fd: FormData, kunci: string) => String(fd.get(kunci) ?? "").trim();

/** Pesan galat untuk pengguna: pesan validasi dari basis data ditampilkan, galat teknis disamarkan. */
function pesanGalat(galat: { jenis: string; pesan?: string }, en = false) {
  if (galat.jenis === "lain" && galat.pesan && !/permission|syntax|relation|function|violates/i.test(galat.pesan)) {
    return galat.pesan;
  }
  return en ? "The form could not be saved. Please try again." : "Data tidak bisa disimpan. Coba lagi.";
}

function isiCalon(fd: FormData) {
  return {
    nama_usaha: teks(fd, "nama_usaha"),
    segmen: teks(fd, "segmen"),
    deskripsi: teks(fd, "deskripsi"),
    target_pasar: teks(fd, "target_pasar"),
    asal: teks(fd, "asal"),
    negara: teks(fd, "negara"),
    jumlah_gerai: teks(fd, "jumlah_gerai"),
    kontak_nama: teks(fd, "kontak_nama"),
    kontak_email: teks(fd, "kontak_email"),
    kontak_telepon: teks(fd, "kontak_telepon"),
    luas_min: teks(fd, "luas_min"),
    luas_maks: teks(fd, "luas_maks"),
    posisi: teks(fd, "posisi"),
    daya_min: teks(fd, "daya_min"),
    anggaran_tahunan: teks(fd, "anggaran_tahunan"),
    provinsi_minat: fd.getAll("provinsi_minat").map(String),
    catatan: teks(fd, "catatan"),
    bahasa: teks(fd, "bahasa") === "en" ? "en" : "id",
    kanal: teks(fd, "kanal"),
  };
}

/** Pemeriksaan awal yang sama dengan aturan basis data, agar pesannya muncul dalam bahasa formulir. */
function periksaCalon(p: ReturnType<typeof isiCalon>): string | null {
  const en = p.bahasa === "en";
  if (p.nama_usaha.length < 2) return en ? "Enter your business name." : "Isi nama usaha.";
  if (!JENIS_USAHA.some((j) => j.nilai === p.segmen)) return en ? "Choose a business type." : "Pilih jenis usaha.";
  if (p.kontak_nama.length < 2) return en ? "Enter a contact name." : "Isi nama kontak.";
  if (!p.kontak_email && !p.kontak_telepon) return en ? "Enter an email address or a phone number." : "Isi email atau nomor telepon.";
  if (p.luas_min && p.luas_maks && Number(p.luas_min) > Number(p.luas_maks)) {
    return en ? "Minimum area is larger than maximum area." : "Luas minimum lebih besar dari luas maksimum.";
  }
  return null;
}

// ---------------------------------------------------------------- formulir publik

export async function daftarPublik(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const p = isiCalon(fd);
  const en = p.bahasa === "en";
  // Kolom jebakan: manusia tidak melihatnya, robot pengisi formulir biasanya mengisinya.
  const gagal = (pesan: string): StatusAksi => ({ ok: false, pesan, nilai: p, urut: Date.now() });
  if (teks(fd, "situs") !== "") return gagal(en ? "The form could not be saved." : "Data tidak bisa disimpan.");
  const salah = periksaCalon(p);
  if (salah) return gagal(salah);

  const hasil = await rpc<{ token: string }>("daftar_calon", { p });
  if (hasil.galat) return gagal(pesanGalat(hasil.galat, en));
  if (!hasil.data?.token) return gagal(pesanGalat({ jenis: "kosong" }, en));
  redirect(`/daftar/${hasil.data.token}`);
}

// ---------------------------------------------------------------- calon tenant (tim NFR)

export async function simpanCalon(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const p = isiCalon(fd);
  const gagal = (pesan: string): StatusAksi => ({ ok: false, pesan, nilai: p, urut: Date.now() });
  const salah = periksaCalon(p);
  if (salah) return gagal(salah);

  const hasil = await rpc<string>("calon_simpan", { p, p_oleh: await getEmailPengguna() });
  if (hasil.galat) return gagal(pesanGalat(hasil.galat));
  redirect(`/pipeline/calon/${hasil.data}`);
}

export async function ubahStatusCalon(fd: FormData) {
  const id = teks(fd, "id");
  if (UUID.test(id)) await rpc("calon_ubah_status", { p_id: id, p_status: teks(fd, "status") });
  refresh();
}

// ---------------------------------------------------------------- pipeline

/** Membuat peluang untuk satu lahan dan satu pihak, lalu membuka halamannya. */
export async function buatPeluang(fd: FormData) {
  const calon = teks(fd, "calon_id");
  const tenant = teks(fd, "tenant_id");
  const skor = Number(teks(fd, "skor"));
  const hasil = await rpc<string>("peluang_buat", {
    p_lahan_id: teks(fd, "lahan_id"),
    p_calon_id: UUID.test(calon) ? calon : undefined,
    p_tenant_id: tenant || undefined,
    p_skor: Number.isFinite(skor) && skor > 0 ? Math.round(skor) : undefined,
    p_oleh: await getEmailPengguna(),
  });
  if (hasil.galat || !hasil.data) throw new Error(hasil.galat ? pesanGalat(hasil.galat) : "Peluang tidak bisa dibuat.");
  redirect(`/pipeline/${hasil.data}`);
}

export async function ubahTahap(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  const hasil = await rpc<{ ok: boolean; pesan: string }>("peluang_ubah_tahap", {
    p_id: id,
    p_tahap: teks(fd, "tahap"),
    p_oleh: await getEmailPengguna(),
    p_catatan: teks(fd, "catatan") || undefined,
  });
  if (hasil.galat) return { ok: false, pesan: pesanGalat(hasil.galat) };
  refresh();
  return hasil.data ?? { ok: false, pesan: "Tahap tidak bisa diubah." };
}

export async function setSyarat(fd: FormData) {
  const id = Number(teks(fd, "syarat_id"));
  if (!Number.isInteger(id)) return;
  await rpc("peluang_set_syarat", { p_syarat_id: id, p_terpenuhi: teks(fd, "terpenuhi") === "1", p_oleh: await getEmailPengguna() });
  refresh();
}

export async function setCatatan(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  const hasil = await rpc("peluang_set_catatan", { p_id: id, p_catatan: teks(fd, "catatan") });
  if (hasil.galat) return { ok: false, pesan: pesanGalat(hasil.galat) };
  refresh();
  return { ok: true, pesan: "Catatan disimpan." };
}
