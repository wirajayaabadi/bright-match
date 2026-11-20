import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import HasilKosong from "@/components/temukan/hasil-kosong";
import HasilLokasi from "@/components/temukan/hasil-lokasi";
import HasilSpbu from "@/components/temukan/hasil-spbu";
import KepalaTemukan from "@/components/temukan/kepala";
import Segar from "@/components/temukan/segar";
import TombolAkun from "@/components/temukan/tombol-akun";
import { Rangka } from "@/components/ui";
import { getRuang } from "@/lib/data";
import { intiLengkap } from "@/lib/temukan/cabang";
import { catatRekomendasiDibuat, getJumlahLokasi, getLokasi, getMinatSaya, getPeluangSpbu, getUmpanSaya } from "@/lib/temukan/data-rekomendasi";
import { adalahPeran, kuesioner } from "@/lib/temukan/kuesioner";
import { pelonggaran, profilLokasi } from "@/lib/temukan/rekomendasi";
import { permintaanSpbu } from "@/lib/temukan/rekomendasi-spbu";
import { ringkasan } from "@/lib/temukan/ringkas";
import { bacaSesi } from "@/lib/temukan/sesi";
import type { Jawaban, Kuesioner, Peran } from "@/lib/temukan/tipe";

export const metadata: Metadata = { title: "Rekomendasi untuk Anda" };

type Props = PageProps<"/temukan/[peran]/hasil">;

const JUDUL: Record<Peran, { judul: string; keterangan: string }> = {
  tenant: {
    judul: "Lokasi yang sesuai untuk bisnis Anda",
    keterangan: "Rekomendasi berdasarkan preferensi bisnis, karakteristik lokasi, dan data yang tersedia.",
  },
  dealer: {
    judul: "Peluang bisnis untuk SPBU Anda",
    keterangan: "Jenis usaha dan calon tenant yang cocok untuk ruang yang Anda pilih, berdasarkan pola di jaringan SPBU.",
  },
};

/**
 * Halaman hasil Temukan peluang. Tenant: daftar lokasi (pola Daftar). Pengelola SPBU: rincian satu SPBU
 * per ruang (pola Rincian). Selalu dihitung dari sesi yang sudah dibersihkan, tidak dari alamat.
 */
