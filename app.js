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
const optNum = v => (v === '' || v == null ? undefined : +v);
const now = () => new Date().toTimeString().slice(0, 5);
function fillForm(f, obj) {
  for (const [k, v] of Object.entries(obj || {})) if (f.elements[k]) f.elements[k].value = v ?? '';
}

let state = S.load();
let today = C.ymd();
let date = today;
function commit() {
  S.save(state);
  render();
}

// === Profil ===
const PROFILE_FIELDS = `
  <label>Sexe <select name="sex"><option value="M">Homme</option><option value="F">Femme</option></select></label>
  <label>Âge <input name="age" type="number" min="14" max="100" required></label>
  <label>Taille (cm) <input name="heightCm" type="number" min="120" max="230" required></label>
  <label>Poids visé (kg) <input name="goalKg" type="number" step="0.1" min="30" max="300" required></label>
  <label>Rythme <select name="rateKgPerWeek">${C.RATES.map(r =>
    `<option value="${r}"${r === -0.5 ? ' selected' : ''}>${r === 0 ? 'Maintien' : `${r > 0 ? '+' : ''}${r} kg / semaine`}</option>`).join('')}</select></label>`;
document.querySelectorAll('.profile-fields').forEach(el => { el.innerHTML = PROFILE_FIELDS; });

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
  for (const v of ['day', 'weight', 'settings']) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
}
document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => show(b.dataset.view); });

// === Journée ===
function render() {
  if (!state.profile || !state.weights.length) return;
  renderDay();
}

function ring(frac, big, small) {
  const r = 52, c = 2 * Math.PI * r, f = Math.min(Math.max(frac, 0), 1);
  return `<svg viewBox="0 0 120 120" class="ring${frac > 1 ? ' over' : ''}">
    <circle cx="60" cy="60" r="${r}" class="track"/>
    <circle cx="60" cy="60" r="${r}" class="fill" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" class="big">${big}</text><text x="60" y="78" class="small">${small}</text></svg>`;
}

function bar(label, val, max) {
  const pct = max ? Math.min(100, (val / max) * 100) : 0;
  return `<div class="bar"><span>${label} ${r0(val)} / ${r0(max)} g</span><div><i style="width:${pct}%"></i></div></div>`;
}

function renderDay() {
  const day = S.day(state, date);
  const p = C.dayPlan(state.profile, state.weights, day);
  const left = p.target.kcal - p.eaten.kcal;
  $('#day-label').textContent = date === today
    ? "Aujourd'hui"
    : new Date(`${date}T12:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  $('#next').disabled = date >= today;
  $('#ring').innerHTML = ring(p.eaten.kcal / p.target.kcal, r0(Math.abs(left)), left >= 0 ? 'kcal restantes' : 'kcal en trop');
  $('#floor-warn').hidden = !p.target.floored;
  $('#macros').innerHTML = [['Protéines', 'protein'], ['Glucides', 'carbs'], ['Lipides', 'fat']]
    .map(([label, k]) => bar(label, p.eaten[k], p.macros[k])).join('');
  $('#burn').textContent = `Dépense : base ${r0(p.bmr)} + pas ${r0(p.steps)} + exercice ${r0(p.exercise)} + digestion ${r0(p.digestion)} · objectif ${r0(p.target.kcal)} kcal`;
  $('#steps').value = day.steps || '';
  $('#sync-status').textContent = !state.settings.gistId ? ''
    : syncFailed ? 'Synchro des pas impossible'
      : state.stepsSyncedAt ? `Pas de Santé mis à jour à ${new Date(state.stepsSyncedAt).toTimeString().slice(0, 5)}` : '';
  $('#meals').innerHTML = day.meals
    .map(m => `<li data-id="${m.id}"><span>${esc(m.time)} · ${esc(m.name)}</span><b>${r0(m.kcal)} kcal</b></li>`)
    .join('') || '<li class="empty">Aucun repas</li>';
  $('#exercises').innerHTML = day.exercises
    .map(x => `<li data-id="${x.id}"><span>${esc(x.name)}${x.minutes ? ` · ${x.minutes} min` : ''}</span><b>${r0(x.kcal)} kcal</b></li>`)
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
  if (n == null) return alert('Nombre de pas invalide (0 à 100 000).');
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
$('#onboard-form').onsubmit = e => {
  e.preventDefault();
  const d = new FormData(e.target);
  state.profile = readProfile(e.target);
  S.upsertWeight(state, { date: today, kg: +d.get('kg'), fatPct: optNum(d.get('fatPct')) });
  $('#dlg-onboard').close();
  commit();
};

// === Démarrage ===
show('day');
if (state.profile && state.weights.length) render();
else $('#dlg-onboard').showModal();
syncSteps();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (C.ymd() !== today) today = date = C.ymd();
  render();
  syncSteps();
});
