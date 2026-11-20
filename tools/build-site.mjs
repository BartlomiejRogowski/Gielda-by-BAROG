// Buduje wersję strony internetowej (GitHub Pages) z plików artefaktu.
// Uruchom: node tools/build-site.mjs   ->  folder _site gotowy do publikacji.
// index.html artefaktu nie ma szkieletu dokumentu (dodaje go Claude), więc tutaj go dokładamy,
// razem z manifestem, ikonami i service workerem, dzięki którym stronę można zainstalować na telefonie.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");
const BUILD = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* 1. index.html z pełnym szkieletem */
const src = readFileSync(join(ROOT, "index.html"), "utf8");
const cut = src.indexOf('<div class="app">');
if (cut < 0) throw new Error('index.html: nie znaleziono <div class="app">');
const head = src.slice(0, cut).trim(), body = src.slice(cut).trim();
const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Nauka giełdy na prawdziwych danych: lekcje, skaner, rotacja kapitału, analiza, symulacje i trening na historii. Narzędzie edukacyjne, nie porada inwestycyjna.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0a0d14">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Giełda od Zera">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>
</body>
</html>
`;
writeFileSync(join(OUT, "index.html"), html);

/* 2. Pliki aplikacji i dane */
for (const f of ["app.js", "lessons.js", "data.json"]) {
  if (!existsSync(join(ROOT, f))) throw new Error("brak pliku " + f);
  copyFileSync(join(ROOT, f), join(OUT, f));
}

/* 3. Ikony: logo ze świecami na granatowym tle (SVG i PNG) */
const BG = [10, 13, 20], INK = [233, 237, 243], ACC = [90, 185, 252];
// elementy logo w siatce 30 x 30, jak w index.html
const SHAPES = [
  [8.2, 7, 1.6, 14, INK], [6.5, 11, 5, 7, INK],
  [14.2, 5, 1.6, 13, INK], [12.5, 8, 5, 6, INK],
  [20.2, 4, 1.6, 11, ACC], [18.5, 6, 5, 6, ACC],
  [5, 23, 20, 2, ACC],
];
const hex = (c) => "#" + c.map((x) => x.toString(16).padStart(2, "0")).join("");
writeFileSync(join(OUT, "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><rect width="30" height="30" rx="6" fill="${hex(BG)}"/>${SHAPES.map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6" fill="${hex(c)}"/>`).join("")}</svg>\n`);

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, pad) {
  // pad: część krawędzi zostawiona na margines (ikony "maskable" przycinają rogi)
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, c, a = 1) => { const i = (y * size + x) * 4; for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + c[k] * a); px[i + 3] = 255; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);
  const s = (size * (1 - 2 * pad)) / 30, o = size * pad;
  for (const [rx, ry, rw, rh, c] of SHAPES) {
    const x0 = o + rx * s, y0 = o + ry * s, x1 = x0 + rw * s, y1 = y0 + rh * s;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const cov = Math.max(0, Math.min(x + 1, x1) - Math.max(x, x0)) * Math.max(0, Math.min(y + 1, y1) - Math.max(y, y0));
      if (cov > 0 && x >= 0 && y >= 0 && x < size && y < size) put(x, y, c, cov);
    }
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
writeFileSync(join(OUT, "icon-192.png"), png(192, 0.18));
writeFileSync(join(OUT, "icon-512.png"), png(512, 0.18));
writeFileSync(join(OUT, "icon-180.png"), png(180, 0.12));

/* 4. Manifest: instalacja na telefonie jak aplikacja */
writeFileSync(join(OUT, "manifest.webmanifest"), JSON.stringify({
  name: "Giełda od Zera", short_name: "Giełda", description: "Nauka giełdy na prawdziwych danych.",
  lang: "pl", start_url: "./#start", scope: "./", display: "standalone",
  background_color: "#0a0d14", theme_color: "#0a0d14",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
}, null, 2));

/* 5. Service worker: najpierw sieć, a bez internetu ostatnia zapisana wersja */
writeFileSync(join(OUT, "sw.js"), `// Giełda od Zera, wersja ${BUILD}
const CACHE = 'gielda-${BUILD}';
const SHELL = ['./', 'index.html', 'app.js', 'lessons.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
`);
writeFileSync(join(OUT, ".nojekyll"), "");

const data = JSON.parse(readFileSync(join(OUT, "data.json"), "utf8"));
console.log(`OK: strona zbudowana w _site (wersja ${BUILD}), ${data.stocks.length} walorów, notowania do ${data.as_of}`);
