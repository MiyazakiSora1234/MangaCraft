// SDXL が得意な解像度（学習時のバケット）から、コマの縦横比に一番近いものを選ぶ
const SD_BUCKETS: [number, number][] = [[1024, 1024], [1152, 896], [896, 1152], [1216, 832], [832, 1216], [1344, 768], [768, 1344], [1536, 640], [640, 1536]];

export function sdSize(aspect: number): [number, number] {
  const distance = ([w, h]: [number, number]) => Math.abs(Math.log(w / h / aspect));
  return SD_BUCKETS.reduce((best, b) => (distance(b) < distance(best) ? b : best));
}
