import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseSiap, supabaseUrl } from "./env";

const HALAMAN_MASUK = "/login";
const RUANG_KERJA = "/ruang-kerja";
/** Temukan peluang: halaman depan dan kuesioner, terbuka untuk umum. */
const TEMUKAN = "/temukan";
/**
 * Rute berkas yang juga dipakai tenant dan pengelola SPBU dari ruang kerjanya: unggah foto inspeksi,
 * unggah dokumen, dan buka dokumen. Tiap rute memeriksa haknya sendiri lewat fungsi basis data.
 */
const RUTE_BERKAS = ["/api/inspeksi/", "/api/peluang/", "/dokumen/"];

/**
 * Menyegarkan sesi Supabase di setiap permintaan dan menjaga halaman:
 * pengguna yang belum masuk diarahkan ke /login, yang sudah masuk tidak perlu melihat /login lagi.
 * Ini pemeriksaan awal saja; penjaga data yang sebenarnya adalah Row Level Security di basis data.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Belum ada .env.local: biarkan lewat, halaman akan menampilkan panduan penyiapan.
  if (!supabaseSiap) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Respons yang membawa cookie sesi tidak boleh disimpan CDN.
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Jangan menaruh kode lain di antara pembuatan klien dan pemanggilan ini:
  // getClaims() memverifikasi token dan menyegarkannya bila perlu.
  const { data } = await supabase.auth.getClaims();
  const sudahMasuk = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  // Formulir "Jadi Bright Partner", halaman hasilnya, dan Temukan peluang terbuka untuk umum.
  const publik =
    path === HALAMAN_MASUK || path === "/daftar" || path.startsWith("/daftar/") || path === TEMUKAN || path.startsWith(`${TEMUKAN}/`);

  // Pengunjung yang belum masuk dan membuka alamat utama disambut halaman Temukan peluang, yang punya tombol Masuk.
  // Alamat lain tetap ke halaman masuk. Pengguna yang sudah masuk tidak pernah dialihkan ke sana.
  if (!sudahMasuk && path === "/") return alihkan(request, response, TEMUKAN);
  if (!sudahMasuk && !publik) return alihkan(request, response, HALAMAN_MASUK);
  if (sudahMasuk && path === HALAMAN_MASUK) return alihkan(request, response, "/");

  // Akun tenant dan dealer hanya memakai ruang kerjanya (/ruang-kerja dan halaman di bawahnya).
  // Ini hanya navigasi; data NFR tetap tertutup bagi mereka lewat Row Level Security.
  const ruang = (data?.claims?.app_metadata as { ruang?: unknown } | undefined)?.ruang;
  const ruteBerkas = RUTE_BERKAS.some((r) => path.startsWith(r));
  if (sudahMasuk && (ruang === "tenant" || ruang === "dealer") && !publik && !ruteBerkas && path !== RUANG_KERJA && !path.startsWith(`${RUANG_KERJA}/`)) {
    return alihkan(request, response, RUANG_KERJA);
  }
  return response;
}

/** Redirect yang tetap membawa cookie sesi yang baru disegarkan. */
function alihkan(request: NextRequest, asal: NextResponse, tujuan: string) {
  const url = request.nextUrl.clone();
  url.pathname = tujuan;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  asal.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
