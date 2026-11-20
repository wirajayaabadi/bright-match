"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";

/**
 * Next.js 16 menyimpan keadaan halaman yang ditinggalkan dan menampilkannya lagi saat halaman itu dibuka kembali.
 * Untuk wizard dan halaman hasil, itu berarti jawaban lama bisa muncul setelah preferensi diubah atau dihapus
 * di halaman lain. Pembungkus ini memasang ulang isinya pada navigasi baru (tautan, router.push), sehingga
 * isinya kembali dibaca dari sesi di server. Tombol kembali dan maju peramban tetap memulihkan keadaan terakhir.
 */
export default function Segar({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
