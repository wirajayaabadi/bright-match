import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Akses bucket Cloudflare R2 dari server, lewat jalur API (<akun>.r2.cloudflarestorage.com).
 * Alamat publik r2.dev diblokir di sebagian jaringan Indonesia, jadi semua foto lewat aplikasi ini.
 * Mengunggah dan menghapus butuh token R2 berizin tulis.
 */
function klien() {
  // R2_ACCOUNT_ID kadang diisi alamat endpoint utuh; yang dipakai hanya 32 karakter heksadesimalnya.
  const akun = (process.env.R2_ACCOUNT_ID ?? "").toLowerCase().match(/[0-9a-f]{32}/)?.[0];
  const { R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: rahasia, R2_BUCKET: bucket } = process.env;
  if (!akun || !id || !rahasia || !bucket) return null;
  return {
    aws: new AwsClient({ accessKeyId: id, secretAccessKey: rahasia, service: "s3", region: "auto" }),
    dasar: `https://${akun}.r2.cloudflarestorage.com/${bucket}`,
  };
}

export const r2Siap = () => klien() !== null;

/** Mengambil satu objek. null bila penyimpanan belum dikonfigurasi. */
export async function ambilObjek(kunci: string): Promise<Response | null> {
  const r2 = klien();
  return r2 ? r2.aws.fetch(`${r2.dasar}/${kunci}`) : null;
}

export async function simpanObjek(kunci: string, isi: Uint8Array<ArrayBuffer>, tipe: string): Promise<boolean> {
  const r2 = klien();
  if (!r2) return false;
  // Ditandatangani dulu, lalu dikirim dengan badan utuh. Bila dikirim sebagai objek Request, Next mengalirkannya
  // tanpa Content-Length dan R2 menolak dengan 411 MissingContentLength.
  const tanda = await r2.aws.sign(`${r2.dasar}/${kunci}`, { method: "PUT", body: isi, headers: { "content-type": tipe } });
  const hasil = await fetch(tanda.url, { method: "PUT", headers: tanda.headers, body: new Blob([isi], { type: tipe }) });
  // Jawaban galat R2 dicatat di log server (tanpa kunci rahasia) agar penyebabnya bisa dilacak.
  if (!hasil.ok) console.error(`R2 menolak unggahan ${kunci}: ${hasil.status} ${(await hasil.text()).slice(0, 300)}`);
  return hasil.ok;
}

export async function hapusObjek(kunci: string): Promise<boolean> {
  const r2 = klien();
  if (!r2) return false;
  const hasil = await r2.aws.fetch(`${r2.dasar}/${kunci}`, { method: "DELETE" });
  return hasil.ok || hasil.status === 404;
}
