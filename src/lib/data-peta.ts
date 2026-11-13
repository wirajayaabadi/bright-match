import { rpc } from "@/lib/data";
import type { PetaSpbu } from "@/lib/peta";

/** Titik tempat di sekitar satu SPBU. null bila SPBU tidak berkoordinat atau petanya belum dimuat. */
export const getPetaSpbu = (id: string) => rpc<PetaSpbu>("peta_spbu", { p_id: id });
