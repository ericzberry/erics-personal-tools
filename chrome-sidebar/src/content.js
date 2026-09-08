(() => {
  let timer, stopped = false, lastSignature = '', lastSent = 0;
  async function capture() {
    if (stopped) return;
    const snapshot = EspnDraftReader.read(document, location.href);
    if (!snapshot) return;
    const signature = JSON.stringify(snapshot);
    if (signature === lastSignature && Date.now() - lastSent < 5000) return;
    try {
      const response = await chrome.runtime.sendMessage({type: 'DRAFT_SNAPSHOT', snapshot});
      if (!response?.ok) return;
      // Capture is acknowledged independently of optional page decoration.
      lastSignature = signature;
      lastSent = Date.now();
      try {
        if(response.highlights)globalThis.EspnPageHighlights?.receive(response.highlights);
        else if(response.highlightError)globalThis.EspnPageHighlights?.receive({clear:true});
      } catch { /* Page rendering must never interrupt the capture lifecycle. */ }
    } catch (error) {
      if (!/Extension context invalidated/i.test(error.message || '')) return;
      // Reloading an unpacked extension invalidates existing content scripts.
      stopped = true;
      observer.disconnect();
      clearInterval(heartbeat);
    }
  }
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; capture(); }, 300);
  });
  observer.observe(document.body, {subtree: true, childList: true, characterData: true});
  const heartbeat = setInterval(capture, 5000);
  capture();
})();
