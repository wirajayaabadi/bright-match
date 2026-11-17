import { rpc } from "@/lib/data";
import { kunciBagian } from "@/lib/dokumen";
import { UUID } from "@/lib/istilah";
import { ambilObjek } from "@/lib/r2";

/**
 * Membuka satu dokumen peluang. Hak bukanya diperiksa basis data untuk tiap permintaan (dokumen_akses):
 * tim NFR, tenant penerima penawaran bila dokumennya dibuka untuknya, atau pengelola SPBU bila dibuka untuknya.
 * Dokumen yang ditarik tidak bisa dibuka siapa pun. Jawabannya tidak disimpan di cache.
 */
export async function GET(_req: Request, ctx: RouteContext<"/dokumen/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Tidak ditemukan", { status: 404 });
  const akses = await rpc<{ kunci: string; nama_berkas: string; tipe: string; bytes: number; bagian: number } | null>("dokumen_akses", { p_id: id });
  if (!akses.data) return new Response("Dokumen ini tidak ditemukan atau tidak dibuka untuk Anda.", { status: 404 });
  const { kunci, bagian } = akses.data;

  // Berkas besar disimpan berpotongan; bagian pertama diambil dulu supaya berkas yang hilang dijawab 404, bukan aliran putus.
  const asal = await ambilObjek(bagian > 1 ? kunciBagian(kunci, 1) : kunci);
  if (!asal) return new Response("Penyimpanan berkas belum dikonfigurasi (R2_* di .env.local).", { status: 503 });
  if (asal.status === 404) return new Response("Berkas dokumen ini tidak ada di penyimpanan.", { status: 404 });
  if (!asal.ok || !asal.body) return new Response("Dokumen sedang tidak bisa diambil.", { status: 502 });

  // Nama berkas untuk kepala HTTP: versi ASCII yang aman, ditambah versi aslinya dalam UTF-8.
  const nama = akses.data.nama_berkas;
  const ascii = nama.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const header = new Headers({
    "content-type": akses.data.tipe,
    "content-disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  if (bagian > 1) {
    header.set("content-length", String(akses.data.bytes));
    // Bagian-bagian dialirkan berurutan, diambil satu per satu saat peramban siap menerima.
    let urut = 1;
    let pembaca: ReadableStreamDefaultReader<Uint8Array> | null = asal.body.getReader();
    const aliran = new ReadableStream<Uint8Array>({
      async pull(pengendali) {
        for (;;) {
          if (!pembaca) {
            urut += 1;
            if (urut > bagian) return pengendali.close();
            const lanjut = await ambilObjek(kunciBagian(kunci, urut));
            if (!lanjut?.ok || !lanjut.body) return pengendali.error(new Error(`Bagian ${urut} dokumen tidak bisa diambil.`));
            pembaca = lanjut.body.getReader();
          }
          const { done, value } = await pembaca.read();
          if (done) {
            pembaca = null;
            continue;
          }
          return pengendali.enqueue(value);
        }
      },
      async cancel() {
        await pembaca?.cancel();
      },
    });
    return new Response(aliran, { headers: header });
  }
  const panjang = asal.headers.get("content-length");
  if (panjang) header.set("content-length", panjang);
  return new Response(asal.body, { headers: header });
}
