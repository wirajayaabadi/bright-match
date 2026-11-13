/**
 * Alamat dan kunci publik Supabase.
 * Kunci publik boleh berupa "publishable key" (sb_publishable_…) atau "anon key" lama.
 * Keduanya aman di sisi browser karena akses data dijaga Row Level Security.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** false selama .env.local belum diisi; aplikasi lalu menampilkan panduan penyiapan. */
export const supabaseSiap = supabaseUrl !== "" && supabaseKey !== "";
