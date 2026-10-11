import * as C from './calc.js';
import * as S from './store.js';
import { analyze } from './gemini.js';
import { lookup } from './off.js';
import { fetchSteps, gistIdFrom } from './sync.js';

// === Utilitaires ===
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
const fmt = n => Math.round(n).toLocaleString('fr-FR'); // 1 240
const fmt1 = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); // 85,0
const num = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }); // 78 ou 78,5
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt1(Math.abs(n));
const optNum = v => (v === '' || v == null ? undefined : +v);
const now = () => new Date().toTimeString().slice(0, 5);
const toDate = d => new Date(`${d}T12:00`);
const shortDate = d => toDate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); // 11 oct.
const goalDate = weeks => new Date(Date.now() + weeks * 7 * 864e5).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
function fillForm(f, obj) {
  for (const [k, v] of Object.entries(obj || {})) if (f.elements[k]) f.elements[k].value = v ?? '';
}
const svg = (d, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  dumbbell: svg('<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>', 'i muted'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
};

let state = S.load();
let today = C.ymd();
let date = today;
function commit() {
  S.save(state);
  render();
}

document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });

// === Profil ===
const rateLabel = r => (r === 0 ? 'Maintien' : `${r > 0 ? '+' : '−'}${String(Math.abs(r)).replace('.', ',')}`);
$('.rate-chips').innerHTML = C.RATES.map(r =>
  `<label><input type="radio" name="rateKgPerWeek" value="${r}"${r === -0.5 ? ' checked' : ''}><span>${rateLabel(r)}</span></label>`).join('');
$('.rate-select').innerHTML = C.RATES.map(r =>
  `<option value="${r}">${r === 0 ? 'Maintien' : `${rateLabel(r)} kg / semaine`}</option>`).join('');

function readProfile(f) {
  const d = new FormData(f);
  return {
    sex: d.get('sex'),
    age: +d.get('age'),
    heightCm: +d.get('heightCm'),
    goalKg: +d.get('goalKg'),
    rateKgPerWeek: +d.get('rateKgPerWeek'),
  };
}

