// One-off generator: produces the PWA icon set in public/ from public/logo.png.
// Re-run with `node scripts/generate-pwa-icons.mjs` whenever logo.png changes.
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const source = path.join(publicDir, 'logo.png');

const BACKGROUND = '#fcfcfd'; // matches --color-background

async function main() {
  await sharp(source)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  await sharp(source)
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Maskable icon: Android crops to a shape (circle/squircle/etc.), so the
  // artwork must sit inside the center ~80% "safe zone" on an opaque
  // background, otherwise the badge's own circular edge gets clipped.
  const maskableLogo = await sharp(source).resize(410, 410).toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: maskableLogo, left: 51, top: 51 }])
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));

  // Apple touch icon: iOS doesn't respect alpha transparency on home-screen
  // icons (renders it black), so flatten onto an opaque background.
  await sharp(source)
    .resize(180, 180)
    .flatten({ background: BACKGROUND })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('PWA icons generated in public/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
