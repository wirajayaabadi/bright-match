import Link from "next/link";
import { getRuang } from "@/lib/data";

/**
 * Tombol kanan atas halaman Temukan peluang: ke ruang kerja bila sudah masuk, ke halaman masuk bila belum.
 * `lanjut` membawa pengguna kembali ke halaman ini setelah masuk (hanya alamat Temukan peluang yang diterima server).
 */
export default async function TombolAkun({ lanjut }: { lanjut?: string }) {
  const ruang = await getRuang();
  const kelas = "inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-[15px] font-semibold whitespace-nowrap text-ink transition-colors duration-150 hover:border-brand-blue/60";
  if (ruang === null) {
    return (
      <Link href={lanjut ? `/login?lanjut=${encodeURIComponent(lanjut)}` : "/login"} className={kelas}>
        Masuk
      </Link>
    );
  }
  return (
    <Link href={ruang === "nfr" ? "/" : "/ruang-kerja"} className={kelas}>
      {/* Satu pembungkus, karena tautannya flex: tanpa itu spasi di antara "Buka" dan kata berikutnya hilang.
          Di layar sempit kata "Buka" disembunyikan dari tampilan agar tombol tidak terlipat; pembaca layar tetap membacanya. */}
      <span>
        <span className="sr-only sm:not-sr-only">Buka </span>
        {ruang === "nfr" ? "Command Center" : "ruang kerja"}
      </span>
    </Link>
  );
}
