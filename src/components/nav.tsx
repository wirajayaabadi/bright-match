"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODUL } from "@/lib/modules";

const ITEM = [{ href: "/", nama: "Beranda", tahap: 1 as const, siap: true }, ...MODUL];

export default function Nav() {
  const path = usePathname();

  return (
    <nav aria-label="Modul Bright Match">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {ITEM.map((it) => {
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
