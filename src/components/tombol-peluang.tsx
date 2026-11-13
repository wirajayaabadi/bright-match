import { buatPeluang } from "@/app/aksi";

/** Tombol "Jadikan peluang": membuat peluang untuk satu lahan dan satu pihak, lalu membuka halamannya. */
export default function TombolPeluang({
  lahanId,
  tenantId,
  calonId,
  skor,
}: {
  lahanId: string;
  tenantId?: string;
  calonId?: string;
  skor?: number;
}) {
  return (
    <form action={buatPeluang}>
      <input type="hidden" name="lahan_id" value={lahanId} />
      {tenantId && <input type="hidden" name="tenant_id" value={tenantId} />}
      {calonId && <input type="hidden" name="calon_id" value={calonId} />}
      {skor != null && <input type="hidden" name="skor" value={skor} />}
      <button
        type="submit"
        className="rounded-lg border border-brand-blue px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-brand-blue-strong transition-colors hover:bg-brand-blue-soft"
      >
        Jadikan peluang
      </button>
    </form>
  );
}
