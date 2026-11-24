// Mail that cannot wait for the next delivery: verification codes, 2FA prompts, sign-in and
// password-reset links. Matched on a row's sender, subject and snippet, and on a notification's
// text. Loaded in Gmail's own page (for page.js), in the content script, and as CommonJS in Node.
(function (root) {
  const NAMED =
    /\b(verification|verify|verifying|security|sign[- ]?in|log[- ]?in|authentication|authorization|access|one[- ]?time|single[- ]use|confirmation|activation)\s+(code|passcode|password|pin|link|token)\b|\b(otp|2fa|mfa|passcode|magic link)\b|\b(two|2|multi)[- ]?(factor|step)\b/i;
  const ACTION =
    /\b(reset|recover|change)\s+(your\s+)?password\b|\bpassword\s+reset\b|\bverify\s+(your|it'?s\s+you|this|that\s+it'?s)\b|\bconfirm\s+(your\s+)?(e-?mail|account|identity|sign[- ]?in|log[- ]?in|device)\b|\bnew\s+(sign[- ]?in|log[- ]?in|device)\b|\b(sign|log)[- ]?in\s+(attempt|request)\b/i;
  // "Your code is 482913", "482913 is your code". A sale's "use code SPRING 2026" is not one.
  const DIGITS = /\bcode\b(\s+(is|to\s+[a-z -]{1,20}?))?\s*[:–-]?\s*\d{4,8}\b|\b\d{4,8}\s+is\s+your\b/i;
  const PROMO = /\b(promo|coupon|discount|sale|offer|save|off)\b|%/i;

  function isUrgent(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    if (!t.trim()) return false;
    return NAMED.test(t) || ACTION.test(t) || (DIGITS.test(t) && !PROMO.test(t));
  }

  const api = { isUrgent };
  root.FocusMailUrgent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
