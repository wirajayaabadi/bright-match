/**
 * Bentuk kuesioner Temukan peluang (Smart Discovery). Kuesioner adalah data, bukan komponen:
 * pertanyaan, percabangan, dan aturan jawaban ditulis di sini dan di berkas versi (tenant-v1, dealer-v1),
 * lalu dibaca oleh wizard di peramban dan oleh pemeriksa di server dari sumber yang sama.
 * Tanpa ketergantungan pada React atau server, supaya bisa diuji langsung dengan `npm test`.
 */

export type Peran = "tenant" | "dealer";

/**
 * Syarat wajib menyaring kandidat (tidak boleh dilanggar diam-diam); preferensi hanya mengurutkan.
 * Keduanya dibedakan sejak pertanyaan ditulis agar lapisan rekomendasi tidak perlu menebak.
 */
export type Sifat = "syarat" | "preferensi";

/** Kondisi tampil. `id` menunjuk satu pertanyaan ("usaha") atau satu kolom isian ("rinci_fnb.format"). */
export type Syarat =
  | { id: string; sama: string | string[] }
  | { id: string; terisi: true }
  | { semua: Syarat[] }
  | { salah_satu: Syarat[] }
  | { bukan: Syarat };

export type Pilihan = {
  nilai: string;
  nama: string;
  ket?: string;
  /** Nama ikon Lucide; dipetakan ke komponen di src/components/temukan/ikon.tsx. */
  ikon?: string;
  /** Tidak bisa digabung dengan pilihan lain, mis. "Semua segmen" atau "Terbuka untuk rekomendasi". */
  eksklusif?: boolean;
};

type KolomDasar = {
  id: string;
  nama: string;
  bantu?: string;
  sifat: Sifat;
  tampil?: Syarat;
  /** Disembunyikan di balik "Tambah detail teknis" sampai pengguna membukanya. */
  lanjutan?: boolean;
};

export type Kolom =
  | (KolomDasar & { jenis: "angka"; satuan: string; min: number; maks: number; batas_atas?: string })
  | (KolomDasar & { jenis: "pilih"; pilihan: Pilihan[] })
  | (KolomDasar & { jenis: "centang"; pilihan: Pilihan[] })
  | (KolomDasar & { jenis: "teks"; maks: number });

type Dasar = {
  id: string;
  /** Label pendek untuk ringkasan preferensi. */
  ringkas: string;
  judul: string;
  bantu?: string;
  /** Catatan batas: apa arti jawaban ini dan apa yang tidak dijanjikannya. */
  catatan?: string;
  /** Pertanyaan inti harus dijawab sebelum rekomendasi awal; yang lain boleh dilewati. */
  inti: boolean;
  sifat: Sifat;
  tampil?: Syarat;
};

export type RentangAnggaran = { nilai: string; nama: string; min: number | null; maks: number | null };

export type Pertanyaan =
  | (Dasar & { jenis: "pilih"; pilihan: Pilihan[]; maks: number; urut?: boolean; tata?: "kartu" | "daftar" })
  | (Dasar & { jenis: "wilayah"; maks: number })
  | (Dasar & { jenis: "anggaran"; rentang: RentangAnggaran[] })
  | (Dasar & { jenis: "isian"; kolom: Kolom[] })
  | (Dasar & { jenis: "spbu" })
  | (Dasar & { jenis: "ruang" });

export type Kuesioner = { peran: Peran; versi: string; pertanyaan: Pertanyaan[] };

// ------------------------------------------------------------------ jawaban

export type Wilayah = { provinsi: string; kota: string | null };

export type JawabWilayah = {
  /** "Terbuka di berbagai wilayah": tidak ada batas wilayah. */
  terbuka: boolean;
  /** Boleh disarankan wilayah lain bila pilihannya tidak tersedia. Tanpa ini, wilayah adalah syarat. */
  lain: boolean;
  daftar: Wilayah[];
};

export type JawabAnggaran = {
  /** Nilai rentang, "sendiri", atau "belum". */
  pilihan: string;
  /** Rupiah per tahun. */
  min: number | null;
  maks: number | null;
  fleksibel: boolean;
  /** Satuan yang dipakai pengguna saat mengisi; penyimpanan selalu per tahun. */
  satuan: "tahun" | "bulan";
};

export type JawabIsian = Record<string, string | number | string[]>;

export type JawabSpbu =
  | { terdaftar: true; id: string; nomor: string; alamat: string | null; kota: string | null; provinsi: string }
  | { terdaftar: false; nomor: string; kota: string; catatan: string };

export type JawabRuang = { semua: boolean; lahan: { lahan_id: string; kode: string }[]; usul: string };

export type NilaiJawab = string[] | JawabWilayah | JawabAnggaran | JawabIsian | JawabSpbu | JawabRuang;

export type Jawaban = Record<string, NilaiJawab>;

/** Data SPBU yang boleh tampil untuk umum (fungsi temukan_cari_spbu dan temukan_spbu). */
export type SpbuUmum = { id: string; nomor: string; alamat: string | null; kota: string | null; provinsi: string };

export type RuangUmum = {
  lahan_id: string;
  kode: string;
  luas_m2: number | null;
  posisi: string | null;
  lantai: string | null;
  daya_w: number | null;
  terverifikasi: boolean;
};

export type SpbuRinci = SpbuUmum & { fasilitas: string[]; ruang: RuangUmum[] };

/** Rekomendasi yang dilihat saat minat dinyatakan. Keterangan untuk tim NFR, bukan dasar keputusan. */
export type Potret = {
  skor?: number;
  preferensi?: number;
  versi_model?: string;
  versi_preferensi?: string;
  alasan?: string[];
  preferensi_ringkas?: string[];
};

/** Lokasi yang ditandai pengunjung tanpa akun, untuk diteruskan saat mendaftar sebagai Bright Partner. */
export type Diminati = { lahan_id: string; kode: string; spbu_nomor: string; potret?: Potret };

export type SesiTemukan = {
  peran: Peran;
  /** true = preferensi tersimpan atas akun (terbaca di perangkat mana pun); false = sesi cookie. */
  akun: boolean;
  diminati: Diminati[];
  versi: string;
  langkah: string | null;
  status: "berjalan" | "selesai";
  jawaban: Jawaban;
  dilewati: string[];
  diubah: string;
};
