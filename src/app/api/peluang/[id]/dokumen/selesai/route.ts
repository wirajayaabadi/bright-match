import { createHash } from "node:crypto";
import { rpc } from "@/lib/data";
import { kenaliBerkas, kunciBagian, MAKS_BAGIAN, MAKS_BESAR, MAKS_BYTES, UKURAN_BAGIAN } from "@/lib/dokumen";
import { UUID } from "@/lib/istilah";
import { ambilObjek, hapusObjek, r2Siap } from "@/lib/r2";

/**
 * Menyelesaikan unggahan berkas besar. Server membaca kembali semua bagian dari penyimpanan, memastikan
 * ukurannya, mengenali jenis berkas dari isinya, dan menghitung sidik SHA-256 dari isi yang benar-benar tersimpan.
 * Baru setelah itu dokumennya dicatat. Bila ada yang ditolak, semua bagiannya dihapus lagi.
 */
const galat = (pesan: string, status: number) => Response.json({ ok: false, pesan }, { status });

export async function POST(req: Request, ctx: RouteContext<"/api/peluang/[id]/dokumen/selesai">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return galat("Peluang tidak dikenal.", 404);
  if (!r2Siap()) return galat("Penyimpanan berkas belum dikonfigurasi. Hubungi admin aplikasi.", 503);

  const fd = await req.formData().catch(() => null);
  const teks = (k: string) => String(fd?.get(k) ?? "").trim();
  const unggahan = teks("unggahan");
  const jumlah = Number(teks("bagian"));
  if (!UUID.test(unggahan) || !Number.isInteger(jumlah) || jumlah < 2 || jumlah > MAKS_BAGIAN) return galat("Unggahan tidak dikenal.", 400);
  const menggantikan = teks("menggantikan");
  if (menggantikan !== "" && !UUID.test(menggantikan)) return galat("Dokumen yang akan diganti tidak dikenal.", 400);

  const bebas = await rpc<boolean>("dokumen_unggahan_bebas", { p_peluang_id: id, p_unggahan: unggahan });
  if (bebas.data !== true) return galat("Anda tidak bisa mengunggah dokumen ke peluang ini.", 403);

  const dasar = `dokumen/${id}/${unggahan}`;
  const buang = async () => {
    for (let n = 1; n <= MAKS_BAGIAN; n++) await hapusObjek(kunciBagian(dasar, n));
  };
  const tolak = async (pesan: string, status: number) => {
    await buang();
    return galat(pesan, status);
  };

  // Baca kembali yang tersimpan: ukuran, jenis, dan sidik dihitung dari sana, bukan dari klaim peramban.
  const sidik = createHash("sha256");
  let total = 0;
  let jenisBerkas: ReturnType<typeof kenaliBerkas> = null;
  for (let n = 1; n <= jumlah; n++) {
    const jawab = await ambilObjek(kunciBagian(dasar, n));
    if (!jawab || !jawab.ok) return tolak("Unggahan belum lengkap. Coba unggah lagi dari awal.", 400);
    const isi = new Uint8Array(await jawab.arrayBuffer());
    // semua bagian kecuali yang terakhir harus penuh, supaya susunannya tidak bisa dipalsukan
    if (isi.length === 0 || isi.length > UKURAN_BAGIAN || (n < jumlah && isi.length !== UKURAN_BAGIAN)) return tolak("Unggahan tidak utuh. Coba unggah lagi dari awal.", 400);
    if (n === 1) jenisBerkas = kenaliBerkas(isi);
    sidik.update(isi);
    total += isi.length;
  }
  if (!jenisBerkas) return tolak("Berkas ini bukan PDF, JPEG, atau PNG. Simpan dulu sebagai PDF, lalu unggah lagi.", 415);
  if (total <= MAKS_BYTES || total > MAKS_BESAR) return tolak("Berkas terlalu besar. Batasnya 24 MB.", 413);

  const catat = await rpc<{ ok: boolean; pesan?: string; id?: string }>("dokumen_catat", {
    p_peluang_id: id,
    p_jenis: teks("jenis") || null,
    p_judul: teks("judul"),
    p_kunci: `${dasar}.${jenisBerkas.ekstensi}`,
    p_nama_berkas: teks("nama_berkas"),
    p_tipe: jenisBerkas.tipe,
    p_bytes: total,
    p_sha256: sidik.digest("hex"),
    p_tampak_tenant: fd?.get("tampak_tenant") === "ya",
    p_tampak_dealer: fd?.get("tampak_dealer") === "ya",
    p_menggantikan: menggantikan || null,
    p_bagian: jumlah,
  });
  if (!catat.data?.ok) return tolak(catat.data?.pesan ?? "Dokumen belum bisa dicatat. Coba lagi sebentar lagi.", 400);
  return Response.json({ ok: true, id: catat.data.id, pesan: catat.data.pesan });
}
