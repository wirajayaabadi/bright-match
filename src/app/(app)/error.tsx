"use client";

/** Tampil bila sebuah halaman atau aksi gagal secara tak terduga. */
export default function Galat({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="max-w-2xl rounded-xl border border-line bg-white p-6 shadow-card">
      <h1 className="text-xl font-extrabold text-ink">Terjadi kesalahan</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {error.message && !error.digest ? error.message : "Permintaan tidak bisa diselesaikan. Coba lagi; bila berulang, periksa terminal server."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-strong"
      >
        Coba lagi
      </button>
    </section>
  );
}
