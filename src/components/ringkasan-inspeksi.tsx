import Galeri from "@/components/galeri";
import { daya, luas } from "@/lib/format";
import { labelPilihan, type RincianInspeksi } from "@/lib/status-lahan";

/** Jawaban inspeksi berdampingan dengan data Brightspace, lalu foto bukti. */
export default function RingkasanInspeksi({ i }: { i: RincianInspeksi }) {
  const isi = i.isi;
  const selisih = (a: number | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) > 0.5;
  const banding = [
    {
      nama: "Luas",
      inspeksi: isi.luas_m2 != null ? luas(isi.luas_m2) : "Belum diisi",
      sumber: luas(i.lahan?.luas_m2),
      beda: selisih(isi.luas_m2, i.lahan?.luas_m2),
    },
    {
      nama: "Daya listrik",
      inspeksi: isi.daya_w != null ? daya(isi.daya_w) : "Belum diisi",
      sumber: daya(i.lahan?.daya_w),
      beda: selisih(isi.daya_w, i.lahan?.daya_w),
    },
    {
      nama: "Panjang × lebar",
      inspeksi: isi.panjang_m != null && isi.lebar_m != null ? `${String(isi.panjang_m).replace(".", ",")} × ${String(isi.lebar_m).replace(".", ",")} m` : "Tidak diukur",
      sumber:
        i.lahan?.panjang_m != null && i.lahan?.lebar_m != null
          ? `${String(i.lahan.panjang_m).replace(".", ",")} × ${String(i.lahan.lebar_m).replace(".", ",")} m`
          : "–",
      beda: false,
    },
  ];
  const lain: [string, string][] = [
    ["Air bersih", labelPilihan("air", isi.air)],
    ["Akses kendaraan", labelPilihan("akses", isi.akses)],
    ["Parkir pelanggan", labelPilihan("parkir", isi.parkir)],
    ["Pembatasan keselamatan", isi.pembatasan === "ada" ? (isi.pembatasan_rinci ?? "Ada") : labelPilihan("pembatasan", isi.pembatasan)],
    ["Yang sudah ada di lahan", isi.infrastruktur ?? "Tidak diisi"],
    ["Pekerjaan yang masih diperlukan", isi.perubahan ?? "Tidak diisi"],
    ["Catatan inspeksi", isi.catatan ?? "Tidak diisi"],
    ["Kesimpulan pemeriksa", labelPilihan("hasil", i.hasil)],
  ];

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-8">
      <section>
        <h2 className="text-lg font-bold text-ink">Ukuran dan listrik</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white shadow-card">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-subtle uppercase">
                <th scope="col" className="px-4 py-3">
                  Butir
                </th>
                <th scope="col" className="px-4 py-3">
                  Hasil inspeksi
                </th>
                <th scope="col" className="px-4 py-3">
                  Brightspace
                </th>
              </tr>
            </thead>
            <tbody>
              {banding.map((b) => (
                <tr key={b.nama} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                    {b.nama}
                  </th>
                  <td className="angka px-4 py-3 font-semibold text-ink">
                    {b.inspeksi}
                    {b.beda && <span className="ml-2 text-xs font-semibold text-warn">berbeda dari sumber</span>}
                  </td>
                  <td className="angka px-4 py-3 text-muted">{b.sumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Kondisi lahan</h2>
        <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
          {lain.map(([nama, nilai]) => (
            <div key={nama} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-muted">{nama}</dt>
              <dd className="text-ink">{nilai}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Foto bukti</h2>
        {i.foto.length > 0 ? (
          <div className="mt-3">
            <Galeri gambar={i.foto} subjek={`inspeksi lahan ${i.lahan_kode}`} maks={8} kisi="grid-cols-2 sm:grid-cols-4" />
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-line bg-white px-4 py-6 text-sm text-subtle shadow-card">Belum ada foto bukti.</p>
        )}
      </section>

      {i.kurang.length > 0 && i.status !== "diterima" && (
        <p className="text-sm text-muted">Butir wajib yang belum terisi: {i.kurang.join(", ")}.</p>
      )}
    </div>
  );
}
