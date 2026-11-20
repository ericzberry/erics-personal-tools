const S = globalThis.FocusMailSchedule;
const $ = (id) => document.getElementById(id);

let settings = { ...S.DEFAULT_SETTINGS };

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function renderStatus() {
  const next = S.nextScheduled(Date.now(), settings.times);
  $('status').textContent = !settings.enabled
    ? 'Off — new mail shows as it arrives.'
    : next
      ? `Next delivery ${clock(next)}.`
      : 'No delivery times — mail waits for Deliver now.';
  $('deliver').disabled = !settings.enabled;
}

function renderTimes() {
  const list = $('times');
  list.replaceChildren();
  S.normalizeTimes(settings.times).forEach((m) => {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.type = 'time';
    input.value = S.formatTime(m);
    input.setAttribute('aria-label', 'Delivery time');
    input.addEventListener('change', () => {
      settings.times = settings.times.map((t) => (S.normalizeTimes([t])[0] === m ? input.value : t));
      save();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${input.value}`);
    remove.addEventListener('click', () => {
      settings.times = settings.times.filter((t) => S.normalizeTimes([t])[0] !== m);
      save();
    });
    li.append(input, remove);
    list.append(li);
  });
}

function render() {
  $('enabled').checked = settings.enabled;
  renderTimes();
  renderStatus();
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

$('add').addEventListener('click', () => {
  const used = new Set(S.normalizeTimes(settings.times));
  let m = 12 * 60;
  while (used.has(m)) m = (m + 60) % (24 * 60);
  settings.times = [...settings.times, S.formatTime(m)];
  save();
});

$('deliver').addEventListener('click', () => {
  chrome.storage.local.set({ manualCutoff: Date.now() });
  $('status').textContent = 'Delivered. Held again from now.';
});

chrome.storage.sync.get('settings').then(({ settings: s }) => {
  settings = { ...S.DEFAULT_SETTINGS, ...(s || {}) };
  render();
});
