// Générateur de fiche de présence : tout tourne dans le navigateur.
// La mise en page de chaque mois est lue directement dans le modèle PDF (pdf.js),
// puis les heures et la signature sont écrites dessus (pdf-lib).

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const STORE_KEY = "fiche-presence:v1";
const TPL_KEY = "fiche-presence:template";
const DATE_RE = /^\d\d\/\d\d\/\d{4}$/;
const FONT_SIZE = 7.5;
const DAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

const $ = (id) => document.getElementById(id);

let state = loadState();
let templateBytes = null;
let pages = [];
let sigCache = null; // { src, dataUrl, ratio }

// ---------- stockage ----------

function loadState() {
  const empty = { name: "", responsable: "", faitLe: "", month: null, sig: null, hours: {} };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return empty;
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    setStatus("Impossible d'enregistrer dans le navigateur : " + e.message);
  }
}

// ---------- utilitaires ----------

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function parseDate(str) {
  const [d, m, y] = str.split("/").map(Number);
  return new Date(y, m - 1, d);
}

function fmtH(n) {
  return String(Math.round(n * 100) / 100).replace(".", ",") + "H";
}

function num(v) {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function today() {
  const d = new Date();
  return [d.getDate(), d.getMonth() + 1].map((x) => String(x).padStart(2, "0")).join("/") + "/" + d.getFullYear();
}

function setStatus(msg) {
  $("status").textContent = msg;
}

// ---------- analyse du modèle ----------

async function analyseTemplate(bytes) {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const items = (await page.getTextContent()).items
      .filter((it) => it.str.trim())
      .map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width }));
    const layout = pageLayout(items);
    if (layout) out.push({ index: i - 1, ...layout });
  }
  return out;
}

function pageLayout(items) {
  // Le modèle a parfois une date en double (ex. 28/02/2027) : on garde la première ligne.
  const seen = new Set();
  const dates = items
    .filter((it) => DATE_RE.test(it.str) && !seen.has(it.str) && seen.add(it.str))
    .map((it) => ({ str: it.str, y: it.y }));
  if (!dates.length) return null;

  const find = (pred) => items.find(pred);
  const center = (it) => it.x + it.w / 2;

  // Colonnes, repérées par leurs en-têtes
  const hourHeads = items.filter((it) => it.str === "(nombre d'heures)").sort((a, b) => a.x - b.x);
  const sigHeads = items.filter((it) => it.str === "de l'alternant").sort((a, b) => a.x - b.x);
  const totalHead = find((it) => it.str === "heures réalisées");
  if (hourHeads.length !== 4 || sigHeads.length !== 2 || !totalHead) return null;
  const [matinFace, matinAuto, apremFace, apremAuto] = hourHeads.map(center);
  const colHalf = (matinAuto - matinFace) / 2;
  const sigHalf = (apremFace - matinAuto) / 2 - colHalf;
  const cols = {
    total: center(totalHead), matinFace, matinAuto, apremFace, apremAuto,
    sig1: center(sigHeads[0]), sig2: center(sigHeads[1]), colHalf, sigHalf,
  };

  const mois = find((it) => it.str === "Mois");
  const label = mois && find((it) => Math.abs(it.y - mois.y) < 3 && it.x > mois.x + 50);
  const nameLbl = find((it) => it.str.startsWith("Alternant"));
  const tot1 = find((it) => it.str.startsWith("Total mensuel"));
  const tot2 = tot1 && find((it) => it.str === "réalisées" && it.y < tot1.y);

  return {
    label: label ? label.str : dates[0].str.slice(3),
    dates,
    cols,
    nameY: nameLbl ? nameLbl.y : null,
    totalY: tot1 ? (tot2 ? (tot1.y + tot2.y) / 2 : tot1.y) - 0.5 : null,
    fait: blankAfter(find((it) => it.str.startsWith("Fait à"))),
    resp: blankAfter(find((it) => it.str.startsWith("Le Responsable"))),
  };
}

// Position où commencent les "_ _ _" d'un libellé du type "Fait à Bordeaux, le _ _ _ _".
function blankAfter(it) {
  if (!it) return null;
  const idx = it.str.indexOf("_");
  if (idx < 0) return { x: it.x + it.w + 3, y: it.y };
  const tail = it.str.length - idx;
  const weight = idx + tail * 0.8; // les "_ " sont plus étroits que les lettres
  return { x: it.x + (it.w * idx) / weight + 3, y: it.y };
}

// ---------- signature ----------

// Recadre la signature et rend le fond blanc transparent.
function prepareSignature(src) {
  if (sigCache && sigCache.src === src) return Promise.resolve(sigCache);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const px = data.data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
          const alpha = Math.min(px[i + 3], 255 - lum) * (255 / 200);
          px[i + 3] = Math.max(0, Math.min(255, alpha));
          if (px[i + 3] > 40) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return reject(new Error("signature vide"));
      ctx.putImageData(data, 0, 0);
      const pad = 4;
      const w = x1 - x0 + 1 + pad * 2;
      const h = y1 - y0 + 1 + pad * 2;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d").drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, w, h);
      sigCache = { src, dataUrl: out.toDataURL("image/png"), ratio: w / h };
      resolve(sigCache);
    };
    img.onerror = () => reject(new Error("image de signature illisible"));
    img.src = src;
  });
}

