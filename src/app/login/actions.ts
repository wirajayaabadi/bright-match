"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseSiap } from "@/lib/supabase/env";
import { kunciSesi } from "@/lib/temukan/sesi";

export type StatusMasuk = { pesan: string } | null;

const LANJUT_SAH = /^\/temukan\/(tenant|dealer)(\/hasil)?$/;

export async function masuk(_sebelumnya: StatusMasuk, formData: FormData): Promise<StatusMasuk> {
  if (!supabaseSiap) return { pesan: "Supabase belum terhubung. Isi .env.local terlebih dahulu." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { pesan: "Isi email dan kata sandi." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { pesan: "Email atau kata sandi salah." };

  const ruang = (data.user?.app_metadata as { ruang?: unknown } | undefined)?.ruang;
  const mitra = ruang === "tenant" || ruang === "dealer";

  // Jawaban Temukan peluang yang diisi sebelum masuk menjadi preferensi akun (bila akun belum punya).
  // Kegagalannya tidak menghalangi masuk.
  const kunci = mitra ? await kunciSesi() : null;
  if (kunci) await supabase.rpc("temukan_klaim", { p_token: kunci });

  // Kembali ke halaman Temukan peluang yang dituju. Hanya alamat dalam daftar ini, agar tidak bisa dipakai mengalihkan ke situs lain.
  const lanjut = String(formData.get("lanjut") ?? "");
  if (mitra && LANJUT_SAH.test(lanjut) && lanjut.startsWith(`/temukan/${ruang}`)) redirect(lanjut);

  // Tenant dan dealer langsung ke ruang kerjanya; tim NFR ke beranda.
  redirect(mitra ? "/ruang-kerja" : "/");
}

export async function keluar() {
  if (supabaseSiap) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
