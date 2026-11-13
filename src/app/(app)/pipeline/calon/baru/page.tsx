import type { Metadata } from "next";
import { simpanCalon } from "@/app/aksi";
import FormCalon from "@/components/form-calon";
import { Jejak } from "@/components/tabel";
import { JudulHalaman } from "@/components/ui";

export const metadata: Metadata = { title: "Tambah calon tenant" };

export default function CalonBaru() {
  return (
    <>
      <Jejak
        induk={[
          { href: "/pipeline", nama: "Pipeline" },
          { href: "/pipeline/calon", nama: "Calon tenant" },
        ]}
        kini="Tambah"
      />
      <JudulHalaman
        label="Calon tenant"
        judul="Tambah calon tenant"
        keterangan="Untuk calon yang didapat dari kanal selain formulir publik: waralaba, UMKM binaan, broker, atau pameran. Setelah disimpan, lahan yang cocok langsung ditampilkan."
      />
      <div className="max-w-3xl rounded-xl border border-line bg-white p-6 shadow-card">
        <FormCalon aksi={simpanCalon} internal />
      </div>
    </>
  );
}