function currentSig() {
  return state.sig || window.DEFAULT_SIGNATURE;
}

// ---------- génération ----------

async function buildPdf() {
  const page = pages.find((p) => p.index === Number($("month").value));
  if (!page) throw new Error("aucun mois sélectionné");
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  const src = await PDFDocument.load(templateBytes);
  const doc = await PDFDocument.create();
  const [pdfPage] = await doc.copyPages(src, [page.index]);
  doc.addPage(pdfPage);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sig = await prepareSignature(currentSig());
  const sigImg = await doc.embedPng(sig.dataUrl);
  const black = rgb(0, 0, 0);
  const c = page.cols;

  const text = (str, x, y, size = FONT_SIZE) => pdfPage.drawText(str, { x, y, size, font, color: black });
  const inCol = (str, colCenter, y) => text(str, colCenter - c.colHalf + 3, y);
  const signAt = (colCenter, y) => {
    const h = 15;
    const w = Math.min(h * sig.ratio, c.sigHalf * 2 - 8);
    const hh = w / sig.ratio;
    pdfPage.drawImage(sigImg, { x: colCenter - w / 2, y: y + 2.6 - hh / 2, width: w, height: hh });
  };

  if (state.name && page.nameY != null) text(state.name, c.matinFace - c.colHalf + 5, page.nameY, 7);
  if (page.fait) text(state.faitLe || today(), page.fait.x, page.fait.y + 1, 6.5);
  if (state.responsable && page.resp) text(state.responsable, page.resp.x, page.resp.y + 1, 6.5);

  let total = 0;
  for (const d of page.dates) {
    const h = state.hours[d.str];
    if (!h) continue;
    const m = num(h.m), a = num(h.a);
    if (!m && !a) continue;
    total += m + a;
    inCol(fmtH(m + a), c.total, d.y);
    if (m) {
      inCol(fmtH(m), (h.autoM ?? h.auto) ? c.matinAuto : c.matinFace, d.y);
      signAt(c.sig1, d.y);
    }
    if (a) {
      inCol(fmtH(a), (h.autoA ?? h.auto) ? c.apremAuto : c.apremFace, d.y);
      signAt(c.sig2, d.y);
    }
  }
  if (page.totalY != null) inCol(fmtH(total), c.total, page.totalY);

  return { bytes: await doc.save(), label: page.label };
}

function fileName(label) {
  const clean = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
  return ["fiche_presence", clean(label), clean(state.name)].filter(Boolean).join("_") + ".pdf";
}

// ---------- interface ----------

function renderMonths() {
  const sel = $("month");
  sel.innerHTML = "";
  for (const p of pages) {
    const o = document.createElement("option");
    o.value = p.index;
    o.textContent = p.label;
    sel.appendChild(o);
  }
  // Par défaut : le mois précédent en début de mois, sinon le mois en cours.
  let wanted = state.month;
  if (wanted == null || !pages.some((p) => p.index === wanted)) {
    const now = new Date();
    const ref = new Date(now.getFullYear(), now.getMonth() - (now.getDate() <= 15 ? 1 : 0), 1);
    const match = pages.find((p) => {
      const d = parseDate(p.dates[0].str);
      return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    });
    wanted = (match || pages[0]).index;
  }
  sel.value = wanted;
}

function renderDays() {
  const page = pages.find((p) => p.index === Number($("month").value));
  const tbody = document.querySelector("#days tbody");
  tbody.innerHTML = "";
  if (!page) return;
  for (const d of page.dates) {
    const date = parseDate(d.str);
    const h = state.hours[d.str] || {};
    const tr = document.createElement("tr");
    tr.dataset.date = d.str;
    if (date.getDay() === 0 || date.getDay() === 6) tr.classList.add("we");
    tr.innerHTML = `
      <td class="date"><small>${DAYS[date.getDay()]}</small>${d.str.slice(0, 5)}</td>
      <td class="half"><input type="number" min="0" max="12" step="0.5" data-k="m" value="${h.m || ""}"><label class="auto" title="Matin en autonomie"><input type="checkbox" data-k="autoM" ${(h.autoM ?? h.auto) ? "checked" : ""}>auto</label></td>
      <td class="half"><input type="number" min="0" max="12" step="0.5" data-k="a" value="${h.a || ""}"><label class="auto" title="Après-midi en autonomie"><input type="checkbox" data-k="autoA" ${(h.autoA ?? h.auto) ? "checked" : ""}>auto</label></td>
      <td class="presets row"><button data-p="4,4">8</button><button data-p="0,4">ap. 4</button><button data-p="4,0">mat. 4</button><button data-p="0,0">×</button></td>
      <td class="t"></td>`;
    tbody.appendChild(tr);
  }
  refreshTotals();
}

