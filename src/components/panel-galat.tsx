import type { Galat } from "@/lib/data";

const perintah = "rounded-md bg-canvas px-2 py-1 font-mono text-[13px] text-ink";

/** Petunjuk yang tampil bila data belum bisa dibaca. */
export default function PanelGalat({ galat }: { galat: Galat }) {
  if (galat.jenis === "belum-terhubung") {
    return (
      <Panel judul="Supabase belum terhubung">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Salin <code className={perintah}>.env.example</code> menjadi <code className={perintah}>.env.local</code>.
          </li>
          <li>Isi alamat proyek, kunci publik, dan alamat basis data dari dasbor Supabase.</li>
          <li>
            Pasang skema dan muat data: <code className={perintah}>npm run db:setup</code>.
          </li>
          <li>Buat pengguna di menu Authentication, lalu jalankan ulang aplikasi.</li>
        </ol>
        <p className="mt-3">Langkah lengkapnya ada di README.md.</p>
      </Panel>
    );
  }

  if (galat.jenis === "skema-belum-ada") {
    return (
      <Panel judul="Skema basis data belum lengkap">
        <p>
          Aplikasi sudah terhubung ke Supabase, tetapi tabel atau fungsi yang dibutuhkan halaman ini belum ada.
          Jalankan <code className={perintah}>npm run db:schema</code> untuk memasang skema terbaru. Bila basis data
          masih kosong, pakai <code className={perintah}>npm run db:setup</code> agar datanya ikut dimuat.
        </p>
      </Panel>
    );
  }

  return (
    <Panel judul="Data tidak bisa dibaca">
      <p>Supabase menjawab dengan galat berikut.</p>
      <p className={`mt-2 ${perintah} block`}>{galat.pesan}</p>
    </Panel>
  );
}

function Panel({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section role="status" className="rounded-xl border border-line bg-white p-6 shadow-card">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-warn" />
        <h2 className="text-base font-bold text-ink">{judul}</h2>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
