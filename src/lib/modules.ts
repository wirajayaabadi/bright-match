/**
 * Tujuh modul Bright Match dan tahap pembangunannya.
 * Sidebar, beranda, dan halaman "segera hadir" membaca daftar ini,
 * jadi mengaktifkan modul cukup dengan mengubah `siap` menjadi true.
 */
export type Modul = {
  slug: string;
  href: string;
  nama: string;
  ringkas: string;
  isi: string[];
  tahap: 1 | 2 | 3;
  siap: boolean;
};

export const MODUL: Modul[] = [
  {
    slug: "peluang",
    href: "/peluang",
    nama: "Peta peluang",
    ringkas: "Lahan kosong dan nilai sewa yang belum terisi per provinsi dan kota.",
    isi: [],
    tahap: 1,
    siap: true,
  },
  {
    slug: "lokasi",
    href: "/lokasi",
    nama: "Profil lokasi",
    ringkas: "Satu halaman per SPBU: lahan, fasilitas, tenant yang ada, dan lingkungan sekitar.",
    isi: [
      "Daftar SPBU dengan pencarian dan saringan wilayah.",
      "Halaman SPBU: lahan kosong dan terisi, fasilitas, foto, dan tenant yang sudah ada.",
      "Tipe lokasi, penduduk, dan tempat usaha di sekitar SPBU dari data terbuka.",
    ],
    tahap: 1,
    siap: true,
  },
  {
    slug: "tenant",
    href: "/tenant",
    nama: "Profil tenant",
    ringkas: "Jenis usaha, sebaran, dan kebutuhan lokasi tiap tenant, diturunkan dari kontraknya.",
    isi: [
      "Daftar tenant dengan jumlah lahan, SPBU, dan kota operasinya.",
      "Halaman tenant: jenis usaha utama, luas dan tarif yang biasa dipakai, kontrak yang segera berakhir.",
      "Formulir profil untuk calon tenant baru di tahap 3.",
    ],
    tahap: 1,
    siap: true,
  },
  {
    slug: "kecocokan",
    href: "/kecocokan",
    nama: "Mesin kecocokan",
    ringkas: "Untuk satu lahan, tenant yang cocok. Untuk satu tenant, lahan yang cocok.",
    isi: [
      "Syarat wajib: luas, posisi, daya listrik, tarif, dan wilayah operasi.",
      "Skor 0–100 dengan alasan di balik tiap angka.",
      "Versi 1 memakai kecocokan fisik, harga, dan pola tenant sejenis di jaringan.",
    ],
    tahap: 1,
    siap: true,
  },
  {
    slug: "playbook",
    href: "/playbook",
    nama: "Playbook jenis usaha",
    ringkas: "Segmen pelanggan, customer journey, dan kebutuhan ruang per jenis usaha.",
    isi: [
      "Enam jenis usaha pertama: F&B grab-and-go, minimarket, perbankan dan ATM, perawatan kendaraan, logistik dan loker paket, layanan kesehatan.",
      "Per jenis usaha: siapa pelanggannya, alur kunjungan di SPBU, waktu singgah, dan tipe lokasi yang cocok.",
    ],
    tahap: 2,
    siap: true,
  },
  {
    slug: "penawaran",
    href: "/penawaran",
    nama: "Kartu penawaran",
    ringkas: "Penawaran siap kirim per lahan: lokasi, fasilitas, tarif, dan skema investasi.",
    isi: [
      "Satu halaman penawaran per lahan dengan foto, fasilitas, tarif, dan alasan kecocokan.",
      "Unduhan PDF dalam bahasa Indonesia dan Inggris.",
    ],
    tahap: 3,
    siap: true,
  },
  {
    slug: "pipeline",
    href: "/pipeline",
    nama: "Pipeline calon tenant",
    ringkas: "Calon tenant per kanal, dari kontak pertama sampai kontrak.",
    isi: [
      "Daftar calon tenant lokal dan internasional beserta kanal asalnya.",
      "Status peluang dan daftar persyaratan tiap pihak yang harus terpenuhi.",
    ],
    tahap: 3,
    siap: true,
  },
];

export const modulDariSlug = (slug: string) => MODUL.find((m) => m.slug === slug);
