import { rpc } from "@/lib/data";
import { UUID } from "@/lib/istilah";
import { hapusObjek, r2Siap, simpanObjek } from "@/lib/r2";

/**
 * Mengunggah satu foto bukti inspeksi. Peramban sudah mengecilkan foto menjadi JPEG (lihat unggah-foto.tsx),
 * jadi berkas yang masuk kecil. Urutannya: pastikan pengunggah adalah pemeriksa inspeksi yang masih draf,
 * simpan ke bucket, lalu catat di basis data. Bila pencatatan gagal, berkasnya dihapus lagi.
 */
const MAKS = 3_000_000;
const galat = (pesan: string, status: number) => Response.json({ ok: false, pesan }, { status });

export async function POST(req: Request, ctx: RouteContext<"/api/inspeksi/[id]/foto">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return galat("Inspeksi tidak dikenal.", 404);
  if (!r2Siap()) return galat("Penyimpanan foto belum dikonfigurasi. Hubungi admin aplikasi.", 503);

  // Pemeriksanya bisa staf NFR atau pengelola SPBU; keduanya diperiksa fungsi yang sama.
  const boleh = await rpc<boolean>("inspeksi_boleh_isi", { p_id: id });
  if (boleh.data !== true) return galat("Foto hanya bisa ditambah pemeriksa selama inspeksi masih draf.", 403);

  const fd = await req.formData().catch(() => null);
  const berkas = fd?.get("foto");
  if (!(berkas instanceof File)) return galat("Foto tidak terkirim. Coba pilih fotonya lagi.", 400);
  if (berkas.size > MAKS) return galat("Foto terlalu besar. Coba ambil ulang dengan resolusi lebih rendah.", 413);
  const isi = new Uint8Array(await berkas.arrayBuffer());
  if (isi.length < 4 || isi[0] !== 0xff || isi[1] !== 0xd8 || isi[2] !== 0xff) {
    return galat("Berkas ini bukan foto JPEG. Pilih foto lain.", 415);
  }
  const ukuran = (nama: string) => {
    const v = Number(fd?.get(nama));
    return Number.isInteger(v) && v > 0 && v <= 10000 ? v : null;
  };

  const kunci = `inspeksi/${id}/${crypto.randomUUID()}.jpg`;
  if (!(await simpanObjek(kunci, isi, "image/jpeg"))) return galat("Foto belum bisa disimpan. Coba lagi sebentar lagi.", 502);

  const catat = await rpc<{ ok: boolean; pesan?: string; id?: string }>("inspeksi_foto_tambah", {
    p_inspeksi_id: id,
    p_kunci: kunci,
    p_lebar: ukuran("lebar"),
    p_tinggi: ukuran("tinggi"),
    p_bytes: isi.length,
  });
  if (!catat.data?.ok) {
    await hapusObjek(kunci);
    return galat(catat.data?.pesan ?? "Foto belum bisa dicatat. Coba lagi sebentar lagi.", 400);
  }
  return Response.json({ ok: true, id: catat.data.id, kunci });
}
