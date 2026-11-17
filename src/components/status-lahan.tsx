import Link from "next/link";
import { DialogTahan, TombolInspeksi } from "@/components/aksi-lahan";
import { getStatusLahan } from "@/lib/data-status";
import { getProfilSaya } from "@/lib/data-validasi";
import { tanggal } from "@/lib/format";
import { KESIAPAN, STATUS_DATA, STATUS_INSPEKSI, STATUS_RUANG } from "@/lib/status-lahan";
import { bolehUbah } from "@/lib/validasi";

/**
 * Tiga status satu lahan yang berdiri sendiri (ketersediaan, verifikasi data, kesiapan), kesimpulan boleh
 * tidaknya lahan ditawarkan resmi, dan tindakannya. `ringkas`: tanpa tindakan, untuk halaman peluang.
 * Tidak merender apa pun bila status belum bisa dibaca (mis. migrasinya belum dipasang).
 */
export default async function StatusLahanPanel({ lahanId, ringkas = false }: { lahanId: string; ringkas?: boolean }) {
  const [hasil, profil] = await Promise.all([getStatusLahan(lahanId), ringkas ? Promise.resolve(null) : getProfilSaya()]);
  const s = hasil.data;
  if (!s) return null;

  const berjalan = s.inspeksi.find((i) => i.status === "draf" || i.status === "diajukan" || i.status === "ditolak");
  const dasar = s.inspeksi.find((i) => i.id === s.inspeksi_id);
  const ubah = !ringkas && bolehUbah(profil?.data);
  const kosong = s.status_sumber === "Tersedia";

  const butir = [
    {
      nama: "Ketersediaan",
      nilai: STATUS_RUANG[s.status_ruang]?.nama ?? s.status_ruang,
      catatan:
        (s.status_ruang === "ditahan" || s.status_ruang === "tidak_tersedia"
          ? `${s.alasan_ruang ?? "Tanpa alasan tercatat"}. Di Brightspace masih kosong.`
          : STATUS_RUANG[s.status_ruang]?.arti) +
        (s.konfirmasi_dealer
          ? ` Pengelola SPBU menyatakan ${s.konfirmasi_dealer === "tersedia" ? "bisa dipakai" : "tidak bisa dipakai"} pada ${tanggal(s.konfirmasi_dealer_waktu)}.`
          : kosong
            ? " Pengelola SPBU belum mengonfirmasi."
            : ""),
    },
    {
      nama: "Verifikasi data",
      nilai: s.verifikasi_usang ? "Perlu diverifikasi ulang" : (STATUS_DATA[s.status_data]?.nama ?? s.status_data),
      catatan: s.verifikasi_usang
        ? "Data lahan di Brightspace berubah sejak terakhir diverifikasi."
        : s.status_data === "terverifikasi"
          ? `Oleh ${s.diverifikasi_oleh ?? "–"} pada ${tanggal(s.diverifikasi)}.`
          : STATUS_DATA[s.status_data]?.arti,
    },
    {
      nama: "Kesiapan",
      nilai: KESIAPAN[s.kesiapan]?.nama ?? s.kesiapan,
      catatan: s.pembatasan && (s.kesiapan === "siap" || s.kesiapan === "belum_siap") ? `Pembatasan: ${s.pembatasan}` : KESIAPAN[s.kesiapan]?.arti,
    },
  ];

  return (
    <section aria-label="Status lahan" className="rounded-xl border border-line bg-white shadow-card">
      <dl className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {butir.map((b) => (
          <div key={b.nama} className="px-4 py-3.5">
            <dt className="text-xs font-semibold tracking-wide text-subtle uppercase">{b.nama}</dt>
            <dd className="mt-1 text-base font-bold text-ink">{b.nilai}</dd>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted">{b.catatan}</dd>
          </div>
        ))}
      </dl>

      {kosong && s.boleh && (
        <p
          className={`border-t border-line px-4 py-3 text-sm leading-relaxed ${
            s.boleh.boleh ? "text-brand-green-strong" : "text-ink"
          }`}
        >
          <strong>{s.boleh.boleh ? "Boleh ditawarkan resmi." : "Belum boleh ditawarkan resmi."}</strong>{" "}
          {s.boleh.boleh ? "Lahan tersedia dan datanya sudah diverifikasi lewat inspeksi lokasi." : s.boleh.alasan}
        </p>
      )}

      {(berjalan || dasar || (ubah && kosong)) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-4 py-3 text-sm">
          {berjalan && (
            <span className="text-muted">
              Inspeksi {STATUS_INSPEKSI[berjalan.status]?.toLowerCase()} oleh {berjalan.pemeriksa_email ?? "–"}.{" "}
              <Link href={`/inspeksi/${berjalan.id}`} className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
                Buka inspeksi
              </Link>
            </span>
          )}
          {!berjalan && dasar && (
            <Link href={`/inspeksi/${dasar.id}`} className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline">
              Lihat inspeksi yang menjadi dasar verifikasi
            </Link>
          )}
          {ubah && kosong && (
            <span className="flex flex-wrap items-center gap-3 sm:ml-auto">
              {!berjalan && s.status_ruang === "tersedia" && (
                <TombolInspeksi
                  lahanId={s.lahan_id}
                  label={s.status_data === "terverifikasi" ? "Inspeksi ulang" : "Mulai inspeksi lokasi"}
                  utama={s.status_data !== "terverifikasi"}
                />
              )}
              <DialogTahan lahanId={s.lahan_id} kode={s.kode} statusRuang={s.status_ruang} />
            </span>
          )}
        </div>
      )}
    </section>
  );
}
