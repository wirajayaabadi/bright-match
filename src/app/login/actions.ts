"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseSiap } from "@/lib/supabase/env";

export type StatusMasuk = { pesan: string } | null;

export async function masuk(_sebelumnya: StatusMasuk, formData: FormData): Promise<StatusMasuk> {
  if (!supabaseSiap) return { pesan: "Supabase belum terhubung. Isi .env.local terlebih dahulu." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { pesan: "Isi email dan kata sandi." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { pesan: "Email atau kata sandi salah." };

  redirect("/");
}

export async function keluar() {
  if (supabaseSiap) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
