#!/usr/bin/env node
/* Traduction à la construction : remplace les textes français du JS par leur traduction.
   Usage : node i18n.js <entrée.js> <sortie.js> <dossier_dicos> <missing.json>
   - Analyse le JS avec acorn ; ne touche qu'aux chaînes et aux morceaux de gabarits (template strings).
   - Dans une chaîne, chaque « bout de texte » (hors balises HTML) est cherché tel quel (sans les espaces
     autour) dans les dictionnaires ; les attributs title/placeholder/aria-label/alt aussi.
   - Les textes français non trouvés sont listés dans missing.json. */
"use strict";
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const [, , inFile, outFile, dictDir, missingFile] = process.argv;
const src = fs.readFileSync(inFile, "utf8");

const dict = {};
for (const f of fs.readdirSync(dictDir).filter(f => f.endsWith(".json") && !f.startsWith("_"))) {
  Object.assign(dict, JSON.parse(fs.readFileSync(path.join(dictDir, f), "utf8")));
}
let ignore = [];
try { ignore = JSON.parse(fs.readFileSync(path.join(dictDir, "_ignore.json"), "utf8")); } catch (e) { }
const ignoreSet = new Set(ignore);

const missing = new Set();
const used = new Set();

/* Un bout de texte ressemble-t-il à du français à traduire ? */
function looksText(s) {
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return false;
  if (process.env.I18N_ALL) return !ignoreSet.has(s);
  if (ignoreSet.has(s)) return false;
  if (/^[a-z][\w.\-]*$/.test(s)) return false;              // identifiants de code
  if (/^[\w.\-]+\.(js|css|json|png|html|md)$/.test(s)) return false;
  if (/^(https?:|\.\/|\.\.\/|#|\/)/.test(s)) return false;
  if (/^[A-Z_]{2,}$/.test(s)) return false;                 // CONSTANTES
  if (/^[\w-]+(\s+[\w-]+)*$/.test(s) && !/[A-ZÀ-Ý]/.test(s.charAt(0)) && !/[à-ÿ]/.test(s) && s.split(/\s+/).every(w => /^[a-z0-9-]+$/.test(w)) && s.length < 40 && /-/.test(s)) return false; // classes CSS
  return true;
}

function tr(text) {
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  const core = text.trim();
  if (!core) return text;
  if (Object.prototype.hasOwnProperty.call(dict, core)) { used.add(core); return lead + dict[core] + trail; }
  if (looksText(core)) missing.add(core);
  return text;
}

const ATTR = /\b(title|placeholder|aria-label|alt)="([^"$]*)"/g;

/* Traduit un fragment (contenu d'une chaîne ou d'un morceau de gabarit), en respectant les balises */
function translateFragment(s, startsInTag) {
  let out = "", i = 0, inTag = startsInTag, buf = "";
  const flushText = () => { if (buf) { out += tr(buf); buf = ""; } };
  const flushTag = () => { if (buf) { out += buf.replace(ATTR, (m, a, v) => `${a}="${v ? tr(v) : v}"`); buf = ""; } };
  while (i < s.length) {
    const c = s[i];
    if (!inTag && c === "<" && /[a-zA-Z\/!]/.test(s[i + 1] || "")) { flushText(); inTag = true; buf = c; i++; continue; }
    if (inTag && c === ">") { buf += c; flushTag(); inTag = false; i++; continue; }
    buf += c; i++;
  }
  if (inTag) flushTag(); else flushText();
  return out;
}

/* Détermine si un morceau de gabarit commence au milieu d'une balise */
function startsInTag(raw) {
  const lt = raw.indexOf("<"), gt = raw.indexOf(">");
  return gt !== -1 && (lt === -1 || gt < lt);
}

const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: "script", ranges: true });
const edits = [];
let prevTemplateEndsInTag = new WeakMap();

function walk(node, parent, key) {
  if (!node || typeof node.type !== "string") return;
  if (node.type === "Literal" && typeof node.value === "string") {
    // Ne pas toucher aux clés d'objets, aux imports, aux comparaisons de code évidentes
    const isKey = parent && parent.type === "Property" && key === "key";
    const isProp = parent && parent.type === "MemberExpression" && key === "property";
    if (!isKey && !isProp) {
      const v = translateFragment(node.value, false);
      if (v !== node.value) edits.push([node.start, node.end, JSON.stringify(v)]);
    }
  } else if (node.type === "TemplateLiteral") {
    let inTag = false;
    node.quasis.forEach(q => {
      const raw = q.value.raw;
      const st = inTag || startsInTag(raw);
      const v = translateFragment(raw, st);
      // État en fin de morceau : dans une balise si le dernier < est après le dernier >
      const lastLt = raw.lastIndexOf("<"), lastGt = raw.lastIndexOf(">");
      inTag = lastLt > lastGt ? true : lastGt > lastLt ? false : st;
      if (v !== raw) edits.push([q.start, q.end, v.replace(/`/g, "\\`").replace(/\$\{/g, "\\${")]);
    });
  }
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => walk(x, node, k));
    else if (v && typeof v.type === "string") walk(v, node, k);
  }
}
walk(ast, null, null);

edits.sort((a, b) => b[0] - a[0]);
let out = src;
for (const [s, e, t] of edits) out = out.slice(0, s) + t + out.slice(e);
fs.writeFileSync(outFile, out);

const miss = [...missing].sort();
fs.writeFileSync(missingFile, JSON.stringify(miss, null, 1));
const unused = Object.keys(dict).filter(k => !used.has(k));
console.log(`i18n : ${used.size} textes traduits, ${miss.length} manquants, ${unused.length} entrées inutilisées`);
if (process.env.I18N_VERBOSE) { console.log("MANQUANTS:", miss); console.log("INUTILISÉS:", unused); }
