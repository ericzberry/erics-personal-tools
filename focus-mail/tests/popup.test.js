// UI-66: the popup is drawn, not left to the browser's own controls.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

test('the on/off control is a switch, never a bare checkbox', () => {
  const html = src('popup.html');
  for (const input of html.match(/<input\b[^>]*type="checkbox"[^>]*>/g) || []) {
    assert.match(input, /role="switch"/, input);
  }
  assert.match(src('popup.css'), /\.switch\s*\{[^}]*appearance:\s*none/);
});

test('native time fields are hidden under their chips', () => {
  assert.doesNotMatch(src('popup.html'), /type="time"/);
  assert.match(src('popup.css'), /\.chip input\s*\{[^}]*opacity:\s*0/);
});
