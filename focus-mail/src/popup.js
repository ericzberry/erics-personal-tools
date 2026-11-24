const S = globalThis.FocusMailSchedule;
const $ = (id) => document.getElementById(id);

let settings = { ...S.DEFAULT_SETTINGS };
let manualCutoff = 0;

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const minutesLabel = (m) => clock(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));

function untilLabel(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `in ${h ? `${h}h ` : ''}${h && !m ? '' : `${m}m`}`.trim();
}

const ICON_X = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

// "5:00" and "PM" apart, so the figure can be set large and its period small.
function clockParts(t) {
  const parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(t));
  const period = parts.find((p) => p.type === 'dayPeriod');
  const time = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  return { time, period: period ? period.value : '' };
}

function renderNext() {
  const now = Date.now();
  const next = S.nextScheduled(now, settings.times);
  const on = settings.enabled;
  const box = document.querySelector('.next');
  box.classList.toggle('off', !on);
  box.classList.toggle('manual', on && !next);
  $('next-label').textContent = on ? 'Next delivery' : 'Holding is off';
  const { time, period } = on && next ? clockParts(next) : { time: '', period: '' };
  $('next-time').textContent = !on ? 'Mail arrives as it comes' : next ? time : 'Only when you deliver';
  $('next-period').textContent = period;
  $('next-in').textContent = on && next ? untilLabel(next - now) : '';
  // How far through the wait: from the last delivery (scheduled or Deliver now) to the next.
  const from = S.cutoff(now, settings, manualCutoff);
  const track = $('track');
  track.hidden = !(on && next && Number.isFinite(from) && from > 0 && next > from);
  if (!track.hidden) track.style.setProperty('--p', Math.min(1, Math.max(0, (now - from) / (next - from))).toFixed(4));
  // UI-16: an action that does not apply is hidden, not disabled.
  $('deliver').hidden = !on;
}

function renderTimes() {
  const list = $('times');
  list.replaceChildren();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = S.nextScheduled(Date.now(), settings.times);
  const nextMin = next ? new Date(next).getHours() * 60 + new Date(next).getMinutes() : null;

  S.normalizeTimes(settings.times).forEach((m) => {
    const li = document.createElement('li');
    li.className = 'chip';
    if (settings.enabled && m === nextMin) li.classList.add('upcoming');
    else if (m <= nowMin) li.classList.add('past');

    // The native time field stays hidden under the chip and supplies only its picker.
    const input = document.createElement('input');
    input.type = 'time';
    input.value = S.formatTime(m);
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => {
      if (!input.value) return;
      settings.times = settings.times.map((t) => (S.normalizeTimes([t])[0] === m ? input.value : t));
      save();
    });

    const time = document.createElement('button');
    time.type = 'button';
    time.className = 'time';
    time.textContent = minutesLabel(m);
    time.setAttribute('aria-label', `Change ${minutesLabel(m)}`);
    time.addEventListener('click', () => {
      try { input.showPicker(); } catch { input.focus(); }
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.innerHTML = ICON_X;
    remove.setAttribute('aria-label', `Remove ${minutesLabel(m)}`);
    remove.addEventListener('click', () => {
      settings.times = settings.times.filter((t) => S.normalizeTimes([t])[0] !== m);
      save();
    });

    li.append(input, time, remove);
    list.append(li);
  });

  const addItem = document.createElement('li');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add';
  add.innerHTML = ICON_PLUS;
  add.setAttribute('aria-label', 'Add time');
  add.addEventListener('click', () => {
    const used = new Set(S.normalizeTimes(settings.times));
    let m = 12 * 60;
    while (used.has(m)) m = (m + 60) % (24 * 60);
    settings.times = [...settings.times, S.formatTime(m)];
    save();
  });
  addItem.append(add);
  list.append(addItem);
}

function render() {
  $('enabled').checked = settings.enabled;
  renderTimes();
  renderNext();
}

function save() {
  settings.times = S.normalizeTimes(settings.times).map(S.formatTime);
  chrome.storage.sync.set({ settings });
  render();
}

$('enabled').addEventListener('change', (e) => {
  settings.enabled = e.target.checked;
  save();
});

$('deliver').addEventListener('click', () => {
  manualCutoff = Date.now();
  chrome.storage.local.set({ manualCutoff });
  renderNext();
  const btn = $('deliver');
  btn.textContent = 'Delivered';
  btn.classList.add('done');
  setTimeout(() => { btn.textContent = 'Deliver now'; btn.classList.remove('done'); }, 1800);
});

Promise.all([chrome.storage.sync.get('settings'), chrome.storage.local.get('manualCutoff')]).then(([sync, local]) => {
  settings = { ...S.DEFAULT_SETTINGS, ...((sync && sync.settings) || {}) };
  manualCutoff = Number(local && local.manualCutoff) || 0;
  render();
  document.body.classList.add('ready');
  // Keep the countdown and the track true while the popup stays open. The chips are left alone:
  // redrawing them would close a time picker that is open.
  setInterval(renderNext, 20 * 1000);
});
