import { rpc } from "@/lib/data";
import type { Survei, SurveiDealer, SurveiTenant } from "@/lib/survei";

/** Survei satu penawaran untuk tenant; kosong bila penawaran bukan untuk organisasinya. */
export const getSurveiTenant = (peluangId: string) => rpc<SurveiTenant[]>("tenant_survei", { p_peluang_id: peluangId });

/** Semua survei satu peluang untuk tim NFR, yang terbaru dulu. */
export const getSurveiPeluang = (peluangId: string) => rpc<Survei[]>("survei_peluang", { p_peluang_id: peluangId });

/** Survei terjadwal yang belum lewat di SPBU yang dikelola organisasi pengguna; `spbuId` menyaring ke satu SPBU. */
export const getSurveiDealer = (spbuId?: string) => rpc<SurveiDealer[]>("dealer_survei", { p_spbu_id: spbuId ?? null });
