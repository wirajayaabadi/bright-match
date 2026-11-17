import { rpc } from "@/lib/data";
import { kunciBagian, MAKS_BAGIAN, UKURAN_BAGIAN } from "@/lib/dokumen";
import { UUID } from "@/lib/istilah";
import { hapusObjek, r2Siap, simpanObjek } from "@/lib/r2";

/**
 * Satu bagian dari berkas besar (di atas 4 MB). Peramban memotong berkasnya dan mengirim bagian satu per satu;
 * setelah semua terkirim, rute .../selesai memeriksa dan mencatatnya. Sebelum dicatat, bagian-bagian ini belum
 * menjadi dokumen dan tidak bisa dibuka siapa pun.
 */
const galat = (pesan: string, status: number) => Response.json({ ok: false, pesan }, { status });

/** Pengguna boleh mengunggah ke peluang ini, dan nomor unggahannya belum pernah dicatat sebagai dokumen. */
async function bebas(peluangId: string, unggahan: string) {
  const hasil = await rpc<boolean>("dokumen_unggahan_bebas", { p_peluang_id: peluangId, p_unggahan: unggahan });
  return hasil.data === true;
}

export async function POST(req: Request, ctx: RouteContext<"/api/peluang/[id]/dokumen/bagian">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return galat("Peluang tidak dikenal.", 404);
  if (!r2Siap()) return galat("Penyimpanan berkas belum dikonfigurasi. Hubungi admin aplikasi.", 503);

  const fd = await req.formData().catch(() => null);
  const unggahan = String(fd?.get("unggahan") ?? "");
  const urut = Number(fd?.get("urut"));
  const bagian = fd?.get("bagian");
  if (!UUID.test(unggahan) || !Number.isInteger(urut) || urut < 1 || urut > MAKS_BAGIAN) return galat("Bagian berkas tidak dikenal.", 400);
  if (!(bagian instanceof File) || bagian.size === 0 || bagian.size > UKURAN_BAGIAN) return galat("Bagian berkas tidak terbaca. Coba unggah lagi.", 400);
  if (!(await bebas(id, unggahan))) return galat("Anda tidak bisa mengunggah dokumen ke peluang ini.", 403);

  const isi = new Uint8Array(await bagian.arrayBuffer());
  if (!(await simpanObjek(kunciBagian(`dokumen/${id}/${unggahan}`, urut), isi, "application/octet-stream"))) {
    return galat("Bagian berkas belum bisa disimpan. Coba lagi sebentar lagi.", 502);
  }
  return Response.json({ ok: true });
}

/** Membatalkan unggahan yang belum dicatat: bagian-bagiannya dihapus dari penyimpanan. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/peluang/[id]/dokumen/bagian">) {
  const { id } = await ctx.params;
  const unggahan = new URL(req.url).searchParams.get("unggahan") ?? "";
  if (!UUID.test(id) || !UUID.test(unggahan)) return galat("Unggahan tidak dikenal.", 400);
  if (!(await bebas(id, unggahan))) return galat("Unggahan ini tidak bisa dibatalkan.", 403);
  for (let n = 1; n <= MAKS_BAGIAN; n++) await hapusObjek(kunciBagian(`dokumen/${id}/${unggahan}`, n));
  return Response.json({ ok: true });
}
