"use strict";

// ---------- State ----------
const state = {
  img: null,          // HTMLImageElement
  fileName: "frame",
  panels: 2,
  direction: "vertical",   // "vertical" = side-by-side slices, "horizontal" = stacked slices
  aspect: "original",      // "original" or panel width/height ratio as a number string
  format: "image/png",
  quality: 0.92,
};

const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone"), fileInput = $("fileInput"), workspace = $("workspace");
const previewImg = $("previewImg"), guides = $("guides"), results = $("results");
const toast = $("toast");

function showToast(msg, ms = 2600) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.hidden = true), ms);
}

// ---------- Image loading ----------
function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("⚠️ That file is not an image."); return; }
  state.fileName = (file.name || "frame").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "frame";
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.img = img;
    previewImg.src = url;
    dropzone.hidden = true;
    workspace.hidden = false;
    render();
    showToast(`✅ Loaded ${img.naturalWidth} × ${img.naturalHeight}px — pick your panels!`);
  };
  img.onerror = () => showToast("⚠️ Could not read that image. Try a JPG or PNG.");
  img.src = url;
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });
fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));
$("changeBtn").addEventListener("click", () => fileInput.click());

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("dragging"); }));
dropzone.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});

// ---------- Controls ----------
$("panelsRange").addEventListener("input", (e) => setPanels(Number(e.target.value)));
function setPanels(n) {
  state.panels = n;
  $("panelsRange").value = n;
  $("panelsValue").textContent = n;
  $("orderEnd").textContent = n;
  document.querySelectorAll("#panelsQuick .chip").forEach((c) =>
    c.classList.toggle("active", Number(c.dataset.panels) === n));
  render();
}
$("panelsQuick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-panels]"); if (b) setPanels(Number(b.dataset.panels));
});

$("directionSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-dir]"); if (!b) return;
  state.direction = b.dataset.dir;
  document.querySelectorAll("#directionSeg button").forEach((x) => x.classList.toggle("active", x === b));
  render();
});

$("aspectSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-aspect]"); if (!b) return;
  state.aspect = b.dataset.aspect;
  document.querySelectorAll("#aspectSeg button").forEach((x) => x.classList.toggle("active", x === b));
  render();
});

$("formatSelect").addEventListener("change", (e) => {
  state.format = e.target.value;
  $("qualityWrap").hidden = state.format === "image/png";
  render();
});
$("qualityRange").addEventListener("input", (e) => {
  state.quality = Number(e.target.value) / 100;
  $("qualityValue").textContent = `${e.target.value}%`;
  render();
});

$("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  $("themeToggle").textContent = document.body.classList.contains("light") ? "☀️" : "🌙";
});

// ---------- Core slicing maths ----------
// Returns the source rectangle to use (after any centre-crop for shaped panels).
function sourceRect() {
  const W = state.img.naturalWidth, H = state.img.naturalHeight;
  if (state.aspect === "original") return { sx: 0, sy: 0, sw: W, sh: H };
  const r = Number(state.aspect); // one panel's width / height
  const totalRatio = state.direction === "vertical" ? r * state.panels : r / state.panels; // total width / height
  const imgRatio = W / H;
  if (imgRatio > totalRatio) { // image too wide -> crop width
    const sw = Math.round(H * totalRatio);
    return { sx: Math.round((W - sw) / 2), sy: 0, sw, sh: H };
  }
  const sh = Math.round(W / totalRatio);
  return { sx: 0, sy: Math.round((H - sh) / 2), sw: W, sh };
}

function sliceBounds(total, n, i) {
  const start = Math.floor((total * i) / n);
  const end = Math.floor((total * (i + 1)) / n);
  return { start, size: end - start };
}

function ext() { return state.format === "image/png" ? "png" : state.format === "image/webp" ? "webp" : "jpg"; }

function render() {
  if (!state.img) return;
  const { sx, sy, sw, sh } = sourceRect();
  const n = state.panels, vert = state.direction === "vertical";

  $("imageMeta").textContent =
    `Original: ${state.img.naturalWidth} × ${state.img.naturalHeight}px` +
    (state.aspect === "original" ? "" : ` · cropped area: ${sw} × ${sh}px`);

  // --- guides over preview ---
  guides.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const num = document.createElement("span");
    num.className = "guide-num";
    num.textContent = i + 1;
    if (vert) { num.style.left = `calc(${(i * 100) / n}% + 6px)`; num.style.top = "6px"; }
    else { num.style.top = `calc(${(i * 100) / n}% + 6px)`; num.style.left = "6px"; }
    guides.appendChild(num);
    if (i > 0) {
      const g = document.createElement("div");
      g.className = "guide " + (vert ? "v" : "h");
      if (vert) g.style.left = `${(i * 100) / n}%`; else g.style.top = `${(i * 100) / n}%`;
      guides.appendChild(g);
    }
  }

  // --- slice canvases ---
  results.innerHTML = "";
  let panelSize = "";
  for (let i = 0; i < n; i++) {
    let cx, cy, cw, ch;
    if (vert) { const b = sliceBounds(sw, n, i); cx = sx + b.start; cy = sy; cw = b.size; ch = sh; }
    else { const b = sliceBounds(sh, n, i); cx = sx; cy = sy + b.start; cw = sw; ch = b.size; }
    panelSize = `${cw} × ${ch}px`;

    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    canvas.getContext("2d").drawImage(state.img, cx, cy, cw, ch, 0, 0, cw, ch);

    const dataUrl = canvas.toDataURL(state.format, state.quality);
    const kb = Math.max(1, Math.round(((dataUrl.length - dataUrl.indexOf(",")) * 3) / 4 / 1024));
    const file = `${state.fileName}_part${i + 1}_of_${n}.${ext()}`;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>Part ${i + 1} of ${n}</h3><p class="dims">${cw} × ${ch}px · ~${kb} KB</p>`;
    card.appendChild(canvas);
    const a = document.createElement("a");
    a.className = "dl-btn"; a.textContent = `⬇ Download Part ${i + 1}`;
    a.href = dataUrl; a.download = file; a.dataset.file = file;
    card.appendChild(a);
    results.appendChild(card);
  }
  $("panelMeta").textContent = `${n} panels · each ${panelSize} · post in order 1 → ${n}`;
}

// ---------- Download all ----------
$("downloadAllBtn").addEventListener("click", () => {
  const links = [...results.querySelectorAll("a.dl-btn")];
  if (!links.length) return;
  showToast(`⬇ Downloading all ${links.length} panels — allow multiple downloads if your browser asks.`, 3600);
  links.forEach((a, i) => setTimeout(() => a.click(), i * 450));
});
