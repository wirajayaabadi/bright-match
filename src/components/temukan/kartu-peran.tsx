import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * Kartu pilihan peran di halaman depan (RoleSelectionCard). Seluruh kartu adalah satu tautan,
 * jadi target sentuhnya besar dan tetap berfungsi tanpa JavaScript.
 */
export default function KartuPeran({
  href,
  ikon: Ikon,
  warna,
  judul,
  keterangan,
  butir,
  tombol,
}: {
  href: string;
  ikon: LucideIcon;
  warna: "biru" | "hijau";
  judul: string;
  keterangan: string;
  butir: string[];
  tombol: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-line bg-white p-6 shadow-card transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-brand-blue hover:shadow-[0_2px_4px_rgb(16_24_40/0.05),0_12px_28px_rgb(16_24_40/0.09)] motion-safe:hover:-translate-y-0.5 sm:p-8"
    >
      <span className={`grid size-12 place-items-center rounded-xl ${warna === "biru" ? "bg-brand-blue-soft text-brand-blue-strong" : "bg-brand-green-soft text-brand-green-strong"}`}>
        <Ikon aria-hidden="true" strokeWidth={1.75} className="size-6" />
      </span>
      <h2 className="mt-5 text-xl leading-snug font-extrabold tracking-[-0.01em] text-ink">{judul}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{keterangan}</p>
      <ul className="mt-5 flex-1 space-y-2 border-t border-line pt-5 text-sm text-muted">
        {butir.map((b) => (
          <li key={b} className="flex items-start gap-2.5">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-green-strong" strokeWidth={2.5} />
            {b}
          </li>
        ))}
      </ul>
      <span className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white transition-colors duration-150 group-hover:bg-brand-blue-strong sm:self-start">
        {tombol}
        <ArrowRight aria-hidden="true" className="size-4.5 transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
