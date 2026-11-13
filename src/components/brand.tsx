import Image from "next/image";

/** Garis tiga warna Pertamina. */
export function GarisMerek({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex h-1 overflow-hidden rounded-full ${className}`}>
      <span className="flex-1 bg-brand-red" />
      <span className="flex-1 bg-brand-blue" />
      <span className="flex-1 bg-brand-green" />
    </span>
  );
}

export function Merek() {
  return (
    <div>
      <Image
        src="/brand/logo-pertamina.png"
        alt="Pertamina"
        width={467}
        height={118}
        priority
        className="h-5 w-auto"
      />
      <p className="mt-3 text-lg leading-tight font-extrabold tracking-[-0.01em] text-ink">Bright Match</p>
      <p className="mt-0.5 text-xs text-subtle">Growing Together, Beyond Fuel</p>
    </div>
  );
}
