import type { Metadata } from "next";
import { Suspense } from "react";
import { FormJelajah } from "@/components/jelajah";
import PanelGalat from "@/components/panel-galat";
import { FormAnggota, FormOrganisasi, TombolKeluarkan } from "@/components/portal";
import { Lencana } from "@/components/tabel";
import { JudulHalaman, Rangka } from "@/components/ui";
import { getPilihanJelajah } from "@/lib/data-jelajah";
import { getOrganisasi } from "@/lib/data-portal";
import { getProfilSaya } from "@/lib/data-validasi";
import { n } from "@/lib/format";
import { PERAN } from "@/lib/validasi";

export const metadata: Metadata = { title: "Organisasi dan anggota" };

// Pola halaman: Settings / Configuration. Siapa boleh masuk ke ruang kerja mana, dan sebagai apa.
export default function HalamanOrganisasi() {
  return (
    <>
      <JudulHalaman
        label="Pengaturan"
        judul="Organisasi dan anggota"
        keterangan="Setiap akun melihat data lewat organisasinya: tim NFR, tenant, atau pemilik SPBU. Akun tanpa organisasi tidak melihat apa pun."
      />
      <Suspense fallback={<Rangka baris={5} />}>
        <Isi />
      </Suspense>
    </>
  );
}

const JENIS: Record<string, string> = { nfr: "Tim NFR", tenant: "Tenant", dealer: "Dealer" };

async function Isi() {
  const [hasil, profil, hasilPilihan] = await Promise.all([getOrganisasi(), getProfilSaya(), getPilihanJelajah()]);
  const pilihanJelajah = hasilPilihan.data ?? [];
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  const daftar = hasil.data ?? [];
  const admin = profil.data?.peran_nfr === "nfr_admin";
  const saya = profil.data?.email ?? "";

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-10">
      <section>
        <h2 className="text-lg font-bold text-ink">Organisasi</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {admin
            ? "Keluarkan anggota yang tidak lagi berwenang. Peran berlaku setelah orang itu masuk ulang."
            : "Hanya admin NFR yang bisa mengubah organisasi dan anggota. Anda bisa melihat daftarnya."}
        </p>
        <ul className="mt-4 grid gap-4">
          {daftar.map((o) => (
            <li key={o.id} className="rounded-xl border border-line bg-white shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <h3 className="text-base font-bold text-ink">{o.nama}</h3>
                <span className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                  <Lencana warna={o.jenis === "nfr" ? "biru" : "netral"}>{JENIS[o.jenis]}</Lencana>
                  {o.demo && <Lencana warna="kuning">Organisasi uji</Lencana>}
                  {o.jenis === "tenant" && <span>{n(o.peluang)} penawaran dibagikan</span>}
                </span>
              </div>
              <ul className="divide-y divide-line border-t border-line text-sm">
                {o.anggota.length === 0 && <li className="px-4 py-3 text-subtle">Belum ada anggota. Hubungkan akun lewat formulir di bawah.</li>}
                {o.anggota.map((a) => (
                  <li key={a.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{a.email}</span>
                      <span className="text-xs text-muted">{PERAN[a.peran] ?? a.peran}</span>
                    </span>
                    {admin && a.email !== saya && <TombolKeluarkan email={a.email} organisasi={o.id} nama={o.nama} />}
                  </li>
                ))}
              </ul>
              {o.jenis === "tenant" && (
                <div className="border-t border-line px-4 py-3 text-sm">
                  <p className="leading-relaxed text-muted">
                    <span className="font-semibold text-ink">Penjelajah lokasi:</span>{" "}
                    {(o.jelajah ?? []).length === 0 ? "belum dibuka. Organisasi ini hanya melihat penawaran yang dibagikan kepadanya." : `dibuka untuk ${o.jelajah.join(", ")}.`}
                  </p>
                  {admin && (
                    <details className="mt-1">
                      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-blue-strong">Atur wilayah penjelajah</summary>
                      <div className="pt-1 pb-2">
                        <FormJelajah key={(o.jelajah ?? []).join("|")} organisasiId={o.id} terbuka={o.jelajah ?? []} pilihan={pilihanJelajah} />
                      </div>
                    </details>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {admin && (
        <>
          <section>
            <h2 className="text-lg font-bold text-ink">Hubungkan akun ke organisasi</h2>
            <p className="mt-1 mb-4 text-sm leading-relaxed text-muted">Mengisi lagi email yang sudah menjadi anggota akan mengganti perannya.</p>
            <div className="rounded-xl border border-line bg-white p-4 shadow-card">
              <FormAnggota organisasi={daftar.map((o) => ({ id: o.id, nama: o.nama, jenis: o.jenis }))} />
            </div>
          </section>
          <section>
            <h2 className="text-lg font-bold text-ink">Buat organisasi baru</h2>
            <p className="mt-1 mb-4 text-sm leading-relaxed text-muted">Untuk tenant atau pemilik SPBU yang akan diberi akses ke portalnya.</p>
            <div className="rounded-xl border border-line bg-white p-4 shadow-card">
              <FormOrganisasi />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
