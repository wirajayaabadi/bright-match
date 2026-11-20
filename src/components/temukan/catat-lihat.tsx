"use client";

import { useEffect } from "react";
import { catatPeristiwa } from "@/app/aksi-temukan";

/** Mencatat bahwa rekomendasi pengelola SPBU benar-benar tampil di layar. Tanpa identitas, tanpa tampilan. */
export default function CatatLihat({ jumlah }: { jumlah: number }) {
  useEffect(() => {
    void catatPeristiwa("dealer", "recommendation_viewed", { jumlah }).catch(() => {});
  }, [jumlah]);
  return null;
}
