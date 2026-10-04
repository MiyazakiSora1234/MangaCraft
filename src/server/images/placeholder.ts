// npm run mock で使う仮画像（コマの内容を文字で表示）
import { sdSize } from "./sizes.ts";
import type { ImageGenerator } from "./types.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function placeholderSvg(label: string, aspect: number): string {
  const [w, h] = sdSize(aspect);
  const chars = [...(label || "")];
  const perLine = Math.floor(w / 56);
  const lines: string[] = [];
  for (let i = 0; i < chars.length && lines.length < 6; i += perLine) lines.push(chars.slice(i, i + perLine).join(""));
  const startY = h / 2 - (lines.length * 64) / 2 + 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="2.2" fill="#d6d3cc"/></pattern></defs>
<rect width="100%" height="100%" fill="#f4f2ec"/><rect width="100%" height="100%" fill="url(#dots)"/>
<text x="50%" y="${startY - 90}" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#9a958a">PLACEHOLDER</text>
${lines.map((l, i) => `<text x="50%" y="${startY + i * 64}" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#55524b">${esc(l)}</text>`).join("\n")}
</svg>`;
}

export const placeholder: ImageGenerator = {
  generate: async ({ label, aspect }) => ({ buffer: Buffer.from(placeholderSvg(label, aspect)), ext: "svg" }),
  release: async () => {},
};
