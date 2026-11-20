import type { Metadata } from "next";
import { Suspense } from "react";
import { daftarPublik } from "@/app/aksi";
import { GarisMerek, Merek } from "@/components/brand";
import FormCalon from "@/components/form-calon";
import PanelGalat from "@/components/panel-galat";
import { supabaseSiap } from "@/lib/supabase/env";
import { kuesioner } from "@/lib/temukan/kuesioner";
import { keCalon } from "@/lib/temukan/ringkas";
import { bacaSesi } from "@/lib/temukan/sesi";

export const metadata: Metadata = {
  title: "Jadi Bright Partner",
  description: "Daftarkan usaha Anda dan lihat ruang usaha di SPBU Pertamina yang cocok.",
};

/** Formulir yang sudah diisi dari jawaban Temukan peluang, bila pengunjung ini punya sesi pencarian lokasi. */
async function FormDariTemukan() {
  const sesi = (await bacaSesi()).find((s) => s.peran === "tenant");
  const isiAwal = sesi ? keCalon(kuesioner("tenant"), sesi.jawaban) : {};
  // Lokasi yang ditandai hanya diteruskan dari sesi tanpa akun; akun tenant menyatakan minat langsung dari rekomendasinya.
  const ditandai = sesi && !sesi.akun ? sesi.diminati : [];
  if (Object.keys(isiAwal).length === 0 && ditandai.length === 0) return <FormCalon aksi={daftarPublik} />;
  return (
    <>
      {ditandai.length > 0 && (
        <section aria-labelledby="judul-ditandai" className="mb-6 rounded-lg border border-line bg-canvas p-4">
          <h2 id="judul-ditandai" className="text-sm font-bold text-ink">
            Lokasi yang Anda tandai ({ditandai.length})
          </h2>
          <ul className="angka mt-2 flex flex-wrap gap-1.5 text-sm">
            {ditandai.map((d) => (
              <li key={d.lahan_id} className="rounded-md border border-line bg-white px-2.5 py-1 text-ink">
                SPBU {d.spbu_nomor} · ruang {d.kode}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            Saat formulir dikirim, lokasi ini diteruskan ke tim Non Fuel Retail Pertamina sebagai minat Anda. Minat tidak mengikat dan belum menjadi penawaran.
          </p>
        </section>
      )}
      {Object.keys(isiAwal).length > 0 && (
        <p className="mb-6 rounded-lg bg-brand-blue-soft px-3.5 py-2.5 text-sm leading-relaxed text-brand-blue-strong">
          Sebagian kebutuhan lokasi sudah kami isi dari jawaban Anda di Temukan peluang. Periksa lagi sebelum mengirim.
        </p>
      )}
      <FormCalon key="dari-temukan" aksi={daftarPublik} isiAwal={isiAwal} />
    </>
  );
}

/** Formulir publik untuk calon tenant. Tidak butuh login. */
export default function HalamanDaftar() {
  return (
    <main className="px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <GarisMerek className="rounded-none" />
        <div className="p-6 sm:p-10">
          <Merek />
          <h1 className="mt-8 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
            Jadi Bright Partner
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            Ceritakan usaha dan kebutuhan lokasi Anda. Setelah mengirim, Anda langsung melihat ruang usaha kosong di
            SPBU Pertamina yang paling cocok.{" "}
            <span lang="en" className="text-subtle">
              Tell us about your business and see matching retail spaces at Pertamina fuel stations.
            </span>
          </p>
          <div className="mt-8">
            {supabaseSiap ? (
              <Suspense fallback={<FormCalon aksi={daftarPublik} />}>
                <FormDariTemukan />
              </Suspense>
            ) : (
              <PanelGalat galat={{ jenis: "belum-terhubung" }} />
            )}
          </div>
        </div>
      </div>
      <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-relaxed text-subtle">
        Data yang Anda kirim hanya dipakai tim Non Fuel Retail Pertamina untuk menghubungi Anda tentang ruang usaha di
        SPBU.
      </p>
    </main>
  );
}
