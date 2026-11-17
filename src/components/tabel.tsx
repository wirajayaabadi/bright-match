import Link from "next/link";
import { n } from "@/lib/format";

/** Gaya sel yang dipakai semua tabel data. */
export const th = "px-4 py-3 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-subtle uppercase";
export const thKanan = `${th} text-right`;
export const td = "px-4 py-3 align-top";
export const tdAngka = `${td} angka text-right whitespace-nowrap`;
export const tautan = "font-semibold text-brand-blue-strong underline-offset-2 hover:underline";

/** Bingkai tabel yang bisa digulir ke samping di layar sempit. */
export function BingkaiTabel({ children, lebarMin = "min-w-[760px]" }: { children: React.ReactNode; lebarMin?: string }) {
  return (
    // `relative`: label sr-only di dalam tabel berposisi absolut; tanpa acuan ini ia lolos dari bingkai
    // gulir dan melebarkan halaman di ponsel.
    <div className="relative overflow-x-auto rounded-xl border border-line bg-white shadow-card">
      <table className={`w-full ${lebarMin} border-collapse text-sm`}>{children}</table>
    </div>
  );
}

export function BarisKosong({ kolom, pesan }: { kolom: number; pesan: string }) {
  return (
    <tr>
      <td colSpan={kolom} className="px-4 py-10 text-center text-sm text-subtle">
        {pesan}
      </td>
    </tr>
  );
}

/** Penomoran halaman: jumlah hasil, lalu tautan sebelumnya dan berikutnya. */
export function Halaman({
  halaman,
  total,
  perHalaman = 25,
  satuan,
  href,
}: {
  halaman: number;
  total: number;
  perHalaman?: number;
  satuan: string;
  href: (halaman: number) => string;
}) {
  const jumlahHalaman = Math.max(1, Math.ceil(total / perHalaman));
  const awal = total === 0 ? 0 : (halaman - 1) * perHalaman + 1;
  const akhir = Math.min(total, halaman * perHalaman);
  const tombol = "inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold";

  return (
    <nav aria-label="Halaman" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p className="angka">
        {total === 0 ? `Tidak ada ${satuan}` : `${n(awal)}–${n(akhir)} dari ${n(total)} ${satuan}`}
      </p>
      {/* Selalu tampil, juga saat hanya satu halaman: posisi daftar tetap terbaca. */}
        <div className="flex items-center gap-2">
          {halaman > 1 ? (
            <Link href={href(halaman - 1)} className={`${tombol} text-ink hover:border-subtle`}>
              Sebelumnya
            </Link>
          ) : (
            <span aria-disabled="true" className={`${tombol} text-subtle opacity-60`}>
              Sebelumnya
            </span>
          )}
          <span className="angka px-1">
            Halaman {n(halaman)} dari {n(jumlahHalaman)}
          </span>
          {halaman < jumlahHalaman ? (
            <Link href={href(halaman + 1)} className={`${tombol} text-ink hover:border-subtle`}>
              Berikutnya
            </Link>
          ) : (
            <span aria-disabled="true" className={`${tombol} text-subtle opacity-60`}>
              Berikutnya
            </span>
          )}
        </div>
    </nav>
  );
}

/** Label kecil berbingkai. */
export function Lencana({ children, warna = "netral" }: { children: React.ReactNode; warna?: "netral" | "hijau" | "biru" | "kuning" | "merah" }) {
  const kelas = {
    netral: "border border-line text-muted",
    hijau: "bg-brand-green-soft text-brand-green-strong",
    biru: "bg-brand-blue-soft text-brand-blue-strong",
    kuning: "bg-warn-soft text-warn",
    merah: "bg-brand-red-soft text-brand-red-strong",
  }[warna];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${kelas}`}>{children}</span>;
}

/** Bagian halaman dengan judul. */
export function Bagian({
  judul,
  keterangan,
  children,
  id,
}: {
  judul: string;
  keterangan?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-10">
      <h2 className="text-lg font-bold text-ink">{judul}</h2>
      {keterangan && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{keterangan}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Jejak halaman: tautan ke induk, lalu nama halaman ini. */
export function Jejak({ induk, kini }: { induk: { href: string; nama: string }[]; kini: string }) {
  return (
    <nav aria-label="Jejak halaman" className="mb-4 flex flex-wrap items-center gap-x-2 text-sm text-subtle">
      {induk.map((i) => (
        <span key={i.href} className="flex items-center gap-x-2">
          <Link href={i.href} className={tautan}>
            {i.nama}
          </Link>
          <span aria-hidden="true">/</span>
        </span>
      ))}
      <span>{kini}</span>
    </nav>
  );
}
