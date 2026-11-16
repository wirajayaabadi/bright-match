import Galeri from "@/components/galeri";
import { type Gambar, gambarSiap } from "@/lib/gambar";

/** Thumbnail foto di sel tabel; tanda pisah bila belum ada foto. Membuka penampil foto saat dipilih. */
export default function SelFoto({ gambar, subjek }: { gambar: Gambar[] | undefined; subjek: string }) {
  if (!gambarSiap || !gambar?.length) return <span className="text-subtle">–</span>;
  return <Galeri gambar={gambar} subjek={subjek} tampilan="mini" />;
}
