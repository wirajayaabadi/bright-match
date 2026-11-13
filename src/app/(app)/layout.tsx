import { Suspense } from "react";
import Akun from "@/components/akun";
import { GarisMerek, Merek } from "@/components/brand";
import Nav from "@/components/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-card"
      >
        Lewati ke konten
      </a>

      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:border-r lg:border-b-0">
        <GarisMerek className="rounded-none" />
        <div className="px-4 pt-5 pb-4 lg:px-5 lg:pt-6">
          <Merek />
        </div>
        <div className="px-2 pb-3 lg:flex-1 lg:overflow-y-auto lg:px-3">
          {/* usePathname() butuh batas Suspense agar kerangka halaman tetap bisa dipra-render. */}
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
        </div>
        <div className="border-t border-line px-4 py-3 lg:px-5 lg:py-4">
          <Suspense fallback={<div className="h-8" />}>
            <Akun />
          </Suspense>
        </div>
      </aside>

      <main id="konten" className="px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
