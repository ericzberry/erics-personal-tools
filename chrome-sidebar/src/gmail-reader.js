/* Read only the latest expanded message, not the inbox or hidden application state. */
var GmailReader = (() => {
  function read(doc, href, visible = el => !!el.getClientRects().length) {
    const url = new URL(href);
    if (url.origin !== 'https://mail.google.com') return null;
    const subject = [...doc.querySelectorAll('h2.hP')].find(visible);
    const bodies = [...doc.querySelectorAll('.a3s')].filter(visible);
    const body = bodies.at(-1);
    if (!subject || !body) return null;
    const sender = body.closest('.gs')?.querySelector('.gD[email]');
    if (!sender) return null;
    const text = (body.innerText ?? body.textContent ?? '').trim();
    if (!text) return null;
    if (text.length > 20000) return {error: 'This message is too long for local AI (20,000 character limit).'};
    return {subject: subject.textContent.trim(), from: sender.getAttribute('email'), name: sender.textContent.trim(), text, url: href};
  }
  return {read};
})();
