const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { parseHTML } = createRequire(path.join(__dirname, '../../chrome-sidebar/package.json'))('linkedom');
global.FocusMailSchedule = require('../src/schedule.js');
const { isUrgent } = require('../src/urgent.js');
const C = require('../src/content.js');

test('verification codes, 2FA and sign-in mail are urgent', () => {
  for (const t of [
    'Your verification code is 482913',
    'Google Verification Code',
    '482913 is your Slack code',
    'Your one-time passcode',
    'Microsoft account security code',
    'Use this code to sign in: 9931',
    'Two-factor authentication code',
    '2-Step Verification',
    'Your OTP for transaction',
    'Reset your password',
    'Password reset request',
    'Verify your email address',
    'Confirm your email',
    'New sign-in on Mac',
    'Your magic link to log in',
    'Your login code for Notion',
    'Chase: Your single-use code',
  ]) assert.ok(isUrgent(t), t);
});

test('ordinary mail and promotions are not', () => {
  for (const t of [
    '',
    'Lunch on Thursday?',
    'Q3 board deck — draft 4',
    'Use code SPRING for 20% off through 2026',
    'Promo code inside: save 1500 points',
    'Your order 48291033 has shipped',
    'Invoice 20931 from Acme',
    'Code review for PR 4821',
    'Security update for your building',
  ]) assert.ok(!isUrgent(t), t);
});

test('an urgent row is never held, and is not counted as delivered', () => {
  const at = (h, mi) => new Date(2026, 10, 20, h, mi).getTime();
  const row = (subject) => `<tr class="zA zE"><td class="yX"><span>Sender</span></td>
    <td><span class="bog">${subject}</span><span class="y2">snippet</span></td>
    <td class="xW xY"><span title="Fri, Nov 20, 2026, 12:05 PM">x</span></td></tr>`;
  const doc = parseHTML(`<html><body><table>${row('Your verification code is 482913')}${row('Lunch?')}</table></body></html>`).document;
  assert.equal(C.applyToRows(doc, at(11, 0), '#inbox'), 1);
  assert.deepEqual([...doc.querySelectorAll('tr.zA')].map((r) => r.hasAttribute(C.HELD)), [false, true]);
  assert.equal(C.countReleased(doc, at(11, 0), at(14, 0)), 1);
});
