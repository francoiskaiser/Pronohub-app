/* Pronohub — utilitaires communs */
"use strict";

const LOCALE = LANG === "en" ? "en-GB" : "fr-BE";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  // Espace insécable avant la ponctuation haute française, pour éviter un « ? » seul en début de ligne
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    .replace(/ ([?!:;»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}

function now() { return Date.now(); }
function dayNum(t = Date.now()) { return Math.floor(t / 86400000); }

function nf(n) { return new Intl.NumberFormat(LOCALE).format(Math.round(n || 0)); }
function pct(x) { return Math.round((x || 0) * 100) + " %"; }
function oddsFmt(x) { return "×" + (Math.round(x * 100) / 100).toFixed(2); }
function pl(n, one, many) { return Math.abs(n) > 1 ? many : one; }

function fmtDate(t, withTime = true) {
  if (!t) return "";
  const d = new Date(t);
  const o = { weekday: "short", day: "numeric", month: "short" };
  if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
  return d.toLocaleString(LOCALE, o);
}

function fmtTime(t) { return new Date(t).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }); }

/* Durée relative courte : « dans 2 h », « il y a 5 min » */
function rel(t) {
  const d = t - Date.now(), a = Math.abs(d);
  const m = Math.round(a / 60000), h = Math.round(a / 3600000), j = Math.round(a / 86400000);
  let s;
  if (m < 1) return "à l'instant";
  if (m < 60) s = m + " min";
  else if (h < 24) s = h + " h";
  else s = j + " j";
  if (d > 0) return "dans " + s;
  return LANG === "en" ? s + " ago" : "il y a " + s;
}

/* Compte à rebours pour la clôture d'un pari */
function countdown(t) {
  const d = t - Date.now();
  if (d <= 0) return "";
  const m = Math.floor(d / 60000), h = Math.floor(m / 60), j = Math.floor(h / 24);
  if (j >= 2) return j + " j";
  if (h >= 1) return h + " h " + String(m % 60).padStart(2, "0");
  return m + " min";
}

/* Date locale pour <input type="datetime-local"> */
function toLocalInput(t) {
  const d = new Date(t), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function rid(n = 12) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(n));
  for (const x of r) s += a[x % a.length];
  return s;
}

/* Code de cercle lisible : ABC-123, sans caractères ambigus */
function newCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ", D = "23456789";
  const r = crypto.getRandomValues(new Uint8Array(6));
  return L[r[0] % L.length] + L[r[1] % L.length] + L[r[2] % L.length] + "-" + D[r[3] % D.length] + D[r[4] % D.length] + D[r[5] % D.length];
}

function normCode(s) {
  const c = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 6 ? c.slice(0, 3) + "-" + c.slice(3) : "";
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let toastTimer;
function toast(msg, kind = "") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = String(msg).replace(/ ([?!:;»])/g, "\u00a0$1");
  el.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast " + kind; }, 2800);
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Couleur stable par joueur, pour les avatars */
const HUES = [12, 38, 152, 196, 226, 262, 290, 330];
function hueOf(id) { return HUES[hashStr(String(id)) % HUES.length]; }

function avatar(m, size = "") {
  const name = m?.name || "?";
  const em = m?.avatar || "";
  return `<span class="av ${size}" style="--h:${hueOf(m?.uid || name)}" aria-hidden="true">${em ? esc(em) : esc(name.trim().charAt(0).toUpperCase())}</span>`;
}

function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function copyText(s) {
  try { await navigator.clipboard.writeText(s); toast("Copié"); }
  catch (e) { prompt("Copie ce texte :", s); }
}

function loadScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
}
