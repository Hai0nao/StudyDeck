// Renders public/favicon.svg into the PNG icons the PWA manifest needs.
// Run with `npm run icons` after changing the logo.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const file = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const svg = await readFile(file("favicon.svg"));

// Maskable / touch icons need padding: platforms crop them to a circle or squircle.
async function padded(size) {
  const logo = await sharp(svg)
    .resize(Math.round(size * 0.72))
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: "#09090a" },
  }).composite([{ input: logo, gravity: "center" }]);
}

await sharp(svg).resize(192).png().toFile(file("pwa-192.png"));
await (await padded(512)).png().toFile(file("pwa-512.png"));
await (await padded(180)).png().toFile(file("apple-touch-icon.png"));
console.log("icons written");
