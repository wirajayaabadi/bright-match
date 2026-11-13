import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import PanelGalat from "@/components/panel-galat";
import { kolomSaring, PilihLangsung } from "@/components/saring";
import { BarisKosong, BingkaiTabel, Halaman, tautan, td, tdAngka, th, thKanan } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getDaftarTenant, getWilayah } from "@/lib/data-tahap1";
import { alamat, n, satu, tanggal } from "@/lib/format";

export const metadata: Metadata = { title: "Profil tenant" };

type Props = PageProps<"/tenant">;

export default function DaftarTenant({ searchParams }: Props) {
  return (
    <>
      <JudulHalaman
        label="Modul 3"
        judul="Profil tenant"
        keterangan="Tenant yang sedang menyewa lahan di jaringan SPBU. Profilnya diturunkan dari kontraknya: jenis usaha, sebaran, serta luas dan tarif yang biasa dipakai."
      />
      <Suspense fallback={<Rangka baris={8} />}>
        <Isi searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Isi({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const saring = { q: satu(sp.q), segmen: satu(sp.segmen), provinsi: satu(sp.provinsi) };
  const halaman = Math.max(1, Number(satu(sp.hal)) || 1);

  const [wilayah, daftar] = await Promise.all([
    getWilayah(),
    getDaftarTenant({ cari: saring.q, segmen: saring.segmen, provinsi: saring.provinsi, halaman }),
  ]);
  if (daftar.galat) return <PanelGalat galat={daftar.galat} />;
  const { total, segmen, baris } = daftar.data ?? { total: 0, segmen: [], baris: [] };

  return (
    <>
      <Form action="/tenant" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
          Cari nama tenant
          <input
            type="search"
            name="q"
            defaultValue={saring.q ?? ""}
            key={saring.q ?? ""}
            placeholder="mis. Poci atau Bank Mandiri"
            className={kolomSaring}
          />
        </label>
        <PilihLangsung name="segmen" label="Jenis usaha" nilai={saring.segmen} kosong="Semua jenis usaha" pilihan={segmen} />
        <PilihLangsung
          name="provinsi"
          label="Beroperasi di"
          nilai={saring.provinsi}
          kosong="Semua provinsi"
          pilihan={(wilayah.data ?? []).map((w) => w.provinsi)}
        />
        <button
          type="submit"
          className="min-h-10 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-strong"
        >
          Cari
        </button>
      </Form>

      <BingkaiTabel>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Tenant
            </th>
            <th scope="col" className={th}>
              Jenis usaha utama
            </th>
            <th scope="col" className={thKanan}>
              Lahan
            </th>
            <th scope="col" className={thKanan}>
              SPBU
            </th>
            <th scope="col" className={thKanan}>
              Kota
            </th>
            <th scope="col" className={thKanan}>
              Provinsi
            </th>
            <th scope="col" className={thKanan}>
              Kontrak berakhir berikutnya
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && <BarisKosong kolom={7} pesan="Tidak ada tenant yang sesuai saringan." />}
          {baris.map((t) => (
            <tr key={t.id} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
              <th scope="row" className={`${td} text-left font-normal`}>
                <Link href={`/tenant/${t.id}`} className={tautan}>
                  {t.nama}
                </Link>
              </th>
              <td className={`${td} text-muted`}>{t.segmen_utama}</td>
              <td className={`${tdAngka} text-muted`}>{n(t.lahan)}</td>
              <td className={`${tdAngka} font-semibold text-ink`}>{n(t.spbu)}</td>
              <td className={`${tdAngka} text-muted`}>{n(t.kota)}</td>
              <td className={`${tdAngka} text-muted`}>{n(t.provinsi)}</td>
              <td className={`${tdAngka} text-muted`}>{tanggal(t.kontrak_akhir_berikutnya)}</td>
            </tr>
          ))}
        </tbody>
      </BingkaiTabel>

      <Halaman
        halaman={halaman}
        total={total}
        satuan="tenant"
        href={(h) => alamat("/tenant", { ...saring, hal: h > 1 ? h : undefined })}
      />
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-subtle">
        Nama tenant di file master ditulis tidak seragam. Penulisan yang hanya berbeda huruf besar-kecil dan tanda baca
        sudah digabung; ejaan yang berbeda masih terhitung sebagai tenant terpisah.
      </p>
    </>
  );
}