// === Navigation ===
function show(view) {
  if (view === 'settings') fillSettings();
  for (const v of ['day', 'weight', 'settings']) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs [data-view]').forEach(b => { b.onclick = () => show(b.dataset.view); });

// === Journée ===
function render() {
  if (!state.profile || !state.weights.length) return;
  renderDay();
  renderWeight();
}

function ring(frac, big, small) {
  const r = 52, c = 2 * Math.PI * r, f = Math.min(Math.max(frac, 0), 1);
  return `<svg viewBox="0 0 120 120" class="ring${frac > 1 ? ' over' : ''}" role="img" aria-label="${big} ${small}">
    <circle cx="60" cy="60" r="${r}" class="track"/>
    ${f > 0 ? `<circle cx="60" cy="60" r="${r}" class="fill" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 60 60)"/>` : ''}
    <text x="60" y="60" class="big">${big}</text><text x="60" y="76" class="small">${small}</text></svg>`;
}

function macro(label, val, max) {
  const pct = max ? Math.min(100, (val / max) * 100) : 0;
  return `<div class="macro"><span>${label}</span><div class="bar"><i style="width:${pct}%"></i></div>
    <b>${fmt(val)} <span>/ ${fmt(max)} g</span></b></div>`;
}

function syncText(long) {
  if (!state.settings.gistId) return '';
  if (syncFailed) return 'Synchro des pas impossible';
  if (!state.stepsSyncedAt) return '';
  const at = new Date(state.stepsSyncedAt);
  const day = C.ymd(at) === today ? (long ? "aujourd'hui " : '') : `le ${shortDate(C.ymd(at))} `;
  return `${long ? 'Dernier passage du raccourci : ' : 'Pas de Santé mis à jour '}${day}à ${at.toTimeString().slice(0, 5)}`;
}
function renderSync(el, long = false) {
  const text = syncText(long);
  el.classList.toggle('bad', syncFailed);
  el.innerHTML = text && `${syncFailed ? ICON.alert : ICON.check}${esc(text)}`;
}

function renderDay() {
  const day = S.day(state, date);
  const p = C.dayPlan(state.profile, state.weights, day);
  const left = p.target.kcal - p.eaten.kcal;
  const weekday = toDate(date).toLocaleDateString('fr-FR', { weekday: 'long' });
  $('#day-label').textContent = date === today ? "Aujourd'hui"
    : date === C.addDays(today, -1) ? 'Hier' : weekday[0].toUpperCase() + weekday.slice(1);
  $('#day-sub').textContent = toDate(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#next').disabled = date >= today;
  $('#ring').innerHTML = ring(p.eaten.kcal / p.target.kcal, fmt(Math.abs(left)), left >= 0 ? 'kcal restantes' : 'kcal en trop');
  $('#ring-sub').innerHTML = `<span><b>${fmt(p.eaten.kcal)}</b> mangées</span><span><b>${fmt(p.target.kcal)}</b> objectif</span>`;
  $('#floor-warn').hidden = !p.target.floored;
  $('#macros').innerHTML = [['Protéines', 'protein'], ['Glucides', 'carbs'], ['Lipides', 'fat']]
    .map(([label, k]) => macro(label, p.eaten[k], p.macros[k])).join('');
  $('#burn').textContent = `Dépense : base ${fmt(p.bmr)} + pas ${fmt(p.steps)} + exercice ${fmt(p.exercise)} + digestion ${fmt(p.digestion)}`;
  if (document.activeElement !== $('#steps')) $('#steps').value = day.steps || '';
  renderSync($('#sync-status'));
  $('#meals').innerHTML = day.meals.map(m => `<li data-id="${esc(m.id)}"><button class="row-main">
    <span class="time">${esc(m.time)}</span><span class="name">${esc(m.name)}</span><span class="kcal">${fmt(m.kcal)} kcal</span></button></li>`)
    .join('') || '<li class="empty">Aucun repas</li>';
  $('#exercises').innerHTML = day.exercises.map(x => `<li data-id="${esc(x.id)}"><button class="row-main">${ICON.dumbbell}
    <span class="name">${esc(x.name)}${x.minutes ? ` <small>· ${esc(x.minutes)} min</small>` : ''}</span><span class="kcal">${fmt(x.kcal)} kcal</span></button></li>`)
    .join('') || '<li class="empty">Aucune séance</li>';
}

$('#prev').onclick = () => { date = C.addDays(date, -1); render(); };
$('#next').onclick = () => { if (date < today) { date = C.addDays(date, 1); render(); } };

function setSteps(n) {
  S.day(state, date).steps = n;
  commit();
}
$('#steps').onchange = e => {
  const n = e.target.value === '' ? 0 : C.parseSteps(e.target.value);
  if (n == null) { alert('Nombre de pas invalide (0 à 100 000).'); return render(); }
  setSteps(n);
};
$('#paste-steps').onclick = async () => {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* refusé ou vide */ }
  const n = C.parseSteps(text);
  if (n == null) return alert('Aucun nombre de pas dans le presse-papiers.');
  setSteps(n);
};

let syncFailed = false;
async function syncSteps() {
  if (!state.settings.gistId) return;
  try {
    const { days, updatedAt } = await fetchSteps(state.settings.gistId);
    for (const [d, n] of Object.entries(days)) S.day(state, d).steps = n; // Santé fait foi
    state.stepsSyncedAt = updatedAt;
    syncFailed = false;
  } catch {
    syncFailed = true;
  }
  commit();
}

// === Premier lancement ===
$('#dlg-onboard').oncancel = e => e.preventDefault();

// Aperçu : jour de repos (5 000 pas) et jour de muscu (8 000 pas + 1 h de musculation classique).
function renderPreview() {
  const f = $('#onboard-form');
  if (!f.checkValidity()) return void ($('#onboard-preview').innerHTML = '');
  const d = new FormData(f);
  const profile = readProfile(f);
  const kg = +d.get('kg');
  const weights = [{ date: today, kg, fatPct: optNum(d.get('fatPct')) }];
  const kcal = (steps, exercises) => fmt(C.dayPlan(profile, weights, { steps, exercises, meals: [] }).target.kcal);
  const muscu = C.EXERCISES.find(x => x.key === 'muscu');
  const weeks = C.weeksToGoal(kg, profile.goalKg, profile.rateKgPerWeek);
  const goal = weeks == null ? `<span>Objectif ${num(profile.goalKg)} kg</span><b>pas de date</b>`
    : weeks === 0 ? '<span>Objectif</span><b>déjà atteint</b>'
      : `<span>${num(profile.goalKg)} kg atteints vers le</span><b>${goalDate(weeks)}</b>`;
  $('#onboard-preview').innerHTML = `<strong>Aperçu</strong>
    <div><span>Jour de repos (5 000 pas)</span><b>≈ ${kcal(5000, [])} kcal</b></div>
    <div><span>Jour de muscu (8 000 pas + 1 h)</span><b>≈ ${kcal(8000, [{ kcal: C.exerciseKcal(muscu.met, 60, kg) }])} kcal</b></div>
    <div>${goal}</div>`;
}
$('#onboard-form').oninput = renderPreview;

$('#onboard-form').onsubmit = e => {
  e.preventDefault();
  const d = new FormData(e.target);
  state.profile = readProfile(e.target);
  S.upsertWeight(state, { date: today, kg: +d.get('kg'), fatPct: optNum(d.get('fatPct')) });
  $('#dlg-onboard').close();
  commit();
};

// === Repas ===
const NUM_FIELDS = [['grams', 'g'], ['kcal', 'kcal'], ['protein', 'P'], ['carbs', 'G'], ['fat', 'L']];
const CONFIDENCE = { low: 'Confiance faible', medium: 'Confiance moyenne', high: 'Confiance élevée' };
const pick = it => ({ grams: +it.grams || 0, kcal: +it.kcal || 0, protein: +it.protein || 0, carbs: +it.carbs || 0, fat: +it.fat || 0 });
const withBase = it => ({ name: it.name || '', ...pick(it), base: pick(it) });
const emptyItem = name => ({ name, grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 });
let editing = null; // { id?, time?, items: [{ name, grams, kcal, protein, carbs, fat, base }] }

// confidence : 'low' | 'medium' | 'high' quand le repas vient du scan IA, sinon rien.
function openMeal(meal, confidence) {
  editing = { id: meal.id, time: meal.time, items: meal.items.map(withBase) };
  const f = $('#meal-form');
  f.reset();
  f.elements.name.value = meal.name || '';
  const conf = Object.hasOwn(CONFIDENCE, confidence) ? confidence : '';
  $('#meal-conf').className = `conf ${conf}`;
  $('#meal-conf').textContent = CONFIDENCE[conf] || '';
  $('#meal-conf').hidden = !conf;
  $('#meal-help').textContent = conf === 'low'
    ? 'Vérifie bien les quantités : corrige les grammes, calories et macros se recalculent.'
    : 'Corrige les grammes : calories et macros se recalculent.';
  $('#meal-delete').hidden = !meal.id;
  renderItems();
  $('#dlg-meal').showModal();
  $('#dlg-meal .scroll').scrollTop = 0;
}

function renderItems() {
  $('#meal-items').innerHTML = editing.items.map((it, i) => `<div class="item" data-i="${i}">
    <div class="item-top"><input data-k="name" value="${esc(it.name)}" placeholder="Aliment" aria-label="Aliment">
      <button type="button" data-del aria-label="Retirer l'aliment">${ICON.x}</button></div>
    <div class="item-nums">${NUM_FIELDS.map(([k, l]) => `<label>${l}<input data-k="${k}" type="number" inputmode="decimal" step="any" min="0" value="${r1(it[k])}"></label>`).join('')}</div>
  </div>`).join('');
  renderTotal();
}

function renderTotal() {
  const t = C.totals(editing.items);
  $('#meal-total').innerHTML = `<b>${fmt(t.kcal)} kcal</b><span>P ${fmt(t.protein)} g · G ${fmt(t.carbs)} g · L ${fmt(t.fat)} g</span>`;
}

$('#meal-items').oninput = e => {
  const row = e.target.closest('.item');
  if (!row) return;
  const it = editing.items[row.dataset.i];
  const k = e.target.dataset.k;
  if (k === 'name') { it.name = e.target.value; return; }
  const v = Number(e.target.value) || 0;
  if (k === 'grams') {
    Object.assign(it, C.scaleItem(it.base, v));
    for (const [f] of NUM_FIELDS.slice(1)) row.querySelector(`[data-k=${f}]`).value = r1(it[f]);
  } else {
    it[k] = v;
    it.base = pick(it); // une valeur saisie à la main devient la nouvelle référence
  }
  renderTotal();
};

$('#meal-items').onclick = e => {
  if (!e.target.closest('[data-del]')) return;
  editing.items.splice(e.target.closest('.item').dataset.i, 1);
  renderItems();
};
$('#meal-add-item').onclick = () => { editing.items.push(withBase(emptyItem(''))); renderItems(); };
$('#meal-cancel').onclick = () => $('#dlg-meal').close();

$('#meal-form').onsubmit = e => {
  e.preventDefault();
  if (!editing.items.length) return alert('Ajoute au moins un aliment.');
  const f = e.target;
  const items = editing.items.map(({ base, ...it }) => it);
  const meal = { id: editing.id || crypto.randomUUID(), time: editing.time || now(), name: f.elements.name.value.trim(), items, ...C.totals(items) };
  const day = S.day(state, date);
  const i = day.meals.findIndex(m => m.id === meal.id);
  if (i >= 0) day.meals[i] = meal; else day.meals.push(meal);
  if (f.elements.fav.checked) state.favorites.push({ ...meal, id: crypto.randomUUID() });
  $('#dlg-meal').close();
  commit();
};

$('#meal-delete').onclick = () => {
  const day = S.day(state, date);
  day.meals = day.meals.filter(m => m.id !== editing.id);
  $('#dlg-meal').close();
  commit();
};

$('#meals').onclick = e => {
  const id = e.target.closest('li')?.dataset.id;
  const m = id && S.day(state, date).meals.find(x => x.id === id);
  if (m) openMeal(m);
};

// === Ajouter : menu, manuel, favoris ===
function renderFavorites() {
  $('#favorites').innerHTML = state.favorites.map(f => `<li data-id="${esc(f.id)}">
    <button class="row-main"><span class="name">${esc(f.name)}</span><span class="kcal">${fmt(f.kcal)} kcal</span></button>
    <button data-del aria-label="Supprimer le favori ${esc(f.name)}">${ICON.x}</button></li>`)
    .join('') || '<li class="empty">Aucun favori</li>';
}

$('#add').onclick = () => { renderFavorites(); $('#dlg-add').showModal(); };
$('#open-manual').onclick = () => { $('#dlg-add').close(); openMeal({ name: '', items: [emptyItem('')] }); };

$('#favorites').onclick = e => {
  const id = e.target.closest('li')?.dataset.id;
  if (!id) return;
  if (e.target.closest('[data-del]')) {
    state.favorites = state.favorites.filter(f => f.id !== id);
    S.save(state);
    return renderFavorites();
  }
  const fav = state.favorites.find(f => f.id === id);
  S.day(state, date).meals.push({ ...fav, id: crypto.randomUUID(), time: now() });
  $('#dlg-add').close();
  commit();
};

// === Scan IA ===
async function scaledCanvas(file, max, rotate = false) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const c = document.createElement('canvas');
  [c.width, c.height] = rotate ? [h, w] : [w, h];
  const g = c.getContext('2d');
  if (rotate) { g.translate(h, 0); g.rotate(Math.PI / 2); }
  g.drawImage(img, 0, 0, w, h);
  return c;
}

async function toJpegBase64(file) {
  return (await scaledCanvas(file, 1024)).toDataURL('image/jpeg', 0.8).split(',')[1];
}

let scanFile = null;
function showScanPhoto(file) {
  scanFile = file;
  const img = $('#scan-preview');
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = file ? URL.createObjectURL(file) : '';
  img.hidden = !file;
  $('#scan-placeholder').hidden = !!file;
  $('#scan-photo-label').textContent = file ? 'Reprendre la photo' : 'Prendre la photo';
  $('#scan-go').disabled = !file;
}

$('#open-scan').onclick = () => {
  $('#dlg-add').close();
  if (!state.settings.apiKey) {
    show('settings');
    return alert('Ajoute ta clé Gemini dans les réglages.');
  }
  showScanPhoto(null);
  $('#scan-desc').value = '';
  $('#scan-status').textContent = '';
  $('#dlg-scan').showModal();
};

$('#scan-photo').onchange = e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) showScanPhoto(file);
};

$('#scan-go').onclick = async () => {
  $('#scan-go').disabled = true;
  $('#scan-status').textContent = 'Analyse en cours…';
  try {
    const base64 = await toJpegBase64(scanFile);
    const r = await analyze({ apiKey: state.settings.apiKey, model: state.settings.model, base64, description: $('#scan-desc').value.trim() });
    if (!$('#dlg-scan').open) return;
    $('#dlg-scan').close();
    openMeal({ name: r.dish, items: r.items }, r.confidence);
  } catch (err) {
    $('#scan-status').textContent = err.message;
    $('#scan-go').disabled = false;
  }
};

// === Code-barres ===
const bcStatus = t => { $('#bc-status').textContent = t; };
const noCamera = () => { bcStatus(NO_CAMERA); $('.scanner').hidden = true; };
const NO_CAMERA = 'Caméra indisponible : prends une photo du code ou saisis-le.';
let camStream = null, camRun = 0, zxing = null;

// Pas de BrowserMultiFormatReader pour la vidéo : avec TRY_HARDER, son canvas de capture partagé
// se corrompt après le premier échec (0.21.3) et plus rien n'est lu. On décode donc nous-mêmes.
function decodeCanvas(c) {
  if (!zxing) {
    const H = ZXing.DecodeHintType, F = ZXing.BarcodeFormat;
    zxing = new ZXing.MultiFormatReader();
    zxing.setHints(new Map([
      [H.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128]],
      [H.TRY_HARDER, true],
    ]));
  }
  try {
    return zxing.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)))).getText();
  } catch {
    return null; // aucun code sur cette image
  }
}

function stopCamera() {
  camRun++;
  camStream?.getTracks().forEach(t => t.stop());
  camStream = null;
  $('#bc-video').srcObject = null;
}

async function startCamera() {
  const run = ++camRun;
  const v = $('#bc-video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
    if (run !== camRun) return stream.getTracks().forEach(t => t.stop()); // fermé entre-temps
    camStream = v.srcObject = stream;
    await v.play();
  } catch {
    if (run === camRun) noCamera();
    return;
  }
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  const r = document.createElement('canvas');
  const rg = r.getContext('2d', { willReadFrequently: true });
  let last = null;
  const tick = () => {
    if (run !== camRun) return;
    if (v.videoWidth) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      g.drawImage(v, 0, 0);
      // Codes-barres verticaux : on essaie aussi l'image tournée de 90°
      r.width = c.height;
      r.height = c.width;
      rg.translate(r.width, 0);
      rg.rotate(Math.PI / 2);
      rg.drawImage(c, 0, 0);
      const code = decodeCanvas(c) || decodeCanvas(r);
      // Accepté seulement s'il est lu deux fois de suite à l'identique (évite les erreurs de lecture)
      if (code && code === last) return gotCode(code);
      last = code;
    }
    setTimeout(tick, 100);
  };
  tick();
}

// Photo : réduite à 1280 px (les photos de 12 Mpx échouent), puis tournée de 90° si besoin.
async function decodePhoto(file) {
  for (const rotate of [false, true]) {
    const code = decodeCanvas(await scaledCanvas(file, 1280, rotate));
    if (code) return code;
  }
  return null;
}

async function gotCode(code) {
  stopCamera();
  $('#dlg-barcode').close();
  let item = null;
  let msg = 'Produit inconnu : saisis-le à la main.';
  try { item = await lookup(code); } catch (err) { msg = err.message; }
  if (!item) alert(msg);
  const name = item?.name || `Produit ${code}`;
  openMeal({ name, items: [item || emptyItem(name)] });
}

$('#open-barcode').onclick = () => {
  $('#dlg-add').close();
  $('#bc-form').reset();
  $('#bc-form').hidden = true;
  bcStatus('');
  $('.scanner').hidden = false;
  $('#dlg-barcode').showModal();
  if (navigator.mediaDevices?.getUserMedia) startCamera();
  else noCamera();
};
$('#dlg-barcode').onclose = stopCamera;
$('#bc-cancel').onclick = () => $('#dlg-barcode').close();
$('#bc-manual').onclick = () => { $('#bc-form').hidden = false; $('#bc-form').elements.code.focus(); };
$('#bc-form').onsubmit = e => { e.preventDefault(); gotCode(e.target.elements.code.value); };

$('#bc-photo').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  bcStatus('Lecture du code…');
  const code = await decodePhoto(file).catch(() => null);
  if (code) return gotCode(code);
  bcStatus('Code illisible sur la photo : saisis les chiffres.');
  $('#bc-manual').onclick();
};

// === Exercice ===
const EX_TYPES = [...C.EXERCISES, { key: 'autre', label: 'Autre (kcal saisies)' }];
$('#ex-form').elements.type.innerHTML = EX_TYPES.map(x => `<option value="${x.key}">${x.label}</option>`).join('');
let editingEx = null;

function syncExFields() {
  const f = $('#ex-form');
  const other = f.elements.type.value === 'autre';
  f.querySelector('.ex-min').hidden = other;
  f.querySelector('.ex-kcal').hidden = !other;
  f.elements.minutes.required = !other;
  f.elements.kcal.required = other;
}
$('#ex-form').elements.type.onchange = syncExFields;

function openExercise(ex) {
  editingEx = ex || null;
  const f = $('#ex-form');
  f.reset();
  f.elements.type.value = ex?.type || 'muscu';
  f.elements.minutes.value = ex?.minutes || 60;
  f.elements.kcal.value = ex?.type === 'autre' ? r0(ex.kcal) : '';
  $('#ex-delete').hidden = !ex;
  syncExFields();
  $('#dlg-ex').showModal();
}

$('#add-exercise').onclick = () => openExercise();
$('#exercises').onclick = e => {
  const id = e.target.closest('li')?.dataset.id;
  const x = id && S.day(state, date).exercises.find(v => v.id === id);
  if (x) openExercise(x);
};
$('#ex-cancel').onclick = () => $('#dlg-ex').close();

$('#ex-form').onsubmit = e => {
  e.preventDefault();
  const f = e.target;
  const type = f.elements.type.value;
  const def = C.EXERCISES.find(x => x.key === type);
  const minutes = +f.elements.minutes.value;
  const ex = def
    ? { type, name: def.label, minutes, met: def.met, kcal: C.exerciseKcal(def.met, minutes, C.latest(state.weights).kg) }
    : { type, name: 'Autre', kcal: +f.elements.kcal.value };
  ex.id = editingEx?.id || crypto.randomUUID();
  const day = S.day(state, date);
  const i = day.exercises.findIndex(x => x.id === ex.id);
  if (i >= 0) day.exercises[i] = ex; else day.exercises.push(ex);
  $('#dlg-ex').close();
  commit();
};

$('#ex-delete').onclick = () => {
  const day = S.day(state, date);
  day.exercises = day.exercises.filter(x => x.id !== editingEx.id);
  $('#dlg-ex').close();
  commit();
};

// === Poids ===
const CHARTS = { kg: ['du poids', 'kg'], fatPct: ['de la masse grasse', '%'], musclePct: ['de la masse musculaire', '%'] };

// points : [{ date, v }] ; avg : moyenne 7 jours (courbe du poids seulement)
function chart(points, avg, kind) {
  if (points.length < 2) return '<p class="note">Au moins 2 mesures nécessaires.</p>';
  const vals = points.map(p => p.v);
  const all = avg ? vals.concat(avg) : vals;
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const X = i => (30 + (i / (vals.length - 1)) * 282).toFixed(1);
  const Y = v => (120 - ((v - min) / span) * 100).toFixed(1);
  const line = s => s.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const dots = cls => `<g class="${cls}">${vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="2.5"/>`).join('')}</g>`;
  const [what, unit] = CHARTS[kind];
  const first = esc(shortDate(points[0].date)), last = esc(shortDate(points.at(-1).date));
  return `<svg viewBox="0 0 320 154" class="chart" role="img" aria-label="Courbe ${what} du ${first} au ${last}, de ${fmt1(vals[0])} à ${fmt1(vals.at(-1))} ${unit}">
    <g class="gridl"><line x1="30" y1="20" x2="312" y2="20"/><line x1="30" y1="70" x2="312" y2="70"/><line x1="30" y1="120" x2="312" y2="120"/></g>
    <text x="0" y="23">${fmt1(max)}</text><text x="0" y="73">${fmt1((max + min) / 2)}</text><text x="0" y="123">${fmt1(min)}</text>
    <text x="30" y="148">${first}</text><text x="312" y="148" text-anchor="end">${last}</text>
    ${avg ? `<polyline class="raw" points="${line(vals)}"/>${dots('dots')}<polyline class="avg" points="${line(avg)}"/>`
    : `<polyline class="avg" points="${line(vals)}"/>${dots('dots acc')}`}</svg>`;
}

function renderWeight() {
  const { profile } = state;
  const ws = state.weights;
  const w = C.latest(ws);
  const start = ws[0].kg, total = start - profile.goalKg;
  const pct = total ? Math.min(100, Math.max(0, ((start - w.kg) / total) * 100)) : 100;
  const weeks = C.weeksToGoal(w.kg, profile.goalKg, profile.rateKgPerWeek);
  const when = weeks == null ? 'pas de date (maintien ou mauvais sens)'
    : weeks === 0 ? '<b>objectif atteint</b>' : `vers le <b>${goalDate(weeks)}</b> · ${Math.ceil(weeks)} sem.`;
  $('#goal-info').innerHTML = `<div class="goal-now"><b>${fmt1(w.kg)} kg</b><span>→ ${num(profile.goalKg)} kg</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="goal-foot"><span><b>${signed(w.kg - start)} kg</b> sur ${num(Math.abs(total))}</span><span>${when}</span></div>`;

  const kind = $('[name=chart]:checked').value;
  const points = ws.filter(x => x[kind] != null).map(x => ({ date: x.date, v: +x[kind] }));
  $('#chart').innerHTML = chart(points, kind === 'kg' && C.avg7(ws).map(x => x.kg), kind);
  $('#chart-legend').hidden = kind !== 'kg' || points.length < 2;

  $('#weights').innerHTML = [...ws].reverse().map(x => {
    const extra = [x.fatPct != null && `${fmt1(+x.fatPct)} % MG`, x.musclePct != null && `${fmt1(+x.musclePct)} % MM`].filter(Boolean).join(' · ');
    const d = esc(shortDate(x.date));
    return `<li data-date="${esc(x.date)}"><button class="row-main"><span class="date">${d}</span>
      <span class="name">${fmt1(x.kg)} kg</span><span class="extra">${extra}</span></button>
      <button data-del aria-label="Supprimer la pesée du ${d}">${ICON.x}</button></li>`;
  }).join('');
}
document.querySelectorAll('[name=chart]').forEach(r => { r.onchange = renderWeight; });

$('#weight-form').elements.date.value = today;
$('#weight-form').onsubmit = e => {
  e.preventDefault();
  const d = new FormData(e.target);
  S.upsertWeight(state, { date: d.get('date'), kg: +d.get('kg'), fatPct: optNum(d.get('fatPct')), musclePct: optNum(d.get('musclePct')) });
  e.target.reset();
  e.target.elements.date.value = today;
  commit();
};

$('#weights').onclick = e => {
  const d = e.target.closest('li')?.dataset.date;
  if (!d) return;
  if (e.target.closest('[data-del]')) {
    if (state.weights.length === 1) return alert('Garde au moins une pesée.');
    state.weights = state.weights.filter(w => w.date !== d);
    return commit();
  }
  const f = $('#weight-form');
  f.reset();
  fillForm(f, state.weights.find(w => w.date === d));
  f.scrollIntoView({ behavior: 'smooth' });
};

// === Réglages ===
function fillSettings() {
  fillForm($('#profile-form'), state.profile);
  fillForm($('#api-form'), state.settings);
  fillForm($('#sync-form'), state.settings);
  showKey(false);
  renderSync($('#sync-info'), true);
}

function showKey(on) {
  $('#api-key').type = on ? 'text' : 'password';
  $('#toggle-key').setAttribute('aria-pressed', on);
  $('#toggle-key').setAttribute('aria-label', on ? 'Masquer la clé' : 'Afficher la clé');
}
$('#toggle-key').onclick = () => showKey($('#api-key').type === 'password');

$('#profile-form').onsubmit = e => {
  e.preventDefault();
  state.profile = readProfile(e.target);
  commit();
  alert('Profil enregistré.');
};

$('#api-form').onsubmit = e => {
  e.preventDefault();
  const d = new FormData(e.target);
  state.settings = { ...state.settings, apiKey: d.get('apiKey').trim(), model: d.get('model').trim() || S.DEFAULT_MODEL };
  S.save(state);
  alert('Réglages enregistrés.');
};

$('#sync-form').onsubmit = async e => {
  e.preventDefault();
  state.settings = { ...state.settings, gistId: gistIdFrom(new FormData(e.target).get('gistId')) };
  e.target.elements.gistId.value = state.settings.gistId;
  S.save(state);
  if (!state.settings.gistId) {
    syncFailed = false;
    render();
    fillSettings();
    return alert('Synchro des pas désactivée.');
  }
  await syncSteps();
  fillSettings();
  alert(syncFailed ? 'Synchro des pas impossible : vérifie le gist.' : 'Pas synchronisés.');
};

$('#export').onclick = async () => {
  const file = new File([S.exportJson(state)], `leanfree-${today}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
};

$('#import').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    state = S.importJson(await file.text(), state);
  } catch {
    return alert("Fichier invalide : rien n'a été modifié.");
  }
  S.save(state);
  fillSettings();
  render();
  alert('Données importées.');
};

// === Démarrage ===
show('day');
if (state.profile && state.weights.length) render();
else { $('#dlg-onboard').showModal(); renderPreview(); }
syncSteps();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (C.ymd() !== today) {
    today = date = C.ymd();
    $('#weight-form').elements.date.value = today;
  }
  render();
  syncSteps();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
