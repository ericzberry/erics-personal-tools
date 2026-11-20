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
const heldFlags = (doc) => [...doc.querySelectorAll('tr.zA')].map((r) => r.hasAttribute('data-focusmail-held'));

test('holds only rows after the cutoff, and only in the inbox views', () => {
  const doc = inbox();
  assert.equal(C.applyToRows(doc, at(11, 0), '#inbox'), 3);
  assert.deepEqual(heldFlags(doc), [false, true, true, true, false]);

  assert.equal(C.applyToRows(doc, at(11, 0), '#search/invoice'), 0);
  assert.deepEqual(heldFlags(doc), [false, false, false, false, false]);

  assert.equal(C.applyToRows(doc, at(12, 7), '#category/promotions'), 1);
  assert.equal(C.applyToRows(doc, Infinity, '#inbox'), 0);
});

test('recognizes held views', () => {
  for (const h of ['', '#inbox', '#inbox/p2', '#category/social', '#category/updates/p3']) assert.ok(C.isHeldView(h), h);
  for (const h of ['#sent', '#drafts', '#search/x', '#label/Work', '#inbox/FMfcgzQ123', '#all']) assert.ok(!C.isHeldView(h), h);
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
