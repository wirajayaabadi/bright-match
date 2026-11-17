"use client";

import { useEffect } from "react";

/** Tombol "/" memindahkan fokus ke kolom cari halaman, kecuali saat pengguna sedang mengetik di kolom lain. */
export default function PintasCari({ nama = "q" }: { nama?: string }) {
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const aktif = document.activeElement;
      if (aktif instanceof HTMLInputElement || aktif instanceof HTMLTextAreaElement || aktif instanceof HTMLSelectElement) return;
      const kolom = document.querySelector<HTMLInputElement>(`input[name="${nama}"]`);
      if (!kolom) return;
      e.preventDefault();
      kolom.focus();
      kolom.select();
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [nama]);
  return null;
}
