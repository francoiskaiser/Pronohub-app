/* Génère les icônes de l'app à partir du logo (tools/logo.svg) : node icons.js <dossier_pwa> */
const sharp = require("/opt/npm-tools/node_modules/sharp");
const fs = require("fs");
const path = require("path");
const out = process.argv[2];

// Le ticket du logo (un seul tracé, les personnages et les pointillés sont des découpes)
const src = fs.readFileSync(path.join(__dirname, "logo.svg"), "utf8");
const D = /<path class="cls-2" d="([^"]+)"/.exec(src)[1];

const defs = `<defs>
  <linearGradient id="g" x1="512" y1="1140.55" x2="512" y2="724.96" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7a491d"/><stop offset="1" stop-color="#f49239"/></linearGradient>
  <filter id="s" filterUnits="userSpaceOnUse"><feOffset dx="5" dy="5"/><feGaussianBlur result="b" stdDeviation="9"/><feFlood flood-color="#000" flood-opacity=".75"/><feComposite in2="b" operator="in"/><feComposite in="SourceGraphic"/></filter>
  <clipPath id="r"><rect width="1024" height="1024" rx="RADIUS"/></clipPath>
</defs>`;

// scale : taille du ticket (1 = comme le logo) ; radius : arrondi des coins
const icon = (scale, radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${defs.replace("RADIUS", radius)}
  <g clip-path="url(#r)"><rect width="1024" height="1024" fill="url(#g)"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)"><path d="${D}" fill="#2d2d2d" filter="url(#s)"/></g></g></svg>`);

(async () => {
  await sharp(icon(1, 224)).resize(512).png().toFile(path.join(out, "icon-512.png"));
  await sharp(icon(1, 224)).resize(192).png().toFile(path.join(out, "icon-192.png"));
  // Android découpe l'icône en cercle ou en goutte : le ticket doit tenir dans les 80 % centraux
  await sharp(icon(0.74, 0)).resize(512).png().toFile(path.join(out, "icon-maskable.png"));
  await sharp(icon(0.92, 0)).resize(180).png().toFile(path.join(out, "apple-touch-icon.png"));
  // Petite icône monochrome de la barre d'état Android (notifications) : le ticket seul, en blanc
  const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 1024 1024">
    <g transform="translate(512 512) scale(1.08) translate(-512 -512)"><path d="${D}" fill="#fff"/></g></svg>`);
  await sharp(badge).resize(96).png().toFile(path.join(out, "badge-96.png"));
  // Le ticket pour l'app (logo intégré au code)
  // (le tracé D est aussi repris tel quel dans src/app.js, TICKET_SVG)
  console.log("icônes générées");
})();
