const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

// linkedom is already installed for the sidebar's tests; borrow it rather than adding a package here.
const { parseHTML } = createRequire(path.join(__dirname, '../../chrome-sidebar/package.json'))('linkedom');
global.FocusMailSchedule = require('../src/schedule.js');
const C = require('../src/content.js');

const at = (h, mi) => new Date(2026, 10, 20, h, mi).getTime();
const row = (title, unread) =>
  `<tr class="zA ${unread ? 'zE' : 'yO'}"><td class="xW xY"><span title="${title}">x</span></td></tr>`;

function inbox() {
  return parseHTML(`<html><body><table>
    ${row('Fri, Nov 20, 2026, 9:00 AM', false)}
    ${row('Fri, Nov 20, 2026, 11:20 AM', true)}
    ${row('Fri, Nov 20, 2026, 12:05 PM', true)}
    ${row('Fri, Nov 20, 2026, 12:10 PM', false)}
    <tr class="zA"><td class="xW xY"><span>no title</span></td></tr>
  </table></body></html>`).document;
}
const heldFlags = (doc) => [...doc.querySelectorAll('tr.zA')].map((r) => r.hasAttribute(C.HELD));

test('holds only rows after the cutoff, and only in the inbox views', () => {
  const doc = inbox();
  assert.equal(C.applyToRows(doc, at(11, 0), '#inbox'), 3);
  assert.deepEqual(heldFlags(doc), [false, true, true, true, false]);

  assert.equal(C.applyToRows(doc, at(11, 0), '#search/invoice'), 0);
  assert.deepEqual(heldFlags(doc), [false, false, false, false, false]);

  assert.equal(C.applyToRows(doc, at(12, 7), '#category/promotions'), 1);
  assert.equal(C.applyToRows(doc, Infinity, '#inbox'), 0);
});

// A copy from before 0.1.3 can outlive an extension reload in a tab that was never reloaded, and
// keeps marking rows `data-focusmail-held` from the cutoff it froze with. After Deliver now it and
// the current copy disagreed, and the rows flickered. Its mark must hide nothing and be left alone.
test('a stale older copy\'s row mark hides nothing', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(path.join(__dirname, '../src/content.css'), 'utf8');
  assert.notEqual(C.HELD, 'data-focusmail-held');
  assert.ok(css.includes(`tr.zA[${C.HELD}]`));
  assert.ok(!css.includes('data-focusmail-held'));

  const doc = inbox();
  for (const r of doc.querySelectorAll('tr.zA')) r.setAttribute('data-focusmail-held', '');
  assert.equal(C.applyToRows(doc, at(12, 7), '#inbox'), 1);
  assert.deepEqual(heldFlags(doc), [false, false, false, true, false]);
});

test('recognizes held views', () => {
  for (const h of [
    '', '#inbox', '#inbox/p2', '#category/social', '#category/updates/p3',
    // Compose open over the inbox, and a thread open in the reading pane beside the list.
    '#inbox?compose=new', '#inbox/p2?compose=abc', '#category/social?compose=new', '#inbox/FMfcgzQ123',
    '?compose=new',
  ]) assert.ok(C.isHeldView(h), h);
  for (const h of ['#sent', '#drafts', '#search/x', '#search/x?compose=new', '#label/Work', '#all', '#inboxy']) {
    assert.ok(!C.isHeldView(h), h);
  }
});

test('counts the unread mail a delivery releases', () => {
  const doc = inbox();
  assert.equal(C.countReleased(doc, at(11, 0), at(14, 0)), 2);
  assert.equal(C.countReleased(doc, at(12, 0), at(12, 7)), 1);
  assert.equal(C.countReleased(doc, at(14, 0), at(17, 0)), 0);
});

test('strips the unread count from the tab title and finds the account', () => {
  assert.equal(C.stripCount('Inbox (1,204) - me@example.com - Gmail'), 'Inbox - me@example.com - Gmail');
  assert.equal(C.stripCount('Inbox - me@example.com - Gmail'), 'Inbox - me@example.com - Gmail');
  assert.equal(C.accountFromTitle('Inbox (3) - me.x@example.co.uk - Gmail'), 'me.x@example.co.uk');
});

test('closes the AI Inbox while mail is held', () => {
  for (const h of ['#aiinbox', 'aiinbox', '#aiinbox/p2']) assert.ok(C.isClosedView(h), h);
  for (const h of ['#inbox', '#aiinbox/FMfcgzQ123', '#search/aiinbox']) assert.ok(!C.isClosedView(h), h);
});
