"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MulaiUlang from "@/components/temukan/mulai-ulang";
import { NAMA_PERAN } from "@/lib/temukan/kuesioner";
import type { Peran } from "@/lib/temukan/tipe";

/** Pengunjung yang kembali: lanjutkan dari jawaban tersimpan, tanpa mengulang kuesioner. */
export default function Lanjutkan({ sesi }: { sesi: { peran: Peran; selesai: boolean; terjawab: number; jumlah: number }[] }) {
  const router = useRouter();
  return (
    <section aria-label="Lanjutkan yang sudah Anda mulai" className="mx-auto mt-8 max-w-3xl space-y-2.5 text-left">
      {sesi.map((s) => (
        <div key={s.peran} className="flex flex-col gap-3 rounded-xl border border-brand-blue/40 bg-brand-blue-soft/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-semibold text-ink">{NAMA_PERAN[s.peran].judul}</p>
            <p className="angka text-sm text-muted">
              {s.selesai ? "Jawaban inti Anda sudah lengkap dan tersimpan." : `${s.terjawab} dari ${s.jumlah} pertanyaan inti sudah dijawab.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <MulaiUlang
              peran={s.peran}
              onSelesai={() => router.push(`/temukan/${s.peran}`)}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted hover:text-ink hover:underline"
            />
            {s.selesai && (
              <Link href={`/temukan/${s.peran}?langkah=ringkasan`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted hover:text-ink hover:underline">
                Ubah preferensi
              </Link>
            )}
            <Link
              href={s.selesai ? `/temukan/${s.peran}/hasil` : `/temukan/${s.peran}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong"
            >
              {s.selesai ? "Lihat rekomendasi" : "Lanjutkan"}
              <ArrowRight aria-hidden="true" className="size-4.5" />
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
