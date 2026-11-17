import { rpc } from "@/lib/data";
import { kenaliBerkas, MAKS_BYTES } from "@/lib/dokumen";
import { UUID } from "@/lib/istilah";
import { hapusObjek, r2Siap, simpanObjek } from "@/lib/r2";

/**
 * Mengunggah satu dokumen ke satu peluang. Urutannya: pastikan pengunggah berhak (tim NFR yang boleh mengubah,
 * atau tenant penerima penawaran), kenali jenis berkas dari isinya, simpan ke bucket, lalu catat di basis data.
 * Bila pencatatan ditolak, berkasnya dihapus lagi. Aturan jenis, versi, dan keterlihatan ada di dokumen_catat.
 */
const galat = (pesan: string, status: number) => Response.json({ ok: false, pesan }, { status });

export async function POST(req: Request, ctx: RouteContext<"/api/peluang/[id]/dokumen">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return galat("Peluang tidak dikenal.", 404);
  if (!r2Siap()) return galat("Penyimpanan berkas belum dikonfigurasi. Hubungi admin aplikasi.", 503);

  const boleh = await rpc<string | null>("dokumen_boleh_unggah", { p_peluang_id: id });
  if (boleh.data !== "nfr" && boleh.data !== "tenant") return galat("Anda tidak bisa mengunggah dokumen ke peluang ini.", 403);

  const fd = await req.formData().catch(() => null);
  const berkas = fd?.get("berkas");
  if (!(berkas instanceof File) || berkas.size === 0) return galat("Pilih berkasnya dulu.", 400);
  if (berkas.size > MAKS_BYTES) return galat("Berkas di atas 4 MB diunggah bertahap. Muat ulang halaman lalu coba lagi.", 413);
  const isi = new Uint8Array(await berkas.arrayBuffer());
  const jenisBerkas = kenaliBerkas(isi);
  if (!jenisBerkas) return galat("Berkas ini bukan PDF, JPEG, atau PNG. Simpan dulu sebagai PDF, lalu unggah lagi.", 415);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", isi)), (b) => b.toString(16).padStart(2, "0")).join("");

  const teks = (k: string) => String(fd?.get(k) ?? "").trim();
  const menggantikan = teks("menggantikan");
  if (menggantikan !== "" && !UUID.test(menggantikan)) return galat("Dokumen yang akan diganti tidak dikenal.", 400);

  const kunci = `dokumen/${id}/${crypto.randomUUID()}.${jenisBerkas.ekstensi}`;
  if (!(await simpanObjek(kunci, isi, jenisBerkas.tipe))) return galat("Berkas belum bisa disimpan. Coba lagi sebentar lagi.", 502);

  const catat = await rpc<{ ok: boolean; pesan?: string; id?: string }>("dokumen_catat", {
    p_peluang_id: id,
    p_jenis: teks("jenis") || null,
    p_judul: teks("judul"),
    p_kunci: kunci,
    p_nama_berkas: berkas.name,
    p_tipe: jenisBerkas.tipe,
    p_bytes: isi.length,
    p_sha256: sha256,
    p_tampak_tenant: fd?.get("tampak_tenant") === "ya",
    p_tampak_dealer: fd?.get("tampak_dealer") === "ya",
    p_menggantikan: menggantikan || null,
  });
  if (!catat.data?.ok) {
    await hapusObjek(kunci);
    return galat(catat.data?.pesan ?? "Dokumen belum bisa dicatat. Coba lagi sebentar lagi.", 400);
  }
  return Response.json({ ok: true, id: catat.data.id, pesan: catat.data.pesan });
}
