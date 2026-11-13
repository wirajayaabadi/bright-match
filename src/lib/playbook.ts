/**
 * Isi naratif Playbook jenis usaha: segmen pelanggan, customer journey, waktu singgah,
 * dan hal yang perlu disiapkan. Statistik (lahan, tenant, luas, tarif, tipe lokasi) tidak
 * ditulis di sini; halaman mengambilnya dari jaringan lewat fungsi public.playbook().
 *
 * Status isi: usulan awal konsultan. Bagian "bukti" berasal dari survei perilaku konsumen
 * (73 responden, November 2026; 68,5% pengendara motor, 42,5% dari Medan Raya), jadi berlaku
 * sebagai arah, bukan angka nasional. Customer journey belum divalidasi lewat pengamatan lapangan.
 */
export type Langkah = { judul: string; isi: string };

export type Playbook = {
  slug: string;
  /** Nama segmen di basis data (kolom lahan.segmen). */
  segmen: string;
  nama: string;
  ringkas: string;
  pelanggan: { siapa: string; kebutuhan: string }[];
  journey: Langkah[];
  waktuSinggah: string;
  kunci: string[];
  risiko: string[];
  bukti: string[];
};

export const SURVEI = "Survei perilaku konsumen SPBU, 73 responden, November 2026";

