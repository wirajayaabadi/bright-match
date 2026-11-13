import type { Metadata } from "next";
import { GarisMerek, Merek } from "@/components/brand";
import PanelGalat from "@/components/panel-galat";
import { supabaseSiap } from "@/lib/supabase/env";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function HalamanMasuk() {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <GarisMerek className="rounded-none" />
          <div className="p-7 sm:p-9">
            <Merek />
            <h1 className="mt-8 text-xl font-extrabold tracking-[-0.01em] text-ink">Masuk ke Bright Match</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Platform ini memuat data kontrak tenant, jadi hanya bisa dibuka oleh pengguna terdaftar.
            </p>
            {supabaseSiap ? (
              <LoginForm />
            ) : (
              <div className="mt-6">
                <PanelGalat galat={{ jenis: "belum-terhubung" }} />
              </div>
            )}
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-subtle">
          Belum punya akun? Minta admin menambahkan Anda di Supabase, menu Authentication.
        </p>
      </div>
    </main>
  );
}
