/* Génère les icônes de l'app à partir d'un SVG (node icons.js <dossier_pwa>) */
const sharp = require("/opt/npm-tools/node_modules/sharp");
const path = require("path");
const out = process.argv[2];

const ticket = (s) => `
  <g transform="translate(256 262) rotate(-10) scale(${s}) translate(-180 -110)">
    <path d="M24 0h312a24 24 0 0 1 24 24v58a28 28 0 0 0 0 56v58a24 24 0 0 1-24 24H24A24 24 0 0 1 0 196v-58a28 28 0 0 0 0-56V24A24 24 0 0 1 24 0z" fill="#ffffff"/>
    <path d="M258 22v176" stroke="#c9c6ff" stroke-width="10" stroke-dasharray="16 14" stroke-linecap="round"/>
    <circle cx="130" cy="110" r="62" fill="#ffc531"/>
    <circle cx="130" cy="110" r="40" fill="none" stroke="#c98a00" stroke-width="12"/>
  </g>`;

const svg = (bg, s, radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${bg}"/>${ticket(s)}</svg>`);

(async () => {
  const any = svg("#3b32e0", 1.0, 112);
  const mask = svg("#3b32e0", 0.78, 0);
  await sharp(any).resize(512).png().toFile(path.join(out, "icon-512.png"));
  await sharp(any).resize(192).png().toFile(path.join(out, "icon-192.png"));
  await sharp(mask).resize(512).png().toFile(path.join(out, "icon-maskable.png"));
  await sharp(svg("#3b32e0", 0.9, 0)).resize(180).png().toFile(path.join(out, "apple-touch-icon.png"));
  // Petite icône monochrome de la barre d'état Android (notifications)
  const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 512 512">
    <defs><mask id="m"><rect x="-200" y="-200" width="900" height="900" fill="#fff"/><circle cx="130" cy="110" r="44" fill="#000"/></mask></defs>
    <g mask="url(#m)" transform="translate(256 262) rotate(-10) scale(1.25) translate(-180 -110)"><path d="M24 0h312a24 24 0 0 1 24 24v58a28 28 0 0 0 0 56v58a24 24 0 0 1-24 24H24A24 24 0 0 1 0 196v-58a28 28 0 0 0 0-56V24A24 24 0 0 1 24 0z" fill="#fff"/></g></svg>`);
  await sharp(badge).resize(96).png().toFile(path.join(out, "badge-96.png"));
  console.log("icônes générées");
})();
