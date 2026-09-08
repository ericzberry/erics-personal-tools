chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'READ_CURRENT_EMAIL') return;
  try { respond({email: GmailReader.read(document, location.href)}); }
  catch { respond({error: 'Could not read this email. Reload Gmail and try again.'}); }
});
