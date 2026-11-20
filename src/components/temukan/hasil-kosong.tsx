import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { n } from "@/lib/format";

/**
 * Tampilan kosong (DiscoveryEmptyState): tidak ada lokasi yang memenuhi semua syarat wajib.
 * Syarat tidak pernah dilonggarkan otomatis. Yang ditunjukkan: berapa lokasi yang muncul bila satu
 * syarat dilepas, dengan tautan untuk mengubah syarat itu sendiri.
 */
export default function HasilKosong({
  longgar,
  tertahan,
}: {
  longgar: { kunci: string; nama: string; ubah: string; jumlah: number | null }[];
  tertahan: number;
}) {
  const berguna = longgar.filter((l) => (l.jumlah ?? 0) > 0);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-6 shadow-card sm:p-8">
        <h2 className="text-xl font-extrabold tracking-[-0.01em] text-ink">Belum ada lokasi yang memenuhi semua syarat wajib Anda</h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">
          Kami tidak melonggarkan syarat Anda secara diam-diam, jadi tidak ada lokasi yang ditampilkan.
          {tertahan > 0 ? ` ${n(tertahan)} lokasi memenuhi syarat tetapi belum bisa ditawarkan: ditahan, datanya sedang diperiksa, atau sedang menuju kontrak.` : ""}
        </p>

        {berguna.length > 0 ? (
          <>
            <h3 className="mt-6 text-base font-bold text-ink">Syarat yang paling membatasi</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Angka di bawah adalah jumlah lokasi bila <span className="font-semibold text-ink">satu</span> syarat wajib dilepas dan syarat lainnya tetap. Ini melonggarkan syarat wajib,
              jadi keputusannya di tangan Anda.
            </p>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {berguna.map((l) => (
                <li key={l.kunci} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                  <p className="text-[15px] text-ink">
                    {l.nama}: <span className="angka font-semibold">{n(l.jumlah)} lokasi</span>
                  </p>
                  <Link
                    href={`/temukan/tenant?langkah=${l.ubah}&ubah=1`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-brand-blue/60"
                  >
                    Ubah syarat ini
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            Melepas satu syarat saja belum memunculkan lokasi. Coba ubah beberapa syarat sekaligus, atau pilih jenis usaha yang lebih umum.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <Link href="/temukan/tenant?langkah=ringkasan" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong">
            Ubah preferensi
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold text-ink">Butuh bantuan mencari?</h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">
          Daftar sebagai Bright Partner dan tim Non Fuel Retail Pertamina akan mencarikan pilihan lain untuk Anda, termasuk ruang yang datanya masih diperiksa.
        </p>
        <Link href="/daftar" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-lg border border-line bg-white px-5 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-brand-blue/60">
          Minta bantuan tim Non Fuel Retail
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Link>
      </section>
    </div>
  );
}
