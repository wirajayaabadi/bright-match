"use client";

/** Membuka dialog cetak peramban; dari sana halaman bisa disimpan sebagai PDF. */
export default function TombolCetak({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-10 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong"
    >
      {label}
    </button>
  );
}
