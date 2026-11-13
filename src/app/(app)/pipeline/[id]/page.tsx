import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setSyarat } from "@/app/aksi";
import { CatatanPeluang, KendaliTahap } from "@/components/kendali-peluang";
import PanelGalat from "@/components/panel-galat";
import { Bagian, Jejak, Lencana, tautan } from "@/components/tabel";
import { JudulHalaman, KartuAngka, Rangka, TidakDitemukan } from "@/components/ui";
import { getPeluang, type Syarat } from "@/lib/data-tahap3";
import { alamat, daya, luas, n, rp, tanggal } from "@/lib/format";
import { KANAL, namaTahap, PIHAK, UUID } from "@/lib/istilah";

export const metadata: Metadata = { title: "Peluang" };

type Props = PageProps<"/pipeline/[id]">;

export default function HalamanPeluang({ params }: Props) {
  return (
    <Suspense fallback={<Rangka baris={8} />}>
      <Isi params={params} />
    </Suspense>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) return <TidakDitemukan apa="Peluang ini" />;
  const hasil = await getPeluang(id);
  if (hasil.galat) return <PanelGalat galat={hasil.galat} />;
  if (!hasil.data) return <TidakDitemukan apa="Peluang ini" />;

  const { peluang: p, calon, tenant, lahan, syarat, riwayat } = hasil.data;
  const namaPihak = calon?.nama_usaha ?? p.tenant_nama ?? "Pihak tidak tercatat";
  const terpenuhi = syarat.filter((s) => s.terpenuhi).length;
  const kartu = alamat(`/penawaran/${p.lahan_id}`, { calon: p.calon_id ?? undefined, tenant: tenant?.id });

  return (
    <>
      <Jejak induk={[{ href: "/pipeline", nama: "Pipeline" }]} kini={`${namaPihak} · ${p.lahan_kode}`} />
      <JudulHalaman
        label={`Peluang · ${namaTahap(p.tahap)}`}
        judul={`${namaPihak} di lahan ${p.lahan_kode}`}
        keterangan={`SPBU ${p.spbu_nomor}, ${[p.kota, p.provinsi].filter(Boolean).join(", ")}. Dibuat ${tanggal(p.dibuat)}${p.pemilik ? ` oleh ${p.pemilik}` : ""}.`}
      />

      <div className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href={kartu} className={tautan}>
          Kartu penawaran
        </Link>
        <Link href={`/kecocokan/lahan/${p.lahan_id}`} className={tautan}>
          Kartu rekomendasi lahan
        </Link>
        <Link href={`/lokasi/${p.spbu_id}`} className={tautan}>
          Profil SPBU
        </Link>
        {calon && (
          <Link href={`/pipeline/calon/${calon.id}`} className={tautan}>
            Profil calon tenant
          </Link>
        )}
        {tenant && (
          <Link href={`/tenant/${tenant.id}`} className={tautan}>
            Profil tenant
          </Link>
        )}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KartuAngka label="Skor kecocokan" nilai={p.skor != null ? String(p.skor) : "–"} catatan="Saat peluang dibuat" />
        <KartuAngka label="Persyaratan" nilai={`${n(terpenuhi)} dari ${n(syarat.length)}`} catatan="Semua harus terpenuhi sebelum kontrak" />
        <KartuAngka
          label="Tarif lahan per tahun"
          nilai={lahan?.tarif_tahunan != null ? rp(lahan.tarif_tahunan) : "–"}
          catatan={lahan ? `${luas(lahan.luas_m2)} · ${lahan.posisi ?? "–"} · ${daya(lahan.daya_w)}` : "Lahan tidak lagi ada di data"}
        />
        <KartuAngka
          label="Status lahan di data"
          nilai={lahan ? (lahan.status === "Tersedia" ? "Kosong" : "Tersewa") : "–"}
          catatan={lahan && lahan.status !== "Tersedia" ? "Lahan ini sudah tidak kosong di data terbaru" : undefined}
        />
      </dl>

      <Bagian judul="Tahap" keterangan="Klik sebuah tahap untuk memindahkan peluang. Perpindahan tercatat di riwayat.">
        <KendaliTahap id={p.id} tahap={p.tahap} />
      </Bagian>

      <Bagian
        judul="Persyaratan tiap pihak"
        keterangan="Centang butir yang sudah terpenuhi. Peluang baru bisa masuk tahap kontrak setelah semuanya tercentang."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {(["tenant", "spbu", "pertamina"] as const).map((pihak) => (
            <DaftarSyarat key={pihak} judul={PIHAK[pihak]} butir={syarat.filter((s) => s.pihak === pihak)} />
          ))}
        </div>
      </Bagian>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Bagian judul="Catatan">
          <div className="rounded-xl border border-line bg-white p-4 shadow-card">
            <CatatanPeluang id={p.id} catatan={p.catatan} />
          </div>
        </Bagian>

        <Bagian judul={calon ? "Calon tenant" : "Tenant"}>
          <dl className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
            <Butir nama="Nama" nilai={namaPihak} />
            <Butir nama="Jenis usaha" nilai={p.segmen ?? "–"} />
            {calon && <Butir nama="Kontak" nilai={[calon.kontak_nama, calon.kontak_email, calon.kontak_telepon].filter(Boolean).join(" · ")} />}
            {calon && <Butir nama="Kanal" nilai={KANAL[calon.kanal] ?? calon.kanal} />}
            {calon && <Butir nama="Anggaran sewa" nilai={calon.anggaran_tahunan != null ? `${rp(calon.anggaran_tahunan)}/th` : "Tidak disebut"} />}
            {tenant && <Butir nama="Jaringan saat ini" nilai={`${n(tenant.lahan)} lahan di ${n(tenant.spbu)} SPBU`} />}
            {tenant && <Butir nama="Kontak" nilai="Belum ada di data; minta dari tim region" />}
          </dl>
        </Bagian>
      </div>

      <Bagian judul="Riwayat">
        <ol className="divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
          {riwayat.map((r) => (
            <li key={`${r.waktu}-${r.tahap_ke}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
              <span className="text-ink">
                {r.tahap_dari ? `${namaTahap(r.tahap_dari)} → ` : "Peluang dibuat: "}
                <strong>{namaTahap(r.tahap_ke)}</strong>
                {r.catatan && <span className="text-muted"> · {r.catatan}</span>}
              </span>
              <span className="angka text-xs text-subtle">
                {tanggal(r.waktu)}
                {r.oleh ? ` · ${r.oleh}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </Bagian>
    </>
  );
}

function Butir({ nama, nilai }: { nama: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-muted">{nama}</dt>
      <dd className="text-right text-ink">{nilai}</dd>
    </div>
  );
}

/** Butir persyaratan satu pihak. Tiap butir adalah formulir kecil: mengklik kotaknya membalik statusnya. */
function DaftarSyarat({ judul, butir }: { judul: string; butir: Syarat[] }) {
  const selesai = butir.filter((s) => s.terpenuhi).length;
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{judul}</h3>
        <Lencana warna={selesai === butir.length ? "hijau" : "netral"}>
          {selesai} dari {butir.length}
        </Lencana>
      </div>
      <ul className="mt-3 space-y-1">
        {butir.map((s) => (
          <li key={s.id}>
            <form action={setSyarat}>
              <input type="hidden" name="syarat_id" value={s.id} />
              <input type="hidden" name="terpenuhi" value={s.terpenuhi ? "0" : "1"} />
              <button
                type="submit"
                role="checkbox"
                aria-checked={s.terpenuhi}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-canvas"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[11px] leading-none font-bold ${
                    s.terpenuhi ? "border-brand-green-strong bg-brand-green-strong text-white" : "border-subtle bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={s.terpenuhi ? "text-muted" : "text-ink"}>{s.butir}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