export const PLAYBOOK: Playbook[] = [
  {
    slug: "fnb",
    segmen: "F&B / Kuliner",
    nama: "F&B grab-and-go",
    ringkas: "Kopi, teh, dan makanan siap ambil yang dibeli tanpa menambah banyak waktu di SPBU.",
    pelanggan: [
      { siapa: "Pengendara motor komuter", kebutuhan: "Minuman atau camilan cepat dalam perjalanan kerja; sensitif harga dan waktu." },
      { siapa: "Pengemudi mobil dalam perjalanan", kebutuhan: "Kopi dan makanan ringan untuk dibawa; mau membayar lebih untuk merek yang dikenal." },
      { siapa: "Ojek online dan kurir", kebutuhan: "Minuman murah dan tempat menunggu singkat di antara pesanan." },
    ],
    journey: [
      { judul: "Melihat gerai saat antre", isi: "Gerai dan menunya harus terlihat dari antrean pompa. Di sinilah keputusan membeli muncul." },
      { judul: "Memesan setelah mengisi", isi: "Titik pesan berada di jalur keluar, tanpa memutar. Menu ringkas dan pembayaran QRIS." },
      { judul: "Menerima pesanan", isi: "Produk siap dalam tiga menit atau kurang, atau sudah tersedia untuk langsung diambil." },
      { judul: "Melanjutkan perjalanan", isi: "Kemasan mudah dibawa dengan motor. Promo kunjungan berikutnya lewat MyPertamina." },
    ],
    waktuSinggah: "Paling lama 3–5 menit di luar waktu mengisi BBM.",
    kunci: [
      "Booth kecil di dalam atau di luar bangunan, dekat jalur keluar.",
      "Daya listrik untuk mesin kopi dan pendingin; periksa daya lahan sebelum menawarkan.",
      "Kecepatan layanan lebih menentukan daripada kelengkapan menu.",
    ],
    risiko: [
      "Antrean gerai mengganggu arus kendaraan di area pompa.",
      "Omzet per kunjungan kecil, sehingga gerai bergantung pada volume lalu lintas SPBU.",
    ],
    bukti: [
      "41,1% responden menilai makanan dan minuman cepat bermanfaat di SPBU; 23,3% menjadikannya prioritas.",
      "26,0% membeli kopi atau minuman di tempat lain, hanya 9,6% membelinya di SPBU.",
      "68,5% mengantre lima menit atau lebih, tetapi 82,2% langsung pergi setelah mengisi.",
      "47,9% menyebut proses pelayanan cepat sebagai faktor terpenting.",
    ],
  },
  {
    slug: "minimarket",
    segmen: "Minimarket & Ritel",
    nama: "Minimarket",
    ringkas: "Toko kebutuhan harian yang melayani pengendara sekaligus warga di sekitar SPBU.",
    pelanggan: [
      { siapa: "Warga sekitar", kebutuhan: "Belanja harian yang dekat dari rumah; datang khusus ke toko, bukan untuk BBM." },
      { siapa: "Pengendara yang mengisi BBM", kebutuhan: "Minuman, camilan, rokok, dan kebutuhan mendadak." },
      { siapa: "Pelaku perjalanan jauh", kebutuhan: "Bekal perjalanan, toilet, dan tempat berhenti sejenak." },
    ],
    journey: [
      { judul: "Memutuskan mampir", isi: "Papan nama toko terlihat dari jalan dan dari area pompa." },
      { judul: "Parkir", isi: "Tempat parkir di depan toko, terpisah dari antrean pompa agar tidak saling menghalangi." },
      { judul: "Berbelanja", isi: "Kebutuhan cepat diletakkan dekat pintu dan kasir." },
      { judul: "Membayar", isi: "Kasir cepat dengan pembayaran nontunai; peluang menautkan poin MyPertamina." },
      { judul: "Keluar", isi: "Akses keluar tidak memotong jalur pengisian." },
    ],
    waktuSinggah: "5–10 menit untuk belanja cepat.",
    kunci: [
      "Butuh lahan besar di dalam bangunan dan daya listrik tinggi untuk pendingin.",
      "Parkir khusus toko dan akses pejalan kaki bila dekat permukiman.",
      "Periksa minimarket lain dalam 500 m: warga sekitar punya pilihan yang lebih dekat.",
    ],
    risiko: [
      "Pengendara terbiasa berbelanja di minimarket dekat rumah, bukan di SPBU.",
      "Lahan yang cukup besar jarang tersedia; sebagian besar lahan kosong berukuran kecil.",
    ],
    bukti: [
      "24,7% membeli kebutuhan harian di tempat lain, hanya 2,7% membelinya di SPBU.",
      "61,6% menyebut minimarket sebagai tempat mereka biasa membeli kebutuhan itu, terutama karena lebih dekat (52,1%).",
      "39,7% tahu ada Bright Store atau minimarket di SPBU.",
      "Hanya 11,0% menilai layanan kebutuhan harian di SPBU bermanfaat.",
    ],
  },
  {
    slug: "bank",
    segmen: "Perbankan & ATM",
    nama: "Perbankan dan ATM",
    ringkas: "Mesin ATM dan titik layanan bank yang memanfaatkan lokasi SPBU yang mudah dijangkau dan terjaga.",
    pelanggan: [
      { siapa: "Warga dan pekerja di sekitar SPBU", kebutuhan: "Tarik dan setor tunai di lokasi yang aman dan buka sampai malam." },
      { siapa: "Pengendara", kebutuhan: "Tarik tunai sekalian mengisi BBM." },
      { siapa: "Pelaku usaha kecil", kebutuhan: "Setor tunai harian tanpa harus ke kantor cabang." },
    ],
    journey: [
      { judul: "Datang", isi: "Sebagian datang khusus untuk ATM, sebagian sekalian mengisi BBM." },
      { judul: "Parkir singkat", isi: "Tempat berhenti dekat galeri ATM dan tidak menghalangi pompa." },
      { judul: "Bertransaksi", isi: "Ruang ATM terang, terlihat dari area SPBU, dan terpantau CCTV." },
      { judul: "Lanjut", isi: "Uang tunai di tangan membuka peluang belanja di toko atau gerai SPBU." },
    ],
    waktuSinggah: "2–5 menit.",
    kunci: [
      "Lahan kecil di dalam bangunan dengan listrik stabil dan jaringan data.",
      "Keamanan: penerangan, CCTV, dan jam operasi SPBU.",
      "Beberapa bank dalam satu galeri saling melengkapi, bukan saling mengganggu.",
    ],
    risiko: [
      "Transaksi tunai terus bergeser ke digital; bank mengurangi jumlah mesin ATM.",
      "Jenis usaha ini sudah ada di hampir separuh SPBU, jadi ruang tumbuhnya terbatas.",
    ],
    bukti: [
      "53,4% tahu ada ATM atau layanan pembayaran di SPBU, tertinggi kedua setelah nitrogen.",
      "Hanya 15,1% menilai layanan pembayaran digital di SPBU bermanfaat; 5,5% menjadikannya prioritas.",
    ],
  },
  {
    slug: "perawatan",
    segmen: "Nitrogen & Perawatan",
    nama: "Perawatan kendaraan",
    ringkas: "Isi angin dan nitrogen, tambal ban, cuci cepat, dan servis ringan di sela mengisi BBM.",
    pelanggan: [
      { siapa: "Pengendara motor harian", kebutuhan: "Isi angin, tambal ban, dan ganti oli tanpa harus ke bengkel." },
      { siapa: "Ojek online dan kurir", kebutuhan: "Perawatan cepat karena kendaraan adalah alat kerja." },
      { siapa: "Pengemudi mobil sebelum perjalanan jauh", kebutuhan: "Cek tekanan ban dan cuci cepat." },
    ],
    journey: [
      { judul: "Menyadari kebutuhan", isi: "Sering muncul saat antre: ban terasa kurang angin atau kendaraan kotor." },
      { judul: "Menuju titik layanan", isi: "Lokasi di area luar, terlihat dari pompa, dengan petunjuk yang jelas." },
      { judul: "Dilayani", isi: "Isi angin atau nitrogen selesai dalam hitungan menit; harga terpampang." },
      { judul: "Membayar dan pergi", isi: "Pembayaran nontunai; tawaran paket langganan untuk pengguna rutin." },
    ],
    waktuSinggah: "3–10 menit untuk angin dan tambal ban; 15–30 menit untuk cuci atau servis ringan.",
    kunci: [
      "Lahan di luar bangunan dengan akses kendaraan dan sumber listrik untuk kompresor.",
      "Standar layanan dan harga yang seragam agar pelanggan percaya.",
      "Tidak mengganggu arus masuk dan keluar pompa.",
    ],
    risiko: [
      "Nilai transaksi kecil, sehingga sewa yang sanggup dibayar juga kecil.",
      "Mutu layanan tidak seragam antaroperator.",
    ],
    bukti: [
      "Layanan yang paling diinginkan: 46,6% menilainya bermanfaat dan 34,2% menjadikannya prioritas pertama.",
      "32,9% mengurus ban dan angin di tempat lain, hanya 11,0% di SPBU.",
      "60,3% tahu ada layanan nitrogen atau ban di SPBU, tertinggi di antara semua layanan.",
    ],
  },
  {
    slug: "logistik",
    segmen: "Logistik & Ekspedisi",
    nama: "Logistik dan loker paket",
    ringkas: "Titik kirim dan ambil paket, loker, atau gerai ekspedisi yang memanfaatkan jam buka SPBU yang panjang.",
    pelanggan: [
      { siapa: "Pembelanja online di sekitar SPBU", kebutuhan: "Mengambil paket di luar jam kerja tanpa menunggu kurir." },
      { siapa: "Penjual online skala kecil", kebutuhan: "Menitipkan kiriman harian di titik yang dekat dan buka sampai malam." },
      { siapa: "Kurir", kebutuhan: "Titik antar yang pasti bisa diakses, mengurangi kiriman gagal." },
    ],
    journey: [
      { judul: "Menerima pemberitahuan", isi: "Pelanggan diberi tahu paketnya tiba di titik SPBU, lengkap dengan kode ambil." },
      { judul: "Datang", isi: "Sengaja atau sekalian mengisi BBM; lokasi loker mudah ditemukan." },
      { judul: "Mengambil atau menitipkan", isi: "Selesai dalam satu sampai dua menit dengan kode atau pindai." },
      { judul: "Lanjut", isi: "Kunjungan khusus ini membuka peluang transaksi lain di SPBU." },
    ],
    waktuSinggah: "1–3 menit.",
    kunci: [
      "Lahan kecil dengan listrik dan jaringan data; loker bisa di dalam atau di luar bangunan.",
      "Akses sepanjang jam buka SPBU dan pengawasan CCTV.",
      "Paling masuk akal di dekat permukiman padat atau kawasan niaga.",
    ],
    risiko: [
      "Permintaan konsumen masih lemah, jadi perlu mitra operator yang membawa volume sendiri.",
      "Baru ada di sebagian kecil SPBU, sehingga buktinya dari jaringan masih tipis.",
    ],
    bukti: [
      "Hanya 4,1% menilai titik ambil paket di SPBU bermanfaat; 1,4% menjadikannya prioritas.",
      "13,7% memilih memesan lewat aplikasi lalu mengambil di SPBU sebagai cara akses layanan.",
      "Hanya 1,4% tahu ada layanan paket di SPBU.",
    ],
  },
  {
    slug: "kesehatan",
    segmen: "Kesehatan & Jasa",
    nama: "Kesehatan dan jasa pribadi",
    ringkas: "Apotek, klinik kecil, pangkas rambut, dan laundry yang melayani warga di sekitar SPBU.",
    pelanggan: [
      { siapa: "Warga sekitar", kebutuhan: "Obat, pangkas rambut, atau laundry di lokasi yang dekat dan mudah parkir." },
      { siapa: "Pengendara dalam perjalanan", kebutuhan: "Obat ringan dan kebutuhan mendadak." },
      { siapa: "Pekerja di sekitar SPBU", kebutuhan: "Layanan cepat di sela jam kerja." },
    ],
    journey: [
      { judul: "Muncul kebutuhan", isi: "Umumnya kunjungan yang direncanakan, bukan dorongan sesaat ketika mengisi BBM." },
      { judul: "Datang dan parkir", isi: "Butuh parkir yang cukup lama, terpisah dari area pompa." },
      { judul: "Dilayani", isi: "Beli obat selesai dalam beberapa menit; jasa seperti pangkas rambut memakan waktu lebih lama." },
      { judul: "Pulang", isi: "Kunjungan rutin membuka peluang menjadi pelanggan tetap layanan lain di SPBU." },
    ],
    waktuSinggah: "3–5 menit untuk apotek; 15–30 menit untuk klinik dan jasa pribadi.",
    kunci: [
      "Lahan sedang di dalam bangunan dengan ruang tunggu dan parkir.",
      "Izin usaha khusus untuk apotek dan klinik.",
      "Lebih cocok di lokasi berpenduduk padat daripada di jalur antarkota.",
    ],
    risiko: [
      "Survei tidak menanyakan layanan ini, jadi permintaannya belum terukur.",
      "Baru ada di kurang dari 1% SPBU; pola keberhasilannya belum terlihat.",
    ],
    bukti: [],
  },
];

export const playbookDariSlug = (slug: string) => PLAYBOOK.find((p) => p.slug === slug);
