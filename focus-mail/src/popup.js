const S = globalThis.FocusMailSchedule;
const $ = (id) => document.getElementById(id);

let settings = { ...S.DEFAULT_SETTINGS };

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

function renderNext() {
  const now = Date.now();
  const next = S.nextScheduled(now, settings.times);
  const box = document.querySelector('.next');
  box.classList.toggle('off', !settings.enabled);
  $('next-label').textContent = settings.enabled ? 'Next delivery' : 'Holding is off';
  $('next-time').textContent = !settings.enabled
    ? 'Mail arrives as it comes'
    : next ? clock(next) : 'Only when you deliver';
  $('next-in').textContent = settings.enabled && next ? untilLabel(next - now) : '';
  // UI-16: an action that does not apply is hidden, not disabled.
  $('deliver').hidden = !settings.enabled;
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
  chrome.storage.local.set({ manualCutoff: Date.now() });
  const btn = $('deliver');
  btn.textContent = 'Delivered';
  btn.classList.add('done');
  setTimeout(() => { btn.textContent = 'Deliver now'; btn.classList.remove('done'); }, 1800);
});

chrome.storage.sync.get('settings').then(({ settings: s }) => {
  settings = { ...S.DEFAULT_SETTINGS, ...(s || {}) };
  render();
});
