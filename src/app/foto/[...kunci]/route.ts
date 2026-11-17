import { rpc } from "@/lib/data";
import { ambilObjek } from "@/lib/r2";

/**
 * Menyajikan foto dari bucket Cloudflare R2 lewat aplikasi ini (lihat src/lib/r2.ts untuk alasannya).
 *
 * Dua jenis kunci yang dilayani:
 * - brightspace/<aa>/<sha256>[-480].webp  foto Brightspace. Namanya hash isinya, jadi tidak pernah berubah dan
 *   boleh disimpan CDN setahun. Terbuka bagi siapa pun yang tahu alamatnya, sama seperti di sumbernya.
 * - inspeksi/<inspeksi>/<foto>.jpg        foto bukti inspeksi. Hanya untuk anggota NFR dan pengelola SPBU itu
 *   yang sedang masuk, dan hanya disimpan di cache peramban orang itu.
 */
const POLA_BRIGHTSPACE = /^brightspace\/([0-9a-f]{2})\/\1[0-9a-f]{62}(-480)?\.webp$/;
const POLA_INSPEKSI = /^inspeksi\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

export async function GET(_req: Request, ctx: RouteContext<"/foto/[...kunci]">) {
  const kunci = (await ctx.params).kunci.join("/");
  const inspeksi = POLA_INSPEKSI.test(kunci);
  if (!inspeksi && !POLA_BRIGHTSPACE.test(kunci)) return new Response("Tidak ditemukan", { status: 404 });

  if (inspeksi) {
    // tim NFR, atau anggota organisasi dealer yang mengelola SPBU inspeksi itu
    const boleh = await rpc<boolean>("inspeksi_boleh_lihat", { p_id: kunci.split("/")[1] });
    if (boleh.data !== true) return new Response("Tidak ditemukan", { status: 404 });
  }

  const asal = await ambilObjek(kunci);
  if (!asal) return new Response("Penyimpanan foto belum dikonfigurasi (R2_* di .env.local).", { status: 503 });
  if (asal.status === 404) return new Response("Tidak ditemukan", { status: 404 });
  if (!asal.ok || !asal.body) return new Response("Foto sedang tidak bisa diambil.", { status: 502 });

  const header = new Headers({
    "content-type": inspeksi ? "image/jpeg" : "image/webp",
    "cache-control": inspeksi ? "private, max-age=86400" : "public, max-age=31536000, immutable",
  });
  const panjang = asal.headers.get("content-length");
  if (panjang) header.set("content-length", panjang);
  return new Response(asal.body, { headers: header });
}
