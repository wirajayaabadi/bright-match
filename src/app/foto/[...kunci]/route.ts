import { AwsClient } from "aws4fetch";

/**
 * Menyajikan foto Brightspace dari bucket Cloudflare R2 lewat aplikasi ini.
 *
 * Alamat publik bucket (r2.dev) diblokir di sebagian jaringan Indonesia: DNS-nya diarahkan ke halaman
 * blokir Komdigi. Jalur API R2 (<akun>.r2.cloudflarestorage.com) tetap terbuka, jadi server mengambil
 * berkasnya di sana dengan kredensial R2_* lalu meneruskannya ke peramban.
 *
 * Nama berkas adalah hash isinya, jadi isinya tidak pernah berubah: respons boleh disimpan CDN dan
 * peramban selama setahun. Hanya kunci berpola brightspace/<aa>/<sha256>[-480].webp yang dilayani.
 */
const POLA = /^brightspace\/([0-9a-f]{2})\/\1[0-9a-f]{62}(-480)?\.webp$/;

function klienR2() {
  // R2_ACCOUNT_ID kadang diisi alamat endpoint utuh; yang dipakai hanya 32 karakter heksadesimalnya.
  const akun = (process.env.R2_ACCOUNT_ID ?? "").toLowerCase().match(/[0-9a-f]{32}/)?.[0];
  const { R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: rahasia, R2_BUCKET: bucket } = process.env;
  if (!akun || !id || !rahasia || !bucket) return null;
  return {
    klien: new AwsClient({ accessKeyId: id, secretAccessKey: rahasia, service: "s3", region: "auto" }),
    dasar: `https://${akun}.r2.cloudflarestorage.com/${bucket}`,
  };
}

export async function GET(_req: Request, ctx: RouteContext<"/foto/[...kunci]">) {
  const kunci = (await ctx.params).kunci.join("/");
  if (!POLA.test(kunci)) return new Response("Tidak ditemukan", { status: 404 });

  const r2 = klienR2();
  if (!r2) return new Response("Penyimpanan foto belum dikonfigurasi (R2_* di .env.local).", { status: 503 });

  const asal = await r2.klien.fetch(`${r2.dasar}/${kunci}`);
  if (asal.status === 404) return new Response("Tidak ditemukan", { status: 404 });
  if (!asal.ok || !asal.body) return new Response("Foto sedang tidak bisa diambil.", { status: 502 });

  const header = new Headers({
    "content-type": "image/webp",
    "cache-control": "public, max-age=31536000, immutable",
  });
  const panjang = asal.headers.get("content-length");
  if (panjang) header.set("content-length", panjang);
  return new Response(asal.body, { headers: header });
}
