import { rpc } from "@/lib/data";
import type { DokumenPeluang } from "@/lib/dokumen";

/** Dokumen satu peluang sesuai peran pengguna: tim NFR, tenant penerima penawaran, atau pengelola SPBU-nya. */
export const getDokumenPeluang = (peluangId: string) => rpc<DokumenPeluang>("dokumen_peluang_daftar", { p_peluang_id: peluangId });
