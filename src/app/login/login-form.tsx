"use client";

import { useActionState } from "react";
import { masuk, type StatusMasuk } from "./actions";

const kolom =
  "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:border-brand-blue";

export default function LoginForm() {
  const [status, aksi, menunggu] = useActionState<StatusMasuk, FormData>(masuk, null);

  return (
    <form action={aksi} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-ink">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={kolom} />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-semibold text-ink">
          Kata sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={kolom}
        />
      </div>

      {status && (
        <p role="alert" className="rounded-lg bg-brand-red-soft px-3.5 py-2.5 text-sm font-medium text-brand-red-strong">
          {status.pesan}
        </p>
      )}

      <button
        type="submit"
        disabled={menunggu}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white transition-colors hover:bg-brand-blue-strong disabled:opacity-60"
      >
        {menunggu ? "Memeriksa…" : "Masuk"}
      </button>
    </form>
  );
}
