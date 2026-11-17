"use client";

import { useActionState, useRef, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { batalkanSurvei, batalkanSurveiTenant, jadwalkanSurvei, ketahuiSurvei, mintaSurvei, selesaikanSurvei } from "@/app/aksi-survei";
import { Lencana } from "@/components/tabel";
import { luas, tanggal } from "@/lib/format";
import { berjalan, hariTanggal, jam, JAM_AWAL, STATUS_SURVEI, type Survei, type SurveiDealer, type SurveiTenant, WAKTU, type WaktuUsulan } from "@/lib/survei";

const tombolUtama =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60";
const tombolKedua =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle disabled:opacity-60";
const tombolBatal =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-brand-red-strong hover:border-brand-red-strong";
const tombolBahaya =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-red-strong px-4 text-sm font-semibold text-white hover:bg-brand-red disabled:opacity-60";
const kolom = "mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3.5 text-base font-normal text-ink focus:border-brand-blue";
const area = "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-base font-normal text-ink focus:border-brand-blue";
const label = "block text-sm font-semibold text-ink";
const kartu = "rounded-xl border border-line bg-white p-4 shadow-card sm:p-5";

function Pesan({ status }: { status: StatusAksi }) {
  if (!status) return null;
  return (
    <p
      role={status.ok ? "status" : "alert"}
      className={`rounded-md px-3 py-2 text-sm font-medium ${status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"}`}
    >
      {status.pesan}
    </p>
  );
}

const isi = (status: StatusAksi, k: string) => (status && !status.ok && typeof status.nilai?.[k] === "string" ? (status.nilai[k] as string) : "");

/** Jadwal yang sudah ditetapkan, dalam satu kalimat. */
function KalimatJadwal({ s }: { s: SurveiTenant }) {
  return (
    <p className="text-lg leading-snug font-bold text-ink">
      {hariTanggal(s.jadwal_tanggal)}, pukul <span className="angka">{jam(s.jadwal_jam)}</span>{" "}
      <span className="text-sm font-normal text-muted">waktu setempat di lokasi</span>
    </p>
  );
}

function DaftarUsulan({ s, pakai }: { s: SurveiTenant; pakai?: (tanggal: string, waktu: WaktuUsulan) => void }) {
  if (s.usulan.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-2 text-sm">
      {s.usulan.map((u) => (
        <li key={`${u.tanggal}-${u.waktu}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="text-ink">
            {hariTanggal(u.tanggal)}, {WAKTU[u.waktu]}
          </span>
          {pakai && (
            <button type="button" onClick={() => pakai(u.tanggal, u.waktu)} className={tombolKedua}>
              Pakai waktu ini
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Konfirmasi pembatalan: menyebut apa yang dibatalkan, dengan alasan. */
function DialogBatal({
  aksi,
  id,
  lokasi,
  wajibAlasan,
  keterangan,
}: {
  aksi: (s: StatusAksi, fd: FormData) => Promise<StatusAksi>;
  id: string;
  lokasi: string;
  wajibAlasan: boolean;
  keterangan: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await aksi(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={tombolBatal}>
        Batalkan survei
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="judul-batal-survei"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form action={kirim} key={status?.urut ?? 0} className="p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          <h2 id="judul-batal-survei" className="text-lg font-bold text-ink">
            Batalkan survei di {lokasi}?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{keterangan}</p>
          <label className={`${label} mt-4`}>
            Alasan {wajibAlasan ? "" : <span className="font-normal text-muted">(opsional)</span>}
            <textarea name="alasan" rows={3} maxLength={500} defaultValue={isi(status, "alasan")} className={area} />
          </label>
          {status && !status.ok && (
            <div className="mt-3">
              <Pesan status={status} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => dialog.current?.close()} className={tombolKedua}>
              Kembali
            </button>
            <button type="submit" disabled={menunggu} className={tombolBahaya}>
              {menunggu ? "Membatalkan…" : "Batalkan survei"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function RiwayatSurvei({ daftar, nfr }: { daftar: (SurveiTenant | Survei)[]; nfr: boolean }) {
  if (daftar.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-bold text-ink">Survei sebelumnya</h3>
      <ol className="mt-2 divide-y divide-line rounded-xl border border-line bg-white text-sm shadow-card">
        {daftar.map((s) => (
          <li key={s.id} className="px-4 py-3">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Lencana warna={STATUS_SURVEI[s.status].warna}>{STATUS_SURVEI[s.status].nama}</Lencana>
              <span className="text-ink">
                {s.jadwal_tanggal ? `${hariTanggal(s.jadwal_tanggal)}, pukul ${jam(s.jadwal_jam)}` : "Belum sempat dijadwalkan"}
              </span>
            </p>
            {s.status === "dibatalkan" && (
              <p className="mt-1 leading-relaxed text-muted">
                Dibatalkan {tanggal(s.dibatalkan)} oleh {s.dibatalkan_pihak === "tenant" ? (nfr ? "tenant" : "organisasi Anda") : "tim Non Fuel Retail"}
                {s.alasan_batal ? `: ${s.alasan_batal}` : "."}
              </p>
            )}
            {nfr && "hasil" in s && s.hasil && (
              <p className="mt-1 leading-relaxed text-muted">
                <span className="font-semibold text-ink">Hasil:</span> {s.hasil} <span className="text-subtle">({s.selesai_oleh ?? "–"})</span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ tenant

/** Survei lokasi di halaman penawaran tenant: mengusulkan waktu, melihat jadwal, atau membatalkan. */
export function SurveiTenantPanel({
  peluangId,
  lokasi,
  daftar,
  berakhir,
  besok,
  maks,
}: {
  peluangId: string;
  lokasi: string;
  daftar: SurveiTenant[];
  berakhir: boolean;
  besok: string;
  maks: string;
}) {
  const aktif = berjalan(daftar);
  return (
    <div className="grid gap-4">
      {aktif ? (
        <div className={kartu}>
          <p className="mb-2">
            <Lencana warna={STATUS_SURVEI[aktif.status].warna}>{STATUS_SURVEI[aktif.status].nama}</Lencana>
          </p>
          {aktif.status === "dijadwalkan" ? (
            <>
              <KalimatJadwal s={aktif} />
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Pendamping dari tim Non Fuel Retail: <strong className="text-ink">{aktif.pendamping}</strong>.
                {aktif.catatan_jadwal ? ` ${aktif.catatan_jadwal}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted">
                Usulan waktu Anda sudah terkirim. Jadwal baru pasti setelah ditetapkan tim Non Fuel Retail, dan akan tampil di sini.
              </p>
              <DaftarUsulan s={aktif} />
              {aktif.catatan_tenant && <p className="mt-2 text-sm leading-relaxed text-muted">Catatan Anda: {aktif.catatan_tenant}</p>}
            </>
          )}
          <p className="mt-2 text-xs text-subtle">
            Diminta {tanggal(aktif.diminta)}
            {aktif.diminta_oleh ? ` oleh ${aktif.diminta_oleh}` : " oleh tim Non Fuel Retail"}
          </p>
          <div className="mt-4">
            <DialogBatal
              aksi={batalkanSurveiTenant}
              id={peluangId}
              lokasi={lokasi}
              wajibAlasan={false}
              keterangan="Pembatalan ini tampil di halaman tim Non Fuel Retail. Anda bisa mengusulkan waktu baru setelahnya."
            />
          </div>
        </div>
      ) : berakhir ? (
        <p className="text-sm leading-relaxed text-muted">Penawaran ini sudah berakhir, jadi survei tidak bisa diminta lagi.</p>
      ) : (
        <FormMinta peluangId={peluangId} besok={besok} maks={maks} />
      )}
      <RiwayatSurvei daftar={daftar.filter((s) => s !== aktif)} nfr={false} />
    </div>
  );
}

const URUTAN = ["pertama", "kedua", "ketiga"];

function FormMinta({ peluangId, besok, maks }: { peluangId: string; besok: string; maks: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(mintaSurvei, null);
  return (
    <form action={kirim} key={status?.urut ?? 0} className={`${kartu} grid gap-4`}>
      <input type="hidden" name="id" value={peluangId} />
      <p className="text-sm leading-relaxed text-muted">
        Usulkan sampai tiga waktu yang cocok untuk Anda. Tim Non Fuel Retail memilih salah satunya atau menawarkan waktu lain. Meminta survei tidak
        mengikat.
      </p>
      {[1, 2, 3].map((i) => (
        <fieldset key={i} className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-sm font-bold text-ink">
            Pilihan {URUTAN[i - 1]} {i > 1 && <span className="font-normal text-muted">(opsional)</span>}
          </legend>
          <label className={label}>
            Tanggal
            <input type="date" name={`tanggal${i}`} min={besok} max={maks} defaultValue={isi(status, `tanggal${i}`)} className={kolom} />
          </label>
          <label className={label}>
            Waktu
            <select name={`waktu${i}`} defaultValue={isi(status, `waktu${i}`) || "pagi"} className={kolom}>
              {(Object.keys(WAKTU) as WaktuUsulan[]).map((w) => (
                <option key={w} value={w}>
                  {WAKTU[w][0].toUpperCase() + WAKTU[w].slice(1)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      ))}
      <label className={label}>
        Catatan untuk tim <span className="font-normal text-muted">(opsional)</span>
        <textarea name="catatan" rows={2} maxLength={500} defaultValue={isi(status, "catatan")} className={area} />
        <span className="mt-1 block text-xs font-normal text-subtle">Misalnya berapa orang yang datang atau yang ingin Anda lihat.</span>
      </label>
      <p className="text-xs leading-relaxed text-subtle">Waktu mengikuti jam setempat di lokasi SPBU.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={menunggu} className={tombolUtama}>
          {menunggu ? "Mengirim…" : "Kirim permintaan survei"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ tim NFR

/** Survei lokasi di halaman peluang: menetapkan jadwal, mencatat hasil, atau membatalkan. */
export function SurveiNfrPanel({
  peluangId,
  lokasi,
  daftar,
  ubah,
  berakhir,
  hariIni,
}: {
  peluangId: string;
  lokasi: string;
  daftar: Survei[];
  ubah: boolean;
  berakhir: boolean;
  hariIni: string;
}) {
  const aktif = berjalan(daftar);
  const [tgl, setTgl] = useState(aktif?.jadwal_tanggal ?? "");
  const [pukul, setPukul] = useState(aktif?.jadwal_jam ?? "");
  const terjadwal = aktif?.status === "dijadwalkan";
  const tiba = terjadwal && aktif.jadwal_tanggal != null && aktif.jadwal_tanggal <= hariIni;

  return (
    <div className="grid max-w-3xl gap-5">
      {aktif ? (
        <div className={kartu}>
          <p className="mb-2">
            <Lencana warna={STATUS_SURVEI[aktif.status].warna}>{STATUS_SURVEI[aktif.status].nama}</Lencana>
          </p>
          {terjadwal && (
            <>
              <KalimatJadwal s={aktif} />
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Pendamping: <strong className="text-ink">{aktif.pendamping}</strong>. Ditetapkan {tanggal(aktif.dijadwalkan)} oleh {aktif.dijadwalkan_oleh ?? "–"}.
                {aktif.catatan_jadwal ? ` Catatan untuk tenant: ${aktif.catatan_jadwal}` : ""}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {aktif.diketahui_dealer
                  ? `Pengelola SPBU menandai sudah tahu jadwal ini pada ${tanggal(aktif.diketahui_dealer)} (${aktif.diketahui_oleh ?? "–"}).`
                  : aktif.dealer_terhubung
                    ? "Jadwal ini tampil di portal pengelola SPBU, tetapi belum ditandai sudah tahu."
                    : "SPBU ini belum ditautkan ke organisasi pengelola, jadi jadwal ini tidak tampil di portal pengelola. Kabari pengelola lewat jalur biasa."}
              </p>
            </>
          )}
          {aktif.usulan.length > 0 ? (
            <div className={terjadwal ? "mt-4 border-t border-line pt-4" : ""}>
              <h3 className="text-sm font-bold text-ink">Usulan waktu dari tenant</h3>
              <DaftarUsulan
                s={aktif}
                pakai={
                  ubah && !berakhir
                    ? (t, w) => {
                        setTgl(t);
                        setPukul(JAM_AWAL[w]);
                      }
                    : undefined
                }
              />
              {aktif.catatan_tenant && <p className="mt-2 text-sm leading-relaxed text-muted">Catatan tenant: {aktif.catatan_tenant}</p>}
              <p className="mt-2 text-xs text-subtle">
                Diminta {tanggal(aktif.diminta)} oleh {aktif.diminta_oleh ?? "–"}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-subtle">Dijadwalkan tim NFR tanpa permintaan dari tenant.</p>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          {berakhir
            ? "Peluang ini sudah berakhir, jadi tidak ada survei yang dijadwalkan."
            : "Belum ada survei yang berjalan. Tenant bisa mengusulkan waktu dari portalnya setelah penawaran dibagikan, atau Anda menjadwalkannya langsung di bawah."}
        </p>
      )}

      {ubah && !berakhir && (
        <FormJadwal
          peluangId={peluangId}
          aktif={aktif}
          tgl={tgl}
          setTgl={setTgl}
          pukul={pukul}
          setPukul={setPukul}
          hariIni={hariIni}
        />
      )}

      {ubah && terjadwal && (tiba ? <FormSelesai id={aktif.id} /> : <p className="text-sm leading-relaxed text-muted">Hasil survei bisa dicatat mulai {hariTanggal(aktif.jadwal_tanggal)}.</p>)}

      {ubah && aktif && (
        <div>
          <DialogBatal
            aksi={batalkanSurvei}
            id={aktif.id}
            lokasi={lokasi}
            wajibAlasan
            keterangan="Alasan ini terlihat oleh tenant di portalnya. Tenant bisa mengusulkan waktu baru setelahnya."
          />
        </div>
      )}

      <RiwayatSurvei daftar={daftar.filter((s) => s !== aktif)} nfr />
    </div>
  );
}

function FormJadwal({
  peluangId,
  aktif,
  tgl,
  setTgl,
  pukul,
  setPukul,
  hariIni,
}: {
  peluangId: string;
  aktif: Survei | null;
  tgl: string;
  setTgl: (v: string) => void;
  pukul: string;
  setPukul: (v: string) => void;
  hariIni: string;
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(jadwalkanSurvei, null);
  const ubahJadwal = aktif?.status === "dijadwalkan";
  return (
    <form action={kirim} className={`${kartu} grid gap-4 sm:grid-cols-2`}>
      <input type="hidden" name="id" value={peluangId} />
      <h3 className="text-base font-bold text-ink sm:col-span-2">{ubahJadwal ? "Ubah jadwal" : "Tetapkan jadwal"}</h3>
      <label className={label}>
        Tanggal survei
        <input type="date" name="tanggal" min={hariIni} value={tgl} onChange={(e) => setTgl(e.target.value)} className={kolom} />
      </label>
      <label className={label}>
        Jam <span className="font-normal text-muted">(waktu setempat di lokasi)</span>
        <input type="time" name="jam" value={pukul} onChange={(e) => setPukul(e.target.value)} className={kolom} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Pendamping dari tim NFR
        <input type="text" name="pendamping" maxLength={120} defaultValue={isi(status, "pendamping") || aktif?.pendamping || ""} className={kolom} />
        <span className="mt-1 block text-xs font-normal text-subtle">Nama ini terlihat oleh tenant, supaya ia tahu siapa yang ditemui.</span>
      </label>
      <label className={`${label} sm:col-span-2`}>
        Catatan untuk tenant <span className="font-normal text-muted">(opsional)</span>
        <textarea name="catatan" rows={2} maxLength={500} defaultValue={isi(status, "catatan") || aktif?.catatan_jadwal || ""} className={area} />
        <span className="mt-1 block text-xs font-normal text-subtle">Misalnya titik temu di SPBU.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={menunggu} className={tombolUtama}>
          {menunggu ? "Menyimpan…" : ubahJadwal ? "Ubah jadwal" : "Tetapkan jadwal"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

function FormSelesai({ id }: { id: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(selesaikanSurvei, null);
  return (
    <form action={kirim} key={status?.urut ?? 0} className={`${kartu} grid gap-4`}>
      <input type="hidden" name="id" value={id} />
      <h3 className="text-base font-bold text-ink">Catat hasil survei</h3>
      <label className={label}>
        Hasil survei
        <textarea name="hasil" rows={3} maxLength={2000} defaultValue={isi(status, "hasil")} className={area} />
        <span className="mt-1 block text-xs font-normal text-subtle">Catatan internal tim NFR. Tidak terlihat oleh tenant.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={menunggu} className={tombolUtama}>
          {menunggu ? "Mencatat…" : "Catat survei selesai"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ pengelola SPBU

/** Survei terjadwal di SPBU yang dikelola pengguna. `tampilSpbu` menyebut nomor SPBU di tiap butir (dipakai di ringkasan lintas SPBU). */
export function SurveiDealerDaftar({ daftar, tampilSpbu }: { daftar: SurveiDealer[]; tampilSpbu: boolean }) {
  return (
    <>
      <ul className="grid gap-3">
        {daftar.map((s) => (
          <ButirSurveiDealer key={`${s.id}-${s.diketahui ?? ""}`} s={s} tampilSpbu={tampilSpbu} />
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        Nama calon tenant dan syarat sewanya baru ditampilkan saat usulannya sampai tahap persetujuan. Jam mengikuti waktu setempat di lokasi.
      </p>
    </>
  );
}

function ButirSurveiDealer({ s, tampilSpbu }: { s: SurveiDealer; tampilSpbu: boolean }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(ketahuiSurvei, null);
  return (
    <li className={kartu}>
      <p className="text-base leading-snug font-bold text-ink">
        {hariTanggal(s.jadwal_tanggal)}, pukul <span className="angka">{jam(s.jadwal_jam)}</span>
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Calon tenant {s.segmen ? `usaha ${s.segmen}` : "(jenis usaha belum tercatat)"} melihat ruang <strong className="text-ink">{s.lahan_kode}</strong>
        {s.luas_m2 != null ? ` (${luas(s.luas_m2)}${s.posisi ? `, ${s.posisi === "Diluar Bangunan" ? "di luar bangunan" : "di dalam bangunan"}` : ""})` : ""}
        {tampilSpbu ? ` di SPBU ${s.spbu_nomor}` : ""}. Pendamping dari tim Non Fuel Retail: <strong className="text-ink">{s.pendamping ?? "belum disebut"}</strong>.
      </p>
      {s.diketahui ? (
        <p className="mt-3 text-sm font-semibold text-brand-green-strong">
          Sudah ditandai tahu pada {tanggal(s.diketahui)}
          {s.diketahui_oleh ? ` oleh ${s.diketahui_oleh}` : ""}.
        </p>
      ) : (
        <form action={kirim} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={s.id} />
          <button type="submit" disabled={menunggu} className={tombolUtama}>
            {menunggu ? "Menandai…" : "Tandai sudah tahu"}
          </button>
          <Pesan status={status} />
        </form>
      )}
    </li>
  );
}
