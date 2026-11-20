import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { GarisMerek } from "@/components/brand";

/** Kepala halaman Temukan peluang di luar wizard: merek di kiri, tindakan di kanan. Tanpa menu aplikasi. */
export default function KepalaTemukan({ children }: { children?: ReactNode }) {
  return (
    <>
      <GarisMerek className="rounded-none" />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/temukan" className="flex min-h-11 items-center gap-3 rounded-lg" aria-label="Bright Match, halaman Temukan peluang">
            <Image src="/brand/logo-pertamina.png" alt="Pertamina" width={467} height={118} priority className="h-5 w-auto" />
            <span className="border-l border-line pl-3 text-[15px] font-extrabold tracking-[-0.01em] whitespace-nowrap text-ink">Bright Match</span>
          </Link>
          <div className="flex items-center gap-2">{children}</div>
        </div>
      </header>
    </>
  );
}