function readRow(tr) {
  const get = (k) => tr.querySelector(`[data-k="${k}"]`);
  const m = num(get("m").value), a = num(get("a").value);
  const autoM = get("autoM").checked, autoA = get("autoA").checked;
  if (m || a) state.hours[tr.dataset.date] = { m, a, autoM, autoA };
  else delete state.hours[tr.dataset.date];
}

function refreshTotals() {
  let total = 0;
  for (const tr of document.querySelectorAll("#days tbody tr")) {
    const h = state.hours[tr.dataset.date];
    const t = h ? num(h.m) + num(h.a) : 0;
    total += t;
    tr.querySelector(".t").textContent = t ? fmtH(t) : "";
    tr.classList.toggle("on", t > 0);
  }
  $("total").textContent = fmtH(total);
}

function bindUi() {
  for (const k of ["name", "responsable", "faitLe"]) {
    $(k).value = state[k] || "";
    $(k).addEventListener("input", () => { state[k] = $(k).value.trim(); save(); });
  }
  if (!state.faitLe) $("faitLe").placeholder = today();

  $("month").addEventListener("change", () => { state.month = Number($("month").value); save(); renderDays(); });

  const tbody = document.querySelector("#days tbody");
  tbody.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    readRow(tr);
    save();
    refreshTotals();
  });
  tbody.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]");
    if (!b) return;
    const tr = b.closest("tr");
    const [m, a] = b.dataset.p.split(",");
    tr.querySelector('[data-k="m"]').value = m === "0" ? "" : m;
    tr.querySelector('[data-k="a"]').value = a === "0" ? "" : a;
    readRow(tr);
    save();
    refreshTotals();
  });

  $("fillWeek").addEventListener("click", () => {
    for (const tr of tbody.querySelectorAll("tr:not(.we)")) {
      if (state.hours[tr.dataset.date]) continue;
      tr.querySelector('[data-k="m"]').value = 4;
      tr.querySelector('[data-k="a"]').value = 4;
      readRow(tr);
    }
    save();
    refreshTotals();
  });
  $("clearAll").addEventListener("click", () => {
    for (const tr of tbody.querySelectorAll("tr")) delete state.hours[tr.dataset.date];
    save();
    renderDays();
  });

  $("sigPreview").src = currentSig();
  $("sigFile").addEventListener("change", () => {
    const f = $("sigFile").files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { state.sig = r.result; save(); $("sigPreview").src = currentSig(); };
    r.readAsDataURL(f);
  });
  $("sigReset").addEventListener("click", () => { state.sig = null; save(); $("sigPreview").src = currentSig(); });

  $("tplFile").addEventListener("change", async () => {
    const f = $("tplFile").files[0];
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (await loadTemplate(bytes, f.name)) {
      try { localStorage.setItem(TPL_KEY, JSON.stringify({ name: f.name, b64: bytesToB64(bytes) })); } catch { /* trop gros : gardé pour cette session */ }
    }
  });
  $("tplReset").addEventListener("click", async () => {
    try { localStorage.removeItem(TPL_KEY); } catch {}
    await loadTemplate(b64ToBytes(window.DEFAULT_TEMPLATE_B64), "modèle par défaut");
  });

  $("preview").addEventListener("click", () => run(false));
  $("generate").addEventListener("click", () => run(true));
}

let lastUrl = null;
async function run(download) {
  try {
    setStatus("Génération…");
    const { bytes, label } = await buildPdf();
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const frame = $("frame");
    frame.hidden = false;
    frame.src = lastUrl;
    if (download) {
      const a = document.createElement("a");
      a.href = lastUrl;
      a.download = fileName(label);
      a.click();
      setStatus("PDF téléchargé : " + a.download);
    } else {
      setStatus("Aperçu de " + label);
      frame.scrollIntoView({ behavior: "smooth" });
    }
  } catch (e) {
    console.error(e);
    setStatus("Erreur : " + e.message);
  }
}

async function loadTemplate(bytes, name) {
  try {
    const found = await analyseTemplate(bytes);
    if (!found.length) throw new Error("aucune page de fiche reconnue dans ce PDF");
    templateBytes = bytes;
    pages = found;
    $("tplInfo").textContent = `${name} — ${pages.length} mois (${pages[0].label} → ${pages[pages.length - 1].label})`;
    renderMonths();
    renderDays();
    return true;
  } catch (e) {
    console.error(e);
    setStatus("Modèle illisible : " + e.message);
    return false;
  }
}

(async function init() {
  bindUi();
  let custom = null;
  try { custom = JSON.parse(localStorage.getItem(TPL_KEY) || "null"); } catch {}
  if (custom && (await loadTemplate(b64ToBytes(custom.b64), custom.name))) return;
  await loadTemplate(b64ToBytes(window.DEFAULT_TEMPLATE_B64), "modèle par défaut");
})();
