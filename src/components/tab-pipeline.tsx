import Link from "next/link";

/** Dua tab modul Pipeline: peluang dan calon tenant. */
export default function TabPipeline({ aktif }: { aktif: "peluang" | "calon" }) {
  const tab = (kunci: "peluang" | "calon", href: string, nama: string) => (
    <Link
      href={href}
      aria-current={aktif === kunci ? "page" : undefined}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${
        aktif === kunci ? "bg-brand-blue-soft text-brand-blue-strong" : "text-muted hover:bg-white hover:text-ink"
      }`}
    >
      {nama}
    </Link>
  );
  return (
    <nav aria-label="Bagian pipeline" className="mb-6 flex flex-wrap gap-1">
      {tab("peluang", "/pipeline", "Peluang")}
      {tab("calon", "/pipeline/calon", "Calon tenant")}
    </nav>
  );
}