export default function HalamanHasil({ params }: Props) {
  return (
    <div className="flex min-h-svh flex-col">
      <KepalaTemukan>
        <Suspense fallback={<span className="h-11 w-20" />}>
          <TombolAkunHasil params={params} />
        </Suspense>
      </KepalaTemukan>
      <main id="konten" className="flex-1 px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <Suspense
            fallback={
              <div role="status" aria-label="Menyusun rekomendasi">
                <div className="mb-8 h-24 animate-pulse rounded-xl bg-line/60" />
                <Rangka baris={4} />
              </div>
            }
          >
            <Isi params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function TombolAkunHasil({ params }: Pick<Props, "params">) {
  const { peran } = await params;
  return <TombolAkun lanjut={adalahPeran(peran) ? `/temukan/${peran}/hasil` : undefined} />;
}

/** Ringkasan preferensi sebagai cip yang bisa diubah: tiap cip membuka pertanyaannya di wizard. */
function CipPreferensi({ peran, k, jawaban }: { peran: Peran; k: Kuesioner; jawaban: Jawaban }) {
  const butir = ringkasan(k, jawaban).filter((b) => b.butir.length > 0);
  return (
    <section aria-label="Preferensi Anda" className="mt-6 rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 className="text-sm font-bold text-ink">Preferensi Anda</h2>
        <Link href={`/temukan/${peran}?langkah=ringkasan`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-blue-strong hover:bg-brand-blue-soft">
          <Pencil aria-hidden="true" className="size-4" />
          Ubah preferensi
        </Link>
      </div>
      <ul className="mt-1 flex flex-wrap gap-2">
        {butir.map((b, i) => (
          <li key={b.id} className={`max-w-full min-w-0 ${i >= 3 ? "max-sm:hidden" : ""}`}>
            <Link
              href={`/temukan/${peran}?langkah=${b.id}&ubah=1`}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 text-sm text-ink transition-colors duration-150 hover:border-brand-blue/60"
            >
              <span className="sr-only">Ubah </span>
              <span className="shrink-0 font-semibold">{b.ringkas}:</span>
              <span className="min-w-0 truncate">{b.butir.length > 2 ? `${b.butir.slice(0, 2).join(", ")}, +${b.butir.length - 2}` : b.butir.join(", ")}</span>
            </Link>
          </li>
        ))}
        {butir.length > 3 && (
          // Di layar sempit tujuh cip memenuhi satu layar penuh sebelum rekomendasi terlihat; sisanya ada di ringkasan.
          <li className="sm:hidden">
            <Link
              href={`/temukan/${peran}?langkah=ringkasan`}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-brand-blue-strong"
            >
              +{butir.length - 3} lainnya
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

function TidakBisa({ peran, judul, isi }: { peran: Peran; judul: string; isi: string }) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold text-ink">{judul}</h2>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{isi}</p>
      <Link href={`/temukan/${peran}?langkah=ringkasan`} className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white hover:bg-brand-blue-strong">
        Kembali ke preferensi
      </Link>
    </section>
  );
}

async function Isi({ params }: Pick<Props, "params">) {
  const { peran } = await params;
  if (!adalahPeran(peran)) notFound();
  const k = kuesioner(peran);
  const [sesiSemua, ruangAkun] = await Promise.all([bacaSesi(), getRuang()]);
  // Minat yang sudah tercatat hanya ada untuk akun tenant atau pengelola SPBU.
  const minatSaya = ruangAkun === "tenant" || ruangAkun === "dealer" ? await getMinatSaya() : [];
  const sesi = sesiSemua.find((s) => s.peran === peran);
  // Rekomendasi butuh semua pertanyaan inti. Sengaja tidak memakai redirect(): peramban mengingat pengalihan
  // per alamat, sehingga tautan ke halaman ini terpental lagi ke kuesioner walau jawabannya sudah lengkap.
  if (!sesi || !intiLengkap(k, sesi.jawaban)) {
    return (
      <>
        <header>
          <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Temukan peluang</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">{JUDUL[peran].judul}</h1>
        </header>
        <section className="mt-6 max-w-3xl rounded-xl border border-line bg-white p-6 shadow-card">
          <h2 className="text-lg font-bold text-ink">{sesi ? "Masih ada pertanyaan inti yang belum dijawab" : "Ceritakan dulu kebutuhan Anda"}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Rekomendasi disusun dari jawaban Anda atas lima pertanyaan inti.{" "}
            {sesi ? "Jawaban yang sudah Anda isi tetap tersimpan; lanjutkan dari pertanyaan yang belum dijawab." : "Jawabannya bisa diubah kapan saja."}
          </p>
          <Link href={`/temukan/${peran}`} className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-brand-blue px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong">
            {sesi ? "Lanjutkan menjawab" : "Jawab pertanyaan"}
          </Link>
        </section>
      </>
    );
  }
  const jawaban = sesi.jawaban;

  const kepala = (
    <>
      <header>
        <p className="text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Temukan peluang</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">{JUDUL[peran].judul}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{JUDUL[peran].keterangan}</p>
      </header>
      <CipPreferensi peran={peran} k={k} jawaban={jawaban} />
    </>
  );

  if (peran === "tenant") {
    const profil = profilLokasi(jawaban);
    const hasil = profil ? await getLokasi(profil) : null;
    if (!profil || !hasil) {
      return (
        <>
          {kepala}
          <TidakBisa peran={peran} judul="Rekomendasi belum bisa disusun" isi="Ada gangguan saat menghitung. Preferensi Anda tetap tersimpan; coba buka halaman ini lagi sebentar lagi." />
        </>
      );
    }
    // Analitik: rekomendasi disusun, dengan jumlah hasilnya (dasar angka "tanpa hasil"). Kegagalannya tidak menggagalkan halaman.
    const [umpanSaya] = await Promise.all([
      getUmpanSaya("tenant"),
      catatRekomendasiDibuat("tenant", { jumlah: hasil.jumlah, jumlah_lain: hasil.jumlah_lain, tertahan: hasil.tertahan, kosong: hasil.jumlah + hasil.jumlah_lain === 0 }).catch(() => {}),
    ]);
    if (hasil.jumlah + hasil.jumlah_lain === 0) {
      const pilihan = pelonggaran(profil);
      const jumlah = await Promise.all(pilihan.map((p) => getJumlahLokasi(p.profil)));
      return (
        <>
          {kepala}
          <div className="mt-6">
            <HasilKosong longgar={pilihan.map((p, i) => ({ kunci: p.kunci, nama: p.nama, ubah: p.ubah, jumlah: jumlah[i] }))} tertahan={hasil.tertahan} />
          </div>
        </>
      );
    }
    return (
      <>
        {kepala}
        <div className="mt-6">
          <Segar>
            <HasilLokasi
              hasil={hasil}
              jawaban={jawaban}
              // Akun tenant menyatakan minat resmi; pengunjung tanpa akun menandai lalu mendaftar; akun lain hanya melihat.
              mode={ruangAkun === "tenant" ? "tenant" : ruangAkun === null ? "tamu" : "lain"}
              minatAwal={Object.fromEntries(minatSaya.filter((m) => m.segmen === null).map((m) => [m.lahan_id, m.dibuat]))}
              diminatiAwal={ruangAkun === null ? sesi.diminati : []}
              preferensiRingkas={ringkasan(k, jawaban)
                .filter((b) => b.butir.length > 0)
                .map((b) => `${b.ringkas}: ${b.butir.join(", ")}`)}
              umpanAwal={Object.fromEntries(umpanSaya.map((u) => [u.lahan_id, { nilai: u.nilai, alasan: u.alasan }]))}
            />
          </Segar>
        </div>
      </>
    );
  }

  const minta = permintaanSpbu(jawaban);
  if (!minta) {
    return (
      <>
        {kepala}
        <TidakBisa
          peran={peran}
          judul="SPBU Anda belum terdaftar di Bright Match"
          isi="Rekomendasi dihitung dari data ruang dan lingkungan SPBU. Permintaan penambahan SPBU Anda sudah tercatat di preferensi; setelah diperiksa tim Non Fuel Retail dan datanya masuk, rekomendasinya bisa disusun."
        />
      </>
    );
  }
  const peluang = await getPeluangSpbu(minta.spbuId, minta.lahanIds);
  const [umpanSpbu] = await Promise.all([
    getUmpanSaya("dealer"),
    peluang ? catatRekomendasiDibuat("dealer", { jumlah: peluang.ruang.length, kosong: peluang.ruang.length === 0 }).catch(() => {}) : null,
  ]);
  if (!peluang) {
    return (
      <>
        {kepala}
        <TidakBisa peran={peran} judul="Rekomendasi belum bisa disusun" isi="SPBU ini tidak ditemukan lagi di data terbaru, atau ada gangguan saat menghitung. Periksa pilihan SPBU Anda, lalu coba lagi." />
      </>
    );
  }
  return (
    <>
      {kepala}
      <div className="mt-6">
        <HasilSpbu
          hasil={peluang}
          jawaban={jawaban}
          sudahMasuk={ruangAkun !== null}
          minat={minatSaya.filter((m) => m.segmen !== null).map((m) => `${m.lahan_id}|${m.segmen}`)}
          umpanAwal={Object.fromEntries(umpanSpbu.map((u) => [`${u.lahan_id}|${u.segmen ?? ""}`, { nilai: u.nilai, alasan: u.alasan }]))}
        />
      </div>
    </>
  );
}
