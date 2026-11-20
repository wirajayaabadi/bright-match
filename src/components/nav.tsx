"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODUL } from "@/lib/modules";

const ITEM = [{ href: "/", nama: "Beranda", tahap: 1 as const, siap: true }, ...MODUL];

const RUANG_TENANT = [
  { href: "/ruang-kerja", nama: "Penawaran untuk Anda", tahap: 1 as const, siap: true },
  { href: "/ruang-kerja/jelajah", nama: "Jelajahi lokasi", tahap: 1 as const, siap: true },
  // Di luar ruang kerja: rekomendasi dari preferensi akun. Tanpa preferensi, pengguna dibawa ke kuesionernya.
  { href: "/temukan/tenant/hasil", nama: "Rekomendasi lokasi", tahap: 1 as const, siap: true },
];
const RUANG_DEALER = [
  { href: "/ruang-kerja", nama: "SPBU Anda", tahap: 1 as const, siap: true },
  { href: "/temukan/dealer/hasil", nama: "Peluang untuk SPBU", tahap: 1 as const, siap: true },
];

/** `ruang` tenant atau dealer: hanya ruang kerjanya. Selain itu: modul NFR. */
export default function Nav({ ruang }: { ruang?: "nfr" | "tenant" | "dealer" | null }) {
  const path = usePathname();
  const daftar = ruang === "tenant" ? RUANG_TENANT : ruang === "dealer" ? RUANG_DEALER : ITEM;

  return (
    <nav aria-label="Modul Bright Match">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {daftar.map((it) => {
          const aktif = it.href === "/" ? path === "/" : path === it.href || path.startsWith(`${it.href}/`);
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={aktif ? "page" : undefined}
                className={`flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 text-sm whitespace-nowrap transition-colors ${
                  aktif
                    ? "bg-brand-blue-soft font-semibold text-brand-blue-strong"
                    : "font-medium text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {it.nama}
                {!it.siap && (
                  <span className="rounded-full border border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-subtle">
                    Tahap {it.tahap}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
