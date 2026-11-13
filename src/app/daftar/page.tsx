import type { Metadata } from "next";
import { daftarPublik } from "@/app/aksi";
import { GarisMerek, Merek } from "@/components/brand";
import FormCalon from "@/components/form-calon";
import PanelGalat from "@/components/panel-galat";
import { supabaseSiap } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Jadi Bright Partner",
  description: "Daftarkan usaha Anda dan lihat ruang usaha di SPBU Pertamina yang cocok.",
};

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
            {supabaseSiap ? <FormCalon aksi={daftarPublik} /> : <PanelGalat galat={{ jenis: "belum-terhubung" }} />}
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
